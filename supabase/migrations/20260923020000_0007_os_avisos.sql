-- 0007 — Os avisos: o que a autoridade de transportes tem a dizer hoje.
--
-- Até aqui a página de avisos servia um JSON estático que ninguém escrevia, e
-- dizia-o com todas as letras: «esta página ainda não recebe avisos da
-- autoridade de transportes». Era honesto e era inútil. Uma supressão, um
-- desvio por obra, uma greve — nada disso chegava a quem estava na paragem.
--
-- TRÊS DECISÕES, e as três têm razão de ser:
--
--   1. ESTADO, e não histórico. Ao contrário das licenças (0004), um aviso
--      EDITA-SE: corrige-se uma gralha, estende-se um prazo, despublica-se
--      quando a obra acaba. Quem quiser saber o que mudou tem o
--      `admin_actions`, que guarda o antes e o depois de cada gesto.
--
--   2. A FORMA É A DO GTFS-RT, e não uma nossa. `cause`, `effect`,
--      `severity_level`, `active_period`, `informed_entity` — os nomes e os
--      valores são os da especificação, verificados aqui por `check`. Assim o
--      feed sai por tradução direta em vez de por adivinhação, e um valor
--      inválido rebenta na escrita, que é onde há uma pessoa para o corrigir,
--      e não na leitura, que é onde há uma aplicação de outra gente.
--
--   3. PUBLICAR É UM GESTO À PARTE de escrever. Um aviso nasce por publicar:
--      quem o redige a meio de uma ocorrência não devia ter de escolher entre
--      gravar a meio e mostrar a meio.
--
-- Invisível ao público por RLS sem policy, como o resto: quem lê é o sítio,
-- com a chave de serviço, e o que ele mostra é o que já filtrou.

create table public.avisos (
  id         uuid primary key default gen_random_uuid(),
  region_id  text not null references public.regions(id) on delete cascade,

  -- O que se lê primeiro, e o que se lê a seguir. Ambos em português da
  -- região; a tradução, quando houver, é do lado do sítio.
  titulo     text not null,
  texto      text not null,

  -- GTFS-RT `Alert.severity_level`. «INFO» é o que não muda a viagem de
  -- ninguém; «SEVERE» é o que a impede.
  gravidade  text not null default 'WARNING'
    check (gravidade in ('UNKNOWN_SEVERITY', 'INFO', 'WARNING', 'SEVERE')),

  -- GTFS-RT `Alert.cause` e `Alert.effect`. Porquê, e o que isso faz à rede.
  causa      text not null default 'UNKNOWN_CAUSE'
    check (causa in (
      'UNKNOWN_CAUSE', 'OTHER_CAUSE', 'TECHNICAL_PROBLEM', 'STRIKE',
      'DEMONSTRATION', 'ACCIDENT', 'HOLIDAY', 'WEATHER', 'MAINTENANCE',
      'CONSTRUCTION', 'POLICE_ACTIVITY', 'MEDICAL_EMERGENCY')),
  efeito     text not null default 'OTHER_EFFECT'
    check (efeito in (
      'NO_SERVICE', 'REDUCED_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR',
      'ADDITIONAL_SERVICE', 'MODIFIED_SERVICE', 'OTHER_EFFECT',
      'UNKNOWN_EFFECT', 'STOP_MOVED', 'NO_EFFECT', 'ACCESSIBILITY_ISSUE')),

  -- GTFS-RT `Alert.active_period`. Nulo no início = já está a acontecer;
  -- nulo no fim = não se sabe quando acaba, que é o caso mais honesto numa
  -- avaria.
  inicio     timestamptz,
  fim        timestamptz,

  -- GTFS-RT `Alert.informed_entity`. Vazio quer dizer «a rede toda» — o que é
  -- raro e deve ser deliberado.
  linhas     text[] not null default '{}',
  paragens   text[] not null default '{}',
  modos      text[] not null default '{}',

  -- Onde se lê mais, quando há mais para ler. `Alert.url`.
  url        text,

  publicado  boolean not null default false,

  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint avisos_titulo_nao_vazio check (length(trim(titulo)) > 0),
  constraint avisos_texto_nao_vazio  check (length(trim(texto)) > 0),
  constraint avisos_prazo_ordenado   check (fim is null or inicio is null or fim >= inicio)
);

comment on table public.avisos is
  'O que a autoridade de transportes de cada região tem a dizer: supressões, '
  'desvios, greves. Estado editável, com o rasto de cada gesto em '
  'admin_actions. A forma é a do GTFS-RT para o feed sair por tradução '
  'direta. Nada disto é público sem a chave de serviço.';

create index avisos_por_regiao on public.avisos (region_id, publicado, inicio desc);

create trigger avisos_updated_at
  before update on public.avisos
  for each row execute function public.set_updated_at();

alter table public.avisos enable row level security;

-- ---------------------------------------------------------------------------

create or replace function public.upsert_aviso(
  p_id        uuid,
  p_region_id text,
  p_titulo    text,
  p_texto     text,
  p_gravidade text,
  p_causa     text,
  p_efeito    text,
  p_inicio    timestamptz,
  p_fim       timestamptz,
  p_linhas    text[],
  p_paragens  text[],
  p_modos     text[],
  p_url       text,
  p_actor     text,
  p_ip_hash   text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_antes  jsonb;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se escreve aviso nenhum';
  end if;
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'um aviso sem título é um aviso que ninguém lê';
  end if;
  if coalesce(trim(p_texto), '') = '' then
    raise exception 'um aviso sem texto não diz nada a quem está na paragem';
  end if;
  if not exists (select 1 from public.regions where id = p_region_id) then
    raise exception 'não há região com o identificador %', p_region_id;
  end if;

  if p_id is not null then
    select to_jsonb(a) into v_antes from public.avisos a where a.id = p_id;
    if v_antes is null then
      raise exception 'não há aviso com o identificador %', p_id;
    end if;
    -- A REGIÃO NÃO SE MUDA POR EDIÇÃO. Mover um aviso de uma região para
    -- outra por engano é publicar a greve de um território no sítio de outro.
    if (v_antes ->> 'region_id') is distinct from p_region_id then
      raise exception 'um aviso não muda de região; cria-se outro';
    end if;
  end if;

  insert into public.avisos as a (
    id, region_id, titulo, texto, gravidade, causa, efeito,
    inicio, fim, linhas, paragens, modos, url, created_by
  )
  values (
    coalesce(p_id, gen_random_uuid()), p_region_id, trim(p_titulo), trim(p_texto),
    coalesce(nullif(trim(p_gravidade), ''), 'WARNING'),
    coalesce(nullif(trim(p_causa), ''), 'UNKNOWN_CAUSE'),
    coalesce(nullif(trim(p_efeito), ''), 'OTHER_EFFECT'),
    p_inicio, p_fim,
    coalesce(p_linhas, '{}'), coalesce(p_paragens, '{}'), coalesce(p_modos, '{}'),
    nullif(trim(coalesce(p_url, '')), ''), p_actor
  )
  on conflict (id) do update set
    titulo    = excluded.titulo,
    texto     = excluded.texto,
    gravidade = excluded.gravidade,
    causa     = excluded.causa,
    efeito    = excluded.efeito,
    inicio    = excluded.inicio,
    fim       = excluded.fim,
    linhas    = excluded.linhas,
    paragens  = excluded.paragens,
    modos     = excluded.modos,
    url       = excluded.url
  returning a.id into v_id;

  perform public.log_admin_action(
    p_actor,
    case when p_id is null then 'aviso.create' else 'aviso.update' end,
    'aviso', v_id::text,
    v_antes,
    (select to_jsonb(a) from public.avisos a where a.id = v_id),
    p_ip_hash
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------

-- PUBLICAR É UM GESTO À PARTE, e por isso tem função própria: o rasto diz
-- «publicou» ou «retirou», e não «editou», que é o que interessa saber quando
-- se pergunta porque é que um aviso esteve no ar entre as 7h e as 9h.
create or replace function public.set_aviso_publicado(
  p_id        uuid,
  p_publicado boolean,
  p_actor     text,
  p_ip_hash   text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se publica nem se retira nada';
  end if;

  select publicado into v_antes from public.avisos where id = p_id;
  if v_antes is null then
    raise exception 'não há aviso com o identificador %', p_id;
  end if;
  if v_antes = p_publicado then
    return;
  end if;

  update public.avisos set publicado = p_publicado where id = p_id;

  perform public.log_admin_action(
    p_actor,
    case when p_publicado then 'aviso.publish' else 'aviso.unpublish' end,
    'aviso', p_id::text,
    jsonb_build_object('publicado', v_antes),
    jsonb_build_object('publicado', p_publicado),
    p_ip_hash
  );
end;
$$;

-- ---------------------------------------------------------------------------

-- APAGAR EXISTE, e não é o mesmo que despublicar. Despublicar é «isto deixou
-- de ser verdade»; apagar é «isto nunca devia ter sido escrito». O rasto
-- guarda o aviso inteiro no `before`, para que apagar não seja esquecer.
create or replace function public.delete_aviso(
  p_id      uuid,
  p_actor   text,
  p_ip_hash text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se apaga nada';
  end if;

  select to_jsonb(a) into v_antes from public.avisos a where a.id = p_id;
  if v_antes is null then
    raise exception 'não há aviso com o identificador %', p_id;
  end if;

  delete from public.avisos where id = p_id;

  perform public.log_admin_action(
    p_actor, 'aviso.delete', 'aviso', p_id::text, v_antes, null, p_ip_hash
  );
end;
$$;

-- ---------------------------------------------------------------------------

revoke all on table public.avisos from public, anon, authenticated;
grant select, insert, update, delete on table public.avisos to service_role;

revoke all on function public.upsert_aviso(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text[], text[], text[], text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_aviso(
  uuid, text, text, text, text, text, text, timestamptz, timestamptz,
  text[], text[], text[], text, text, text) to service_role;

revoke all on function public.set_aviso_publicado(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_aviso_publicado(uuid, boolean, text, text)
  to service_role;

revoke all on function public.delete_aviso(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_aviso(uuid, text, text) to service_role;
