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
  for r in select id from public.regions where id like 'prova%' loop
    select count(*) into n from public.region_licenses
     where region_id = r.id and kind = 'demo' and ends_on is null;
    assert n >= 1, format('%s: a região de prova devia nascer com licença «demo» sem prazo', r.id);
  end loop;

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
     and tablename in ('admin_actions', 'region_licenses', 'rate_limits');
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
                         'region_licenses', 'rate_limits', 'avisos')
     and not t.rowsecurity;
  assert n = 0, format('%s tabelas sem RLS', n);
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
