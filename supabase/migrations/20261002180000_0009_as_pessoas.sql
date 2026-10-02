-- 0009 — As pessoas do painel: cada uma com o seu email, a sua palavra-passe
-- e os seus papéis por região.
--
-- Até aqui o painel tinha UMA palavra-passe (`ADMIN_PASSWORD_HASH`) e a
-- auditoria escrevia `gestor` em todas as linhas. Isso servia enquanto quem
-- entrava era quem respondia pelo produto. Deixou de servir no dia em que a
-- autoridade de transportes de uma região quis escrever os seus próprios
-- avisos: entregar-lhe a palavra-passe era entregar-lhe também o interruptor
-- das regiões dos outros clientes, os domínios e as licenças de todos — e a
-- auditoria continuava sem saber quem tinha feito o quê.
--
-- O DESENHO É O DOS DOIS PAINÉIS DA CASA (o do Coreto é o mesmo):
--
--   · o DONO é quem tem a palavra-passe do ambiente — a de hoje, sem mudar
--     nada. Tem acesso a tudo, e é por ele que nascem as outras pessoas.
--     Ninguém fica trancado fora no dia em que isto chega a produção, porque
--     a porta do dono não depende de nenhuma tabela desta migração;
--   · uma PESSOA tem papéis por região: «gestor» (a ficha da região — os
--     módulos, os avisos, os textos que a base guarda) ou «editor» (os avisos
--     dessa região, e mais nada). Domínios, alias, licenças, criar e desligar
--     regiões e gerir pessoas ficam com o dono: são decisões comerciais e de
--     infraestrutura;
--   · a pessoa nasce SEM palavra-passe. O dono gera uma ligação de ativação
--     de uso único, válida sete dias, e envia-a pelos seus meios — não sai
--     correio nenhum do painel. A pessoa escolhe a palavra-passe ao abri-la.
--     O token da ligação nunca se guarda: guarda-se o sha256 dele;
--   · a auditoria passa a escrever QUEM fez — o nome e o email —, e não um
--     papel.
--
-- AS MESMAS REGRAS DAS OUTRAS TABELAS DO PAINEL: RLS ligada e nenhuma policy
-- (só a chave de serviço lê), e nenhuma escrita toca nas tabelas por fora —
-- todas passam por uma função que deixa a linha em `admin_actions` com o
-- antes e o depois. As palavras-passe e os tokens NUNCA entram no rasto.
--
-- O LIMITE DE TENTATIVAS MUDA DE REGRA. Contava todas as entradas, certas
-- incluídas, por origem: cinco entradas bem feitas num quarto de hora
-- trancavam a equipa toda, que era o que acontecia numa formação. Passa a
-- contar só as FALHADAS, por origem e por email, e uma entrada certa limpa o
-- contador. Duas funções novas, ao lado da `rate_limit_hit` (0005), que fica
-- como estava: o sítio de hoje continua a chamá-la até esta migração chegar.

-- ---------------------------------------------------------------------------
-- admin_pessoas — quem entra no painel, além do dono
-- ---------------------------------------------------------------------------
create table public.admin_pessoas (
  id             uuid primary key default gen_random_uuid(),
  -- Em minúsculas, sempre: «Ana@Camara.pt» e «ana@camara.pt» são a mesma
  -- caixa de correio, e duas linhas para ela eram duas contas para uma pessoa.
  email          text not null unique
    check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  nome           text not null
    check (length(trim(nome)) > 0 and length(nome) <= 120),
  -- `scrypt$N$r$p$sal$hash`, como o do dono. Nula até a pessoa abrir a
  -- ligação de ativação e escolher a sua.
  senha_hash     text
    check (senha_hash is null or senha_hash like 'scrypt$%'),
  ativada_em     timestamptz,
  desativada_em  timestamptz,
  criada_em      timestamptz not null default now(),
  criada_por     text not null,
  ultimo_acesso  timestamptz
);

comment on table public.admin_pessoas is
  'As pessoas que entram no painel além do dono: email, nome, o hash da '
  'palavra-passe (nulo até à ativação) e o estado. Escreve-se só pelas '
  'funções desta migração, que deixam rasto em admin_actions.';

-- ---------------------------------------------------------------------------
-- admin_papeis — o que cada pessoa pode fazer em cada região
-- ---------------------------------------------------------------------------
create table public.admin_papeis (
  pessoa_id  uuid not null references public.admin_pessoas(id) on delete cascade,
  region_id  text not null references public.regions(id) on delete cascade,
  papel      text not null check (papel in ('gestor', 'editor')),
  primary key (pessoa_id, region_id)
);

comment on table public.admin_papeis is
  'Um papel por pessoa e por região: «gestor» (a ficha da região) ou «editor» '
  '(os avisos da região). O dono não tem linhas aqui: tem tudo.';

create index admin_papeis_region_idx on public.admin_papeis (region_id);

-- ---------------------------------------------------------------------------
-- admin_convites — as ligações de ativação, pelo hash
-- ---------------------------------------------------------------------------
create table public.admin_convites (
  -- O sha256 do token, em hexadecimal. O token em claro vive só na ligação
  -- que o dono copia, e na barra de endereços de quem a abre.
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  pessoa_id   uuid not null references public.admin_pessoas(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  criado_por  text not null,
  expira_em   timestamptz not null,
  usado_em    timestamptz
);

comment on table public.admin_convites is
  'As ligações de ativação (e de nova palavra-passe): só o sha256 do token, '
  'de uso único e com prazo. Uma ligação nova anula as que estavam por usar.';

create index admin_convites_pessoa_idx on public.admin_convites (pessoa_id);

-- Invisíveis ao público: RLS ligada e nenhuma policy. A chave de serviço lê
-- (o painel precisa do hash para conferir uma entrada); ninguém escreve senão
-- pelas funções.
alter table public.admin_pessoas enable row level security;
alter table public.admin_papeis enable row level security;
alter table public.admin_convites enable row level security;

revoke all on table public.admin_pessoas, public.admin_papeis, public.admin_convites
  from public, anon, authenticated;
grant select on table public.admin_pessoas, public.admin_papeis, public.admin_convites
  to service_role;

-- ---------------------------------------------------------------------------
-- create_pessoa — nasce sem palavra-passe e sem papéis
-- ---------------------------------------------------------------------------
create or replace function public.create_pessoa(
  p_email   text,
  p_nome    text,
  p_actor   text,
  p_ip_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome  text := trim(coalesce(p_nome, ''));
  v_id    uuid;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não nasce pessoa nenhuma';
  end if;
  if v_nome = '' then
    raise exception 'a pessoa precisa de um nome — é o que a auditoria vai escrever';
  end if;
  if length(v_nome) > 120 then
    raise exception 'o nome tem mais de 120 caracteres';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'o email «%» não se lê como um endereço de correio', v_email;
  end if;
  if exists (select 1 from public.admin_pessoas where email = v_email) then
    raise exception 'já há uma pessoa com o email %', v_email;
  end if;

  insert into public.admin_pessoas (email, nome, criada_por)
  values (v_email, v_nome, p_actor)
  returning id into v_id;

  perform public.log_admin_action(
    p_actor, 'pessoa.create', 'pessoa', v_id::text,
    null,
    jsonb_build_object('email', v_email, 'nome', v_nome),
    p_ip_hash
  );

  return v_id;
end;
$$;

comment on function public.create_pessoa(text, text, text, text) is
  'Cria uma pessoa do painel, sem palavra-passe e sem papéis, com linha de '
  'auditoria. O email guarda-se em minúsculas.';

-- ---------------------------------------------------------------------------
-- set_papel — dar, mudar ou tirar o papel de uma pessoa numa região
-- ---------------------------------------------------------------------------
create or replace function public.set_papel(
  p_pessoa  uuid,
  p_region  text,
  p_papel   text,
  p_actor   text,
  p_ip_hash text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel text := nullif(trim(coalesce(p_papel, '')), '');
  v_antes text;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se muda papel nenhum';
  end if;
  if not exists (select 1 from public.admin_pessoas where id = p_pessoa) then
    raise exception 'não há pessoa com o identificador %', p_pessoa;
  end if;
  if not exists (select 1 from public.regions where id = p_region) then
    raise exception 'não há região com o identificador %', p_region;
  end if;
  if v_papel is not null and v_papel not in ('gestor', 'editor') then
    raise exception 'o papel tem de ser «gestor» ou «editor»';
  end if;

  select papel into v_antes from public.admin_papeis
   where pessoa_id = p_pessoa and region_id = p_region
   for update;

  if v_antes is not distinct from v_papel then
    return false;  -- já era assim; não é um acontecimento
  end if;

  if v_papel is null then
    delete from public.admin_papeis where pessoa_id = p_pessoa and region_id = p_region;
  else
    insert into public.admin_papeis (pessoa_id, region_id, papel)
    values (p_pessoa, p_region, v_papel)
    on conflict (pessoa_id, region_id) do update set papel = excluded.papel;
  end if;

  perform public.log_admin_action(
    p_actor, 'pessoa.papel', 'pessoa', p_pessoa::text,
    jsonb_build_object('region_id', p_region, 'papel', v_antes),
    jsonb_build_object('region_id', p_region, 'papel', v_papel),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.set_papel(uuid, text, text, text, text) is
  'Dá, muda ou tira (papel nulo) o papel de uma pessoa numa região, com linha '
  'de auditoria. Devolve false quando já era assim.';

-- ---------------------------------------------------------------------------
-- set_pessoa_ativa — desativar (e voltar a ativar) sem apagar o rasto
-- ---------------------------------------------------------------------------
--
-- DESATIVAR NÃO É APAGAR. A pessoa fica, com o nome que a auditoria escreveu
-- em cada linha dela; deixa só de poder entrar — e no clique seguinte, porque
-- o painel relê a pessoa da base em cada pedido. As ligações por usar caem
-- com ela.
create or replace function public.set_pessoa_ativa(
  p_pessoa  uuid,
  p_ativa   boolean,
  p_actor   text,
  p_ip_hash text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desativada timestamptz;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se ativa nem desativa ninguém';
  end if;

  select desativada_em into v_desativada from public.admin_pessoas
   where id = p_pessoa for update;
  if not found then
    raise exception 'não há pessoa com o identificador %', p_pessoa;
  end if;

  if (v_desativada is null) = p_ativa then
    return false;
  end if;

  update public.admin_pessoas
     set desativada_em = case when p_ativa then null else now() end
   where id = p_pessoa;
  if not p_ativa then
    delete from public.admin_convites where pessoa_id = p_pessoa and usado_em is null;
  end if;

  perform public.log_admin_action(
    p_actor,
    case when p_ativa then 'pessoa.enable' else 'pessoa.disable' end,
    'pessoa', p_pessoa::text,
    jsonb_build_object('ativa', v_desativada is null),
    jsonb_build_object('ativa', p_ativa),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.set_pessoa_ativa(uuid, boolean, text, text) is
  'Desativa (ou reativa) uma pessoa do painel, com linha de auditoria. '
  'Desativar anula as ligações por usar. Devolve false quando já era assim.';

-- ---------------------------------------------------------------------------
-- create_convite — a ligação de ativação, ou a de uma palavra-passe nova
-- ---------------------------------------------------------------------------
--
-- UMA LIGAÇÃO VÁLIDA DE CADA VEZ. Uma ligação nova anula as que estavam por
-- usar — a que se perdeu, a que foi para o endereço errado. A palavra-passe
-- antiga continua a valer até a nova ser escolhida: gerar uma ligação não
-- tranca ninguém fora.
create or replace function public.create_convite(
  p_pessoa     uuid,
  p_token_hash text,
  p_actor      text,
  p_ip_hash    text default null
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desativada timestamptz;
  v_expira     timestamptz := now() + interval '7 days';
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se gera ligação nenhuma';
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'o token da ligação tem de chegar já reduzido ao sha256';
  end if;

  select desativada_em into v_desativada from public.admin_pessoas
   where id = p_pessoa for update;
  if not found then
    raise exception 'não há pessoa com o identificador %', p_pessoa;
  end if;
  if v_desativada is not null then
    raise exception 'esta pessoa está desativada; volta a ativá-la antes de lhe gerar uma ligação';
  end if;

  delete from public.admin_convites where pessoa_id = p_pessoa and usado_em is null;
  insert into public.admin_convites (token_hash, pessoa_id, criado_por, expira_em)
  values (p_token_hash, p_pessoa, p_actor, v_expira);

  -- O rasto diz QUE se gerou uma ligação, e até quando vale. O token não.
  perform public.log_admin_action(
    p_actor, 'pessoa.convite', 'pessoa', p_pessoa::text,
    null,
    jsonb_build_object('expira_em', v_expira),
    p_ip_hash
  );

  return v_expira;
end;
$$;

comment on function public.create_convite(uuid, text, text, text) is
  'Regista uma ligação de ativação (o sha256 do token), válida sete dias, e '
  'anula as que estavam por usar. Devolve o prazo.';

-- ---------------------------------------------------------------------------
-- ativar_com_convite — a pessoa abre a ligação e escolhe a palavra-passe
-- ---------------------------------------------------------------------------
--
-- É a única função desta casa chamada sem sessão de ninguém: o autor é a
-- própria pessoa, e é o token que a identifica. Por isso o autor do rasto
-- sai da linha dela, e não de um parâmetro.
create or replace function public.ativar_com_convite(
  p_token_hash text,
  p_senha_hash text,
  p_ip_hash    text default null
) returns table (id uuid, nome text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.admin_convites%rowtype;
  v_pessoa  public.admin_pessoas%rowtype;
begin
  if coalesce(p_senha_hash, '') not like 'scrypt$%' then
    raise exception 'a palavra-passe tem de chegar já reduzida a um hash scrypt';
  end if;

  select * into v_convite from public.admin_convites c
   where c.token_hash = coalesce(p_token_hash, '')
   for update;
  if not found then
    raise exception 'esta ligação não é válida — confirma que a copiaste inteira, ou pede uma nova a quem te convidou';
  end if;
  if v_convite.usado_em is not null then
    raise exception 'esta ligação já foi usada — para voltar a escolher a palavra-passe, pede uma nova a quem te convidou';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'esta ligação expirou — pede uma nova a quem te convidou';
  end if;

  select * into v_pessoa from public.admin_pessoas p
   where p.id = v_convite.pessoa_id
   for update;
  if v_pessoa.desativada_em is not null then
    raise exception 'esta conta está desativada';
  end if;

  update public.admin_pessoas p
     set senha_hash = p_senha_hash,
         ativada_em = coalesce(p.ativada_em, now())
   where p.id = v_pessoa.id;
  update public.admin_convites c set usado_em = now() where c.token_hash = v_convite.token_hash;
  delete from public.admin_convites c where c.pessoa_id = v_pessoa.id and c.usado_em is null;

  perform public.log_admin_action(
    v_pessoa.nome || ' · ' || v_pessoa.email,
    case when v_pessoa.ativada_em is null then 'pessoa.activate' else 'pessoa.password' end,
    'pessoa', v_pessoa.id::text,
    jsonb_build_object('ativada', v_pessoa.ativada_em is not null),
    jsonb_build_object('ativada', true),
    p_ip_hash
  );

  return query select v_pessoa.id, v_pessoa.nome, v_pessoa.email;
end;
$$;

comment on function public.ativar_com_convite(text, text, text) is
  'Troca uma ligação de ativação válida por uma palavra-passe (o hash scrypt), '
  'gasta a ligação e deixa rasto em nome da própria pessoa.';

-- ---------------------------------------------------------------------------
-- registar_acesso — quem entrou, e quando
-- ---------------------------------------------------------------------------
--
-- Também o dono, que não tem linha em `admin_pessoas` (`p_pessoa` nulo): a
-- pergunta «quem entrou no painel no dia em que o domínio mudou» não se
-- responde só com as pessoas.
create or replace function public.registar_acesso(
  p_pessoa  uuid,
  p_actor   text,
  p_ip_hash text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se regista acesso nenhum';
  end if;
  if p_pessoa is not null then
    update public.admin_pessoas set ultimo_acesso = now()
     where id = p_pessoa and desativada_em is null;
    if not found then
      raise exception 'não há pessoa ativa com o identificador %', p_pessoa;
    end if;
  end if;

  perform public.log_admin_action(
    p_actor, 'pessoa.acesso', 'pessoa', coalesce(p_pessoa::text, 'dono'),
    null, null, p_ip_hash
  );
end;
$$;

comment on function public.registar_acesso(uuid, text, text) is
  'Regista uma entrada no painel (o dono, com pessoa nula), com linha de '
  'auditoria; numa pessoa, guarda também o último acesso.';

-- ---------------------------------------------------------------------------
-- O limite de tentativas, só das falhadas
-- ---------------------------------------------------------------------------
--
-- `rate_limit_check` lê sem contar: é o que se pergunta ANTES de conferir a
-- palavra-passe. A falhada conta-se a seguir, com a `rate_limit_hit` de
-- sempre; a certa limpa o balde com `rate_limit_clear`.
create or replace function public.rate_limit_check(
  p_bucket text,
  p_window_seconds integer,
  p_limit integer
)
returns table (allowed boolean, hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or p_bucket = '' then
    raise exception 'sem balde não se conta nada';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'a janela tem de ser de pelo menos um segundo';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  select rl.hits into v_hits from public.rate_limits rl
   where rl.bucket = p_bucket and rl.window_start = v_window_start;

  return query select coalesce(v_hits, 0) < p_limit, coalesce(v_hits, 0),
                      v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

comment on function public.rate_limit_check(text, integer, integer) is
  'Diz se ainda cabe mais uma tentativa no balde, SEM a contar.';

create or replace function public.rate_limit_clear(p_bucket text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_bucket is null or p_bucket = '' then
    raise exception 'sem balde não se limpa nada';
  end if;
  delete from public.rate_limits where bucket = p_bucket;
end;
$$;

comment on function public.rate_limit_clear(text) is
  'Esquece as tentativas de um balde — uma entrada certa limpa o seu.';

-- ---------------------------------------------------------------------------
-- acoes_das_regioes — o rasto de uma ou mais regiões, para quem as gere
-- ---------------------------------------------------------------------------
--
-- O dono lê a auditoria inteira. Quem gere uma região lê o rasto DELA — e só
-- dela: o interruptor e o domínio, os módulos, os avisos, os contactos. Não as
-- licenças (o contrato é da casa com o cliente), nem as pessoas (são do dono).
--
-- Não se faz com um filtro do lado de quem lê porque o rasto de um aviso não
-- diz sempre de que região é: publicar e retirar guardam só `publicado`, e um
-- aviso apagado já não está na tabela. A região de um aviso sai do aviso, se
-- ainda existe, ou de qualquer linha do rasto dele que a tenha — a de criar
-- tem-na sempre.
create or replace function public.acoes_das_regioes(
  p_regioes      text[],
  p_limite       integer default 50,
  p_desvio       integer default 0,
  p_actor        text default null,
  p_action       text default null,
  p_entity_type  text default null,
  p_desde        timestamptz default null,
  p_ate          timestamptz default null,
  p_com_licencas boolean default false
) returns setof public.admin_actions
language sql
stable
security definer
set search_path = ''
as $$
  with avisos_das_regioes as (
    select a.id::text as id from public.avisos a where a.region_id = any(p_regioes)
    union
    select x.entity_id from public.admin_actions x
     where x.entity_type = 'aviso'
       and (x.after ->> 'region_id' = any(p_regioes) or x.before ->> 'region_id' = any(p_regioes))
  )
  select x.* from public.admin_actions x
   where (p_com_licencas or x.action <> 'region.license_add')
     and (
       (x.entity_type = 'region' and x.entity_id = any(p_regioes))
       or (x.entity_type = 'module' and split_part(x.entity_id, '/', 1) = any(p_regioes))
       or (x.entity_type = 'aviso' and x.entity_id in (select id from avisos_das_regioes))
     )
     and (p_actor is null or x.actor = p_actor)
     and (p_action is null or x.action = p_action)
     and (p_entity_type is null or x.entity_type = p_entity_type)
     and (p_desde is null or x.created_at >= p_desde)
     and (p_ate is null or x.created_at < p_ate)
   order by x.id desc
   limit greatest(1, least(coalesce(p_limite, 50), 500))
   offset greatest(0, coalesce(p_desvio, 0));
$$;

comment on function public.acoes_das_regioes(text[], integer, integer, text, text, text, timestamptz, timestamptz, boolean) is
  'O rasto de um conjunto de regiões — a região, os módulos e os avisos dela —, '
  'do mais recente para o mais antigo. Sem as licenças, a menos que se peçam.';

-- ---------------------------------------------------------------------------
-- Só a chave de serviço chama qualquer uma delas
-- ---------------------------------------------------------------------------
revoke all on function public.acoes_das_regioes(text[], integer, integer, text, text, text, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.acoes_das_regioes(text[], integer, integer, text, text, text, timestamptz, timestamptz, boolean)
  to service_role;

revoke all on function public.create_pessoa(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_pessoa(text, text, text, text) to service_role;

revoke all on function public.set_papel(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.set_papel(uuid, text, text, text, text) to service_role;

revoke all on function public.set_pessoa_ativa(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_pessoa_ativa(uuid, boolean, text, text) to service_role;

revoke all on function public.create_convite(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_convite(uuid, text, text, text) to service_role;

revoke all on function public.ativar_com_convite(text, text, text)
  from public, anon, authenticated;
grant execute on function public.ativar_com_convite(text, text, text) to service_role;

revoke all on function public.registar_acesso(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.registar_acesso(uuid, text, text) to service_role;

revoke all on function public.rate_limit_check(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_check(text, integer, integer) to service_role;

revoke all on function public.rate_limit_clear(text)
  from public, anon, authenticated;
grant execute on function public.rate_limit_clear(text) to service_role;
