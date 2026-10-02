-- Asserções sobre o esquema e os seeds. Falham alto: qualquer `assert` falso
-- aborta e devolve código de erro ao CI.
--
-- As regras que atravessam tabelas vivem aqui, e não em constraints — é
-- onde as desta casa (e as do Coreto) sempre viveram. O que compara a base
-- com os ficheiros `regiao.yaml` não cabe em SQL e está em
-- `ferramentas/verificar-seeds.py`, que o CI corre a seguir a isto.
\set ON_ERROR_STOP on

do $$
declare
  n integer;
  b boolean;
  r record;
begin
  -- ---- Regiões ----
  select count(*) into n from public.regions where is_enabled;
  assert n >= 1, 'não há uma única região ligada';

  -- Um alias redireciona; um canónico serve. O mesmo host nas duas listas era
  -- um laço de redirecionamento.
  select count(*) into n
    from public.region_domain_aliases alias_
    join public.regions reg on reg.domain = alias_.domain;
  assert n = 0, format('%s alias de domínio são também canónicos de uma região', n);

  -- Os domínios são subdomínios de um só produto, ou domínios próprios de uma
  -- autoridade: nunca um `*.vercel.app`, que não é de ninguém.
  select count(*) into n from public.regions where domain like '%.vercel.app';
  assert n = 0, format('%s regiões com domínio *.vercel.app', n);

  -- ---- Módulos ----
  -- A tabela só guarda o que está desligado (e o que voltou a ligar-se
  -- depois de desligado). Uma linha `true` nunca vem de uma migração —
  -- só do painel, por `set_modulo`.
  select count(*) into n from public.modulos where is_enabled and updated_by is null;
  assert n = 0, format('%s módulos ligados sem autor — uma migração não escreve isso', n);

  -- ---- Licenças ----
  -- Cada região de demonstração tem licença sem prazo; o resto não se exige,
  -- porque uma região sem contrato assinado não tem linha, e é a verdade.
  for r in select id from public.regions where id like 'prova%' or id = 'demo' loop
    select count(*) into n from public.region_licenses
     where region_id = r.id and kind = 'demo' and ends_on is null;
    assert n >= 1, format('%s: a região de demonstração devia nascer com licença «demo» sem prazo', r.id);
  end loop;

  -- ---- Os avisos de exemplo ----
  -- Uma migração só semeia avisos na demonstração, publicados, e a dizer que
  -- são exemplos. Um aviso inventado sem essa marca, ou noutra região, era
  -- uma ocorrência falsa a ler-se como verdadeira.
  select count(*) into n from public.avisos
   where created_by like 'migracao-%'
     and (region_id <> 'demo' or not publicado or titulo not like 'Exemplo:%');
  assert n = 0, format('%s avisos semeados por migração fora da demonstração ou sem a marca', n);

  -- ---- As funções de escrita fazem o que prometem ----
  -- Ligar o que já está ligado não é um acontecimento.
  assert not public.set_modulo('prova', 'taxi', true, 'schema-checks'),
    'ligar um módulo já ligado devia devolver false';
  -- Desligar cria a linha e deixa rasto.
  assert public.set_modulo('prova', 'taxi', false, 'schema-checks'),
    'desligar um módulo ligado devia devolver true';
  select count(*) into n from public.modulos where region_id = 'prova' and id = 'taxi' and not is_enabled;
  assert n = 1, 'o módulo desligado devia ter uma linha a false';
  select count(*) into n from public.admin_actions where action = 'module.disable' and entity_id = 'prova/taxi';
  assert n = 1, 'desligar um módulo devia deixar uma linha de auditoria';
  -- E volta a ligar-se, com rasto.
  assert public.set_modulo('prova', 'taxi', true, 'schema-checks'),
    'voltar a ligar devia devolver true';
  select count(*) into n from public.admin_actions where action = 'module.enable' and entity_id = 'prova/taxi';
  assert n = 1, 'voltar a ligar devia deixar uma linha de auditoria';

  -- Um módulo que não existe é recusado com a frase em português.
  begin
    perform public.set_modulo('prova', 'teleferico', false, 'schema-checks');
    assert false, 'um módulo desconhecido devia ser recusado';
  exception when others then
    assert sqlerrm like 'não há módulo com o identificador%',
      format('a recusa devia dizer qual: %s', sqlerrm);
  end;

  -- Uma região desliga-se e volta a ligar-se, mas nunca a última.
  assert public.set_region_enabled('prova-municipio', false, 'schema-checks'),
    'desligar uma região ligada devia devolver true';
  assert public.set_region_enabled('prova-municipio', true, 'schema-checks'),
    'voltar a ligar devia devolver true';
  select count(*) into n from public.admin_actions where entity_type = 'region' and entity_id = 'prova-municipio';
  assert n = 2, format('esperava duas linhas de auditoria da região, há %s', n);

  -- Sem autor, nada se escreve.
  begin
    perform public.set_region_enabled('prova', false, '');
    assert false, 'uma ação sem autor devia ser recusada';
  exception when others then
    assert sqlerrm like 'sem autor%', format('a recusa devia falar do autor: %s', sqlerrm);
  end;

  -- ---- A região nasce no painel (0006) ----
  -- Nasce DESLIGADA, com o domínio normalizado e com rasto.
  assert public.create_region('prova-checks', 'Prova das Checks', 'a',
                              ' Prova-Checks.Paragem.PT ', 99, 'schema-checks') = 'prova-checks',
    'create_region devia devolver o identificador';
  select count(*) into n from public.regions
   where id = 'prova-checks' and not is_enabled and domain = 'prova-checks.paragem.pt';
  assert n = 1, 'a região nova devia nascer desligada, com o domínio em minúsculas e sem espaços';
  select count(*) into n from public.admin_actions
   where action = 'region.create' and entity_id = 'prova-checks';
  assert n = 1, 'criar uma região devia deixar uma linha de auditoria';

  -- Um identificador que não serve é recusado com a frase em português.
  begin
    perform public.create_region('Prova Checks', 'x', 'a', 'x.paragem.pt', 0, 'schema-checks');
    assert false, 'um identificador com maiúsculas e espaços devia ser recusado';
  exception when others then
    assert sqlerrm like 'o identificador%',
      format('a recusa devia falar do identificador: %s', sqlerrm);
  end;

  -- O canónico de outra região não se repete.
  begin
    perform public.create_region('prova-checks-2', 'x', 'a', 'prova.paragem.pt', 0, 'schema-checks');
    assert false, 'o canónico de outra região devia ser recusado';
  exception when others then
    assert sqlerrm like 'o domínio % já é o canónico%',
      format('a recusa devia falar do domínio: %s', sqlerrm);
  end;

  -- Um alias entra uma vez, e nunca pode ser um canónico.
  assert public.add_region_alias('www.prova-checks.paragem.pt', 'prova-checks', 'schema-checks'),
    'acrescentar um alias devia devolver true';
  assert not public.add_region_alias('www.prova-checks.paragem.pt', 'prova-checks', 'schema-checks'),
    'acrescentar o mesmo alias outra vez devia devolver false';
  begin
    perform public.add_region_alias('prova.paragem.pt', 'prova-checks', 'schema-checks');
    assert false, 'um canónico não pode ser alias';
  exception when others then
    assert sqlerrm like '%é o canónico de uma região%',
      format('a recusa devia dizer porquê: %s', sqlerrm);
  end;

  -- O domínio muda; o antigo fica a redirecionar quando se pede; um alias
  -- promovido a canónico deixa de ser alias — o mesmo host nas duas listas
  -- era um laço.
  assert public.set_region_domain('prova-checks', 'checks.exemplo.pt', true, 'schema-checks'),
    'mudar o domínio devia devolver true';
  select count(*) into n from public.region_domain_aliases
   where domain = 'prova-checks.paragem.pt' and region_id = 'prova-checks';
  assert n = 1, 'o domínio antigo devia ter ficado como alias';
  assert not public.set_region_domain('prova-checks', 'checks.exemplo.pt', false, 'schema-checks'),
    'mudar para o domínio que já era devia devolver false';
  assert public.set_region_domain('prova-checks', 'www.prova-checks.paragem.pt', false, 'schema-checks'),
    'promover um alias a canónico devia devolver true';
  select count(*) into n from public.region_domain_aliases
   where domain = 'www.prova-checks.paragem.pt';
  assert n = 0, 'um alias promovido a canónico devia deixar de ser alias';
  select count(*) into n from public.admin_actions
   where action = 'region.domain' and entity_id = 'prova-checks';
  assert n = 2, format('esperava duas linhas de auditoria de domínio, há %s', n);

  -- E um alias sai — uma vez.
  assert public.remove_region_alias('prova-checks.paragem.pt', 'schema-checks'),
    'retirar um alias devia devolver true';
  assert not public.remove_region_alias('prova-checks.paragem.pt', 'schema-checks'),
    'retirar o que não há devia devolver false';

  -- A região nova liga-se como as outras.
  assert public.set_region_enabled('prova-checks', true, 'schema-checks'),
    'ligar a região nova devia devolver true';

  -- ---- O limite de tentativas (0005) ----
  for i in 1..2 loop
    select allowed into b from public.rate_limit_hit('schema-checks:balde', 900, 2);
    assert b, format('a tentativa %s devia caber no limite', i);
  end loop;
  select allowed, hits into b, n from public.rate_limit_hit('schema-checks:balde', 900, 2);
  assert not b and n = 3, 'a terceira tentativa devia ser recusada, e contada';
  begin
    perform public.rate_limit_hit('', 900, 2);
    assert false, 'um balde vazio devia ser recusado';
  exception when others then
    assert sqlerrm like 'sem balde%', format('a recusa devia falar do balde: %s', sqlerrm);
  end;

  -- O que as verificações acima escreveram sai daqui: a base que o CI deixa
  -- é a base que uma instalação nova teria.
  delete from public.modulos where region_id = 'prova' and id = 'taxi';
  delete from public.regions where id = 'prova-checks';  -- leva os alias consigo
  delete from public.rate_limits where bucket like 'schema-checks:%';
  delete from public.admin_actions where actor = 'schema-checks';
end $$;

-- As tabelas privadas não têm uma única policy: só a chave de serviço lê.
do $$
declare
  n integer;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('admin_actions', 'region_licenses', 'rate_limits',
                       'admin_pessoas', 'admin_papeis', 'admin_convites');
  assert n = 0, format('%s policies em tabelas que deviam ser só da chave de serviço', n);

  -- E a dos avisos tem UMA, de leitura, e só do que está publicado. Uma
  -- policy a mais aqui — ou um `using` que deixasse passar rascunhos — punha
  -- no ar o que alguém ainda estava a escrever.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'avisos';
  assert n = 1, format('os avisos deviam ter uma policy e têm %s', n);
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'avisos'
     and policyname = 'avisos_public_read' and cmd = 'SELECT'
     and qual = 'publicado';
  assert n = 1, 'a policy dos avisos devia ser select using (publicado)';

  -- E as públicas têm RLS ligada, sem exceção.
  select count(*) into n from pg_tables t
   where t.schemaname = 'public'
     and t.tablename in ('regions', 'region_domain_aliases', 'modulos', 'admin_actions',
                         'region_licenses', 'rate_limits', 'avisos',
                         'admin_pessoas', 'admin_papeis', 'admin_convites',
                         'region_contactos')
     and not t.rowsecurity;
  assert n = 0, format('%s tabelas sem RLS', n);

  -- E as das pessoas não se leem com a chave pública — nem a linha, nem o
  -- hash da palavra-passe que lá vive. Prova-se perguntando com o papel com
  -- que o sítio pergunta, e não lendo os `grant`.
  assert not has_table_privilege('anon', 'public.admin_pessoas', 'select'),
    'a chave pública não pode ler as pessoas do painel';
  assert not has_table_privilege('anon', 'public.admin_convites', 'select'),
    'a chave pública não pode ler as ligações de ativação';
  assert not has_function_privilege('anon', 'public.ativar_com_convite(text, text, text)', 'execute'),
    'a chave pública não pode ativar contas: é o servidor que o faz';
end $$;

-- ---------------------------------------------------------------------------
-- OS AVISOS (0007). O que se afirma é o que custa caro se falhar: um aviso
-- nasce por publicar, publicar é idempotente, e a forma é a do GTFS-RT.
do $$
declare
  v_id uuid;
  n    integer;
begin
  perform public.create_region('checks-avisos', 'Checks', 'a', 'checks-avisos', 98, 'schema-checks');

  -- NASCE POR PUBLICAR. Quem redige a meio de uma ocorrência não devia ter de
  -- escolher entre gravar a meio e mostrar a meio.
  select public.upsert_aviso(
    null, 'checks-avisos', 'Título', 'Texto', 'SEVERE', 'CONSTRUCTION', 'DETOUR',
    null, null, '{}', '{}', '{}', null, 'schema-checks'
  ) into v_id;
  select count(*) into n from public.avisos where id = v_id and not publicado;
  assert n = 1, 'um aviso devia nascer por publicar';

  -- PUBLICAR DUAS VEZES REGISTA UMA. Senão o rasto conta gestos que ninguém
  -- fez, e deixa de servir para responder «desde quando é que isto esteve no ar».
  -- UM RASCUNHO NÃO EXISTE PARA QUEM PERGUNTA DE FORA. Isto não se prova a
  -- ler a policy: prova-se a perguntar com o papel com que o sítio pergunta.
  -- Se falhar, o que está a acontecer é que meio texto escrito a correr, a
  -- meio de uma ocorrência, está no ar antes de alguém o ter decidido.
  execute 'set local role anon';
  select count(*) into n from public.avisos where id = v_id;
  execute 'reset role';
  assert n = 0, 'um rascunho não devia ser visível com a chave pública';

  perform public.set_aviso_publicado(v_id, true, 'schema-checks');
  perform public.set_aviso_publicado(v_id, true, 'schema-checks');
  select count(*) into n from public.admin_actions
   where entity_type = 'aviso' and action = 'aviso.publish' and entity_id = v_id::text;
  assert n = 1, format('publicar duas vezes registou %s gestos', n);

  -- E publicado existe — senão a policy estaria a fechar tudo, e o feed saía
  -- vazio em cima de uma greve.
  execute 'set local role anon';
  select count(*) into n from public.avisos where id = v_id;
  execute 'reset role';
  assert n = 1, 'um aviso publicado devia ser visível com a chave pública';

  -- A GRAVIDADE É A DO GTFS-RT, e um valor de fora rebenta na escrita — onde
  -- há uma pessoa para o corrigir — e não na leitura, onde há uma aplicação
  -- de outra gente.
  begin
    perform public.upsert_aviso(
      null, 'checks-avisos', 'T', 'X', 'GRAVISSIMO', 'CONSTRUCTION', 'DETOUR',
      null, null, '{}', '{}', '{}', null, 'schema-checks'
    );
    assert false, 'uma gravidade de fora do GTFS-RT devia ser recusada';
  exception when check_violation then null;
  end;

  -- UM AVISO NÃO MUDA DE REGIÃO. Movê-lo por engano é publicar a greve de um
  -- território no sítio de outro.
  perform public.create_region('checks-avisos-2', 'Checks 2', 'a', 'checks-avisos-2', 97, 'schema-checks');
  begin
    perform public.upsert_aviso(
      v_id, 'checks-avisos-2', 'T', 'X', 'INFO', 'CONSTRUCTION', 'DETOUR',
      null, null, '{}', '{}', '{}', null, 'schema-checks'
    );
    assert false, 'um aviso não devia poder mudar de região';
  exception when others then
    assert sqlerrm like '%não muda de região%', format('a recusa devia falar da região: %s', sqlerrm);
  end;

  -- APAGAR GUARDA O QUE APAGOU. Apagar não é esquecer.
  perform public.delete_aviso(v_id, 'schema-checks');
  select count(*) into n from public.admin_actions
   where action = 'aviso.delete' and entity_id = v_id::text
     and before ->> 'titulo' = 'Título';
  assert n = 1, 'o rasto de apagar devia guardar o aviso inteiro';

  delete from public.regions where id in ('checks-avisos', 'checks-avisos-2');
  delete from public.admin_actions where actor = 'schema-checks';
end $$;

-- ---------------------------------------------------------------------------
-- AS PESSOAS DO PAINEL (0009). O que se afirma é o que tranca alguém fora ou
-- deixa alguém entrar onde não devia: uma ligação serve uma vez, expira,
-- morre com a pessoa desativada, e a auditoria escreve QUEM — nunca o token
-- nem a palavra-passe.
do $$
declare
  v_id    uuid;
  v_outra uuid;
  v_ate   timestamptz;
  n       integer;
  b       boolean;
  r       record;
  -- Dois «tokens» de brincar, já reduzidos ao sha256 — é só isso que a base vê.
  t1 text := repeat('a', 64);
  t2 text := repeat('b', 64);
  t3 text := repeat('c', 64);
  h  text := 'scrypt$16384$8$1$c2FsLWRlLXRlc3Rl$aGFzaC1kZS10ZXN0ZQ==';
begin
  perform public.create_region('checks-pessoas', 'Checks', 'a', 'checks-pessoas', 96, 'schema-checks');
  perform public.create_region('checks-pessoas-2', 'Checks 2', 'a', 'checks-pessoas-2', 95, 'schema-checks');

  -- NASCE EM MINÚSCULAS, SEM PALAVRA-PASSE E SEM PAPÉIS, com rasto.
  select public.create_pessoa(' Ana.Teste@Exemplo.PT ', 'Ana Teste', 'schema-checks') into v_id;
  select count(*) into n from public.admin_pessoas
   where id = v_id and email = 'ana.teste@exemplo.pt' and senha_hash is null and ativada_em is null;
  assert n = 1, 'a pessoa devia nascer com o email em minúsculas e sem palavra-passe';
  select count(*) into n from public.admin_actions
   where action = 'pessoa.create' and entity_id = v_id::text;
  assert n = 1, 'criar uma pessoa devia deixar uma linha de auditoria';

  -- O MESMO EMAIL NÃO ENTRA DUAS VEZES, com outra caixa: é a mesma caixa de correio.
  begin
    perform public.create_pessoa('ANA.TESTE@exemplo.pt', 'Outra Ana', 'schema-checks');
    assert false, 'o mesmo email devia ser recusado';
  exception when others then
    assert sqlerrm like 'já há uma pessoa com o email%', format('a recusa devia dizer qual: %s', sqlerrm);
  end;
  begin
    perform public.create_pessoa('isto-nao-e-um-email', 'X', 'schema-checks');
    assert false, 'um email ilegível devia ser recusado';
  exception when others then
    assert sqlerrm like 'o email%', format('a recusa devia falar do email: %s', sqlerrm);
  end;

  -- OS PAPÉIS: dá-se, muda-se, tira-se — e o mesmo gesto duas vezes é um só.
  assert public.set_papel(v_id, 'checks-pessoas', 'editor', 'schema-checks'),
    'dar um papel devia devolver true';
  assert not public.set_papel(v_id, 'checks-pessoas', 'editor', 'schema-checks'),
    'dar o mesmo papel outra vez devia devolver false';
  assert public.set_papel(v_id, 'checks-pessoas', 'gestor', 'schema-checks'),
    'mudar de papel devia devolver true';
  assert public.set_papel(v_id, 'checks-pessoas', null, 'schema-checks'),
    'tirar o papel devia devolver true';
  select count(*) into n from public.admin_papeis where pessoa_id = v_id;
  assert n = 0, 'tirar o papel devia apagar a linha';
  select count(*) into n from public.admin_actions
   where action = 'pessoa.papel' and entity_id = v_id::text;
  assert n = 3, format('esperava três linhas de auditoria de papéis, há %s', n);
  begin
    perform public.set_papel(v_id, 'checks-pessoas', 'dono', 'schema-checks');
    assert false, 'um papel que não existe devia ser recusado';
  exception when others then
    assert sqlerrm like 'o papel tem de ser%', format('a recusa devia dizer quais: %s', sqlerrm);
  end;
  perform public.set_papel(v_id, 'checks-pessoas', 'editor', 'schema-checks');

  -- A LIGAÇÃO: só o hash entra, e o rasto não o leva.
  begin
    perform public.create_convite(v_id, 'token-em-claro', 'schema-checks');
    assert false, 'um token em claro devia ser recusado';
  exception when others then
    assert sqlerrm like '%sha256%', format('a recusa devia falar do sha256: %s', sqlerrm);
  end;
  select public.create_convite(v_id, t1, 'schema-checks') into v_ate;
  assert v_ate > now() + interval '6 days' and v_ate <= now() + interval '7 days',
    'a ligação devia valer sete dias';
  select count(*) into n from public.admin_actions
   where action = 'pessoa.convite' and entity_id = v_id::text
     and (coalesce(before::text, '') || coalesce(after::text, '')) not like '%' || t1 || '%';
  assert n = 1, 'gerar uma ligação devia deixar rasto, e o rasto não pode levar o token';

  -- UMA LIGAÇÃO NOVA ANULA A QUE ESTAVA POR USAR: a que se perdeu deixa de servir.
  perform public.create_convite(v_id, t2, 'schema-checks');
  begin
    perform public.ativar_com_convite(t1, h);
    assert false, 'uma ligação substituída devia ser recusada';
  exception when others then
    assert sqlerrm like 'esta ligação não é válida%', format('a recusa devia dizê-lo: %s', sqlerrm);
  end;

  -- ATIVAR: a palavra-passe fica, a ligação gasta-se, e o rasto é da própria pessoa.
  select * into r from public.ativar_com_convite(t2, h);
  assert r.id = v_id and r.email = 'ana.teste@exemplo.pt', 'ativar devia devolver a pessoa';
  select count(*) into n from public.admin_pessoas
   where id = v_id and senha_hash = h and ativada_em is not null;
  assert n = 1, 'ativar devia guardar o hash e a data de ativação';
  select count(*) into n from public.admin_actions
   where action = 'pessoa.activate' and entity_id = v_id::text
     and actor = 'Ana Teste · ana.teste@exemplo.pt'
     and (coalesce(before::text, '') || coalesce(after::text, '')) not like '%scrypt%';
  assert n = 1, 'a ativação devia ficar em nome da pessoa, sem o hash no rasto';
  begin
    perform public.ativar_com_convite(t2, h);
    assert false, 'uma ligação usada devia ser recusada';
  exception when others then
    assert sqlerrm like 'esta ligação já foi usada%', format('a recusa devia dizê-lo: %s', sqlerrm);
  end;

  -- UMA LIGAÇÃO FORA DE PRAZO NÃO SERVE. O prazo não se consegue envelhecer
  -- pela função; envelhece-se à mão, aqui e só aqui.
  perform public.create_convite(v_id, t3, 'schema-checks');
  update public.admin_convites set expira_em = now() - interval '1 minute' where token_hash = t3;
  begin
    perform public.ativar_com_convite(t3, h);
    assert false, 'uma ligação expirada devia ser recusada';
  exception when others then
    assert sqlerrm like 'esta ligação expirou%', format('a recusa devia dizê-lo: %s', sqlerrm);
  end;
  -- Uma segunda vez a mesma: é a palavra-passe nova, e o rasto diz que é.
  update public.admin_convites set expira_em = now() + interval '1 day' where token_hash = t3;
  perform public.ativar_com_convite(t3, h);
  select count(*) into n from public.admin_actions
   where action = 'pessoa.password' and entity_id = v_id::text;
  assert n = 1, 'uma ligação para quem já estava ativada devia registar-se como palavra-passe nova';

  -- O ACESSO fica registado — da pessoa e do dono.
  perform public.registar_acesso(v_id, 'Ana Teste · ana.teste@exemplo.pt');
  -- O do dono vai em nome destas verificações, para sair com elas no fim.
  perform public.registar_acesso(null, 'schema-checks');
  select count(*) into n from public.admin_pessoas where id = v_id and ultimo_acesso is not null;
  assert n = 1, 'o acesso devia guardar a hora';
  select count(*) into n from public.admin_actions
   where action = 'pessoa.acesso' and entity_id in (v_id::text, 'dono');
  assert n = 2, format('esperava dois acessos registados, há %s', n);

  -- DESATIVAR: não apaga, anula as ligações por usar, e tranca as novas.
  perform public.create_convite(v_id, repeat('d', 64), 'schema-checks');
  assert public.set_pessoa_ativa(v_id, false, 'schema-checks'), 'desativar devia devolver true';
  assert not public.set_pessoa_ativa(v_id, false, 'schema-checks'),
    'desativar quem já está desativada devia devolver false';
  select count(*) into n from public.admin_convites where pessoa_id = v_id and usado_em is null;
  assert n = 0, 'desativar devia anular as ligações por usar';
  begin
    perform public.create_convite(v_id, repeat('e', 64), 'schema-checks');
    assert false, 'uma pessoa desativada não devia receber ligação';
  exception when others then
    assert sqlerrm like 'esta pessoa está desativada%', format('a recusa devia dizê-lo: %s', sqlerrm);
  end;
  begin
    perform public.registar_acesso(v_id, 'Ana Teste · ana.teste@exemplo.pt');
    assert false, 'uma pessoa desativada não devia entrar';
  exception when others then
    assert sqlerrm like 'não há pessoa ativa%', format('a recusa devia dizê-lo: %s', sqlerrm);
  end;
  assert public.set_pessoa_ativa(v_id, true, 'schema-checks'), 'reativar devia devolver true';

  -- UMA REGIÃO QUE SAI LEVA OS PAPÉIS DELA, e a pessoa fica.
  select public.create_pessoa('bruno.teste@exemplo.pt', 'Bruno Teste', 'schema-checks') into v_outra;
  perform public.set_papel(v_outra, 'checks-pessoas-2', 'gestor', 'schema-checks');
  delete from public.regions where id = 'checks-pessoas-2';
  select count(*) into n from public.admin_papeis where pessoa_id = v_outra;
  assert n = 0, 'apagar a região devia levar os papéis dela';
  select count(*) into n from public.admin_pessoas where id = v_outra;
  assert n = 1, 'apagar a região não devia apagar a pessoa';

  -- O LIMITE CONTA SÓ AS FALHADAS: perguntar não conta, e uma certa limpa o balde.
  perform public.rate_limit_hit('schema-checks:pessoas', 900, 2);
  perform public.rate_limit_hit('schema-checks:pessoas', 900, 2);
  select allowed, hits into b, n from public.rate_limit_check('schema-checks:pessoas', 900, 2);
  assert not b and n = 2, 'duas falhadas num limite de duas deviam fechar a porta';
  select allowed, hits into b, n from public.rate_limit_check('schema-checks:pessoas', 900, 2);
  assert n = 2, 'perguntar não devia contar';
  perform public.rate_limit_clear('schema-checks:pessoas');
  select allowed, hits into b, n from public.rate_limit_check('schema-checks:pessoas', 900, 2);
  assert b and n = 0, 'uma entrada certa devia limpar o balde';

  -- O RASTO DE UMA REGIÃO, para quem a gere: os avisos dela inteiros — também
  -- publicar e retirar, que não guardam a região, e um aviso já apagado —, sem
  -- as licenças, e nada de outra região.
  declare
    v_aviso uuid;
    v_alheio uuid;
  begin
    perform public.create_region('checks-rasto-b', 'Checks B', 'a', 'checks-rasto-b', 94, 'schema-checks');
    select public.upsert_aviso(null, 'checks-pessoas', 'T', 'X', 'INFO', 'CONSTRUCTION', 'DETOUR',
                               null, null, '{}', '{}', '{}', null, 'schema-checks') into v_aviso;
    perform public.set_aviso_publicado(v_aviso, true, 'schema-checks');
    perform public.set_aviso_publicado(v_aviso, false, 'schema-checks');
    perform public.delete_aviso(v_aviso, 'schema-checks');
    perform public.add_region_license('checks-pessoas', current_date, null, 'contrato', null, 'schema-checks');
    perform public.set_modulo('checks-pessoas', 'taxi', false, 'schema-checks');
    select public.upsert_aviso(null, 'checks-rasto-b', 'Alheio', 'X', 'INFO', 'CONSTRUCTION', 'DETOUR',
                               null, null, '{}', '{}', '{}', null, 'schema-checks') into v_alheio;

    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'])
     where entity_type = 'aviso' and entity_id = v_aviso::text;
    assert n = 4, format('o rasto do aviso devia ter criar, publicar, retirar e apagar, e tem %s', n);
    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'])
     where action = 'region.license_add';
    assert n = 0, 'o rasto de quem gere não leva as licenças';
    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'], 50, 0,
                                                         null, null, null, null, null, true)
     where action = 'region.license_add';
    assert n = 1, 'o do dono, pedido com elas, leva';
    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'])
     where action = 'module.disable';
    assert n = 1, 'o rasto da região leva os módulos dela';
    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'])
     where entity_id in (v_alheio::text, 'checks-rasto-b');
    assert n = 0, 'o rasto de uma região não pode trazer nada de outra';
    select count(*) into n from public.acoes_das_regioes(array['checks-pessoas'])
     where entity_type = 'pessoa';
    assert n = 0, 'as pessoas são do dono, e não aparecem no rasto de uma região';

    delete from public.modulos where region_id = 'checks-pessoas';
    delete from public.regions where id = 'checks-rasto-b';
  end;

  -- O que estas verificações escreveram sai daqui, rasto incluído.
  delete from public.admin_actions
   where actor = 'schema-checks' or entity_id in (v_id::text, v_outra::text);
  delete from public.admin_pessoas where id in (v_id, v_outra);  -- leva papéis e ligações
  delete from public.regions where id = 'checks-pessoas';
  delete from public.rate_limits where bucket like 'schema-checks:%';
end $$;

-- ---------------------------------------------------------------------------
-- OS CONTACTOS (0010). O que vai para a declaração de acessibilidade e para a
-- privacidade: só o que é um endereço, com rasto, sem rasto quando nada muda,
-- e legível de fora só para as regiões ligadas.
do $$
declare
  n integer;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'region_contactos';
  assert n = 1, format('os contactos deviam ter uma policy e têm %s', n);

  perform public.create_region('checks-contactos', 'Contactos das Checks', 'os',
                               'checks-contactos.paragem.pt', 99, 'schema-checks');

  -- Um email que não é email, um endereço que não é da Web, e «outra
  -- entidade» sem nome: recusados na escrita, que é onde há quem os corrija.
  begin
    perform public.set_region_contactos('prova', 'não é email', null, null, 'por-preencher',
                                        null, '', null, 'schema-checks');
    assert false, 'um email inválido devia ser recusado';
  exception when check_violation then null;
  end;
  begin
    perform public.set_region_contactos('prova', null, null, 'javascript:alert(1)',
                                        'por-preencher', null, '', null, 'schema-checks');
    assert false, 'um endereço de reclamação que não é da Web devia ser recusado';
  exception when check_violation then null;
  end;
  begin
    perform public.set_region_contactos('prova', null, null, null, 'outra', '  ', 'a', null,
                                        'schema-checks');
    assert false, '«outra entidade» sem nome devia ser recusada';
  exception when check_violation then null;
  end;

  -- Gravar deixa rasto; gravar o mesmo não deixa nada.
  assert public.set_region_contactos('prova', ' Acessibilidade@Exemplo.PT ', '800 000 000',
                                     'https://exemplo.pt/reclamar', 'autoridade', 'ignorado', 'o',
                                     'privacidade@exemplo.pt', 'schema-checks'),
    'gravar contactos novos devia devolver true';
  select count(*) into n from public.region_contactos
   where region_id = 'prova' and acessibilidade_email = 'acessibilidade@exemplo.pt'
     and responsavel = 'autoridade' and responsavel_nome is null and responsavel_artigo = '';
  assert n = 1, 'o email fica em minúsculas, e o nome de «outra» só se guarda com «outra»';
  assert not public.set_region_contactos('prova', 'acessibilidade@exemplo.pt', '800 000 000',
                                         'https://exemplo.pt/reclamar', 'autoridade', null, '',
                                         'privacidade@exemplo.pt', 'outra-pessoa'),
    'gravar o mesmo devia devolver false';
  select count(*) into n from public.region_contactos
   where region_id = 'prova' and updated_by = 'schema-checks';
  assert n = 1, 'gravar o mesmo não muda o autor da linha';
  select count(*) into n from public.admin_actions
   where action = 'region.contactos' and entity_type = 'region' and entity_id = 'prova';
  assert n = 1, format('esperava uma linha de rasto dos contactos, há %s', n);
  -- E o rasto da região, que é o que o gestor vê, leva-os.
  select count(*) into n from public.acoes_das_regioes(array['prova'])
   where action = 'region.contactos';
  assert n = 1, 'o rasto da região devia levar os contactos';

  perform public.set_region_contactos('checks-contactos', 'a@exemplo.pt', null, null,
                                      'outra', 'Entidade das Checks', 'a', null, 'schema-checks');

  -- COMO O SÍTIO PERGUNTA, com o papel da chave pública: lê os da região
  -- ligada, e os da desligada não existem.
  set local role anon;
  select count(*) into n from public.region_contactos where region_id = 'prova';
  assert n = 1, 'a chave pública devia ler os contactos de uma região ligada';
  select count(*) into n from public.region_contactos where region_id = 'checks-contactos';
  assert n = 0, 'a chave pública não lê os contactos de uma região desligada';
  reset role;
  assert not has_function_privilege('anon',
    'public.set_region_contactos(text, text, text, text, text, text, text, text, text, text)',
    'execute'), 'a chave pública não escreve contactos';

  -- O que estas verificações escreveram sai daqui, rasto incluído.
  delete from public.region_contactos where region_id in ('prova', 'checks-contactos');
  delete from public.regions where id = 'checks-contactos';
  delete from public.admin_actions where actor = 'schema-checks';
end $$;
