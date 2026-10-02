-- 0010 — Os contactos que a declaração de acessibilidade e a privacidade mostram.
--
-- A declaração de acessibilidade de cada região dizia «Por preencher» no
-- contacto e no mecanismo de reclamação — também na região a sério —, e a
-- página de privacidade dizia que o contacto «ainda está por definir». Não
-- havia onde a autoridade os pusesse (P4-024).
--
-- PORQUE NA BASE, E NÃO NA DECLARAÇÃO DA REGIÃO (`regiao.yaml`):
--
--   1. QUEM OS DECIDE É A AUTORIDADE, e mudam sem aviso: a pessoa que
--      respondia sai, o endereço muda. A declaração da região vive na raiz de
--      dados dela, que a autoridade não edita, e mudá-la é uma construção e
--      uma publicação. O painel é a ferramenta da autoridade, e o
--      `CONTAS.md` dá ao gestor da região «os textos que a base guarde».
--   2. O RASTO CONTA. Uma declaração de acessibilidade com o contacto errado
--      é uma obrigação legal por cumprir (DL 83/2018); saber quem o mudou, e
--      quando, é a prova de que se cumpriu.
--   3. A MARCA NÃO VEM PARA AQUI. A cor e o logotipo são da declaração da
--      região (lote 7) e não se editam no painel; os contactos são de outra
--      natureza: não definem a região, dizem a quem se escreve.
--
-- LEITURA PÚBLICA, como os avisos publicados: o que aqui está vai para uma
-- página pública, e a policy deixa ler os contactos das regiões ligadas. Uma
-- região desligada não tem página, e os contactos dela não existem para quem
-- pergunta de fora.
--
-- NADA SE SEMEIA. As regiões de prova são inventadas, e um contacto
-- inventado numa declaração de acessibilidade é pior do que nenhum: quem
-- reclamar fica à espera. Sem linha, a página diz «Por preencher», como dizia.
--
-- SEGURA PARA O SÍTIO DE HOJE: só acrescenta. O sítio que ainda não a conhece
-- nunca pergunta por esta tabela; o novo pergunta, e sem ela (404) diz «Por
-- preencher» — o mesmo que diz sem linha.

create table public.region_contactos (
  region_id text primary key references public.regions(id) on delete cascade,

  -- Para comunicar um problema de acessibilidade, ou pedir a informação num
  -- formato acessível (DL 83/2018, a declaração).
  acessibilidade_email    text
    check (acessibilidade_email is null
           or acessibilidade_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  acessibilidade_telefone text
    check (acessibilidade_telefone is null
           or acessibilidade_telefone ~ '^[0-9+() -]{6,20}$'),
  -- Onde se apresenta uma reclamação, quando a resposta não chega ou não
  -- serve. Um endereço da Web — nunca um `javascript:` numa página pública.
  reclamacao_url          text
    check (reclamacao_url is null or reclamacao_url ~ '^https?://[^[:space:]]+$'),

  -- Quem responde pelos dados das medições do sítio. `autoridade` usa o nome
  -- e o artigo que a região declara para a autoridade de transportes (lote 1);
  -- `outra` usa o nome e o artigo daqui; `por-preencher` diz que falta.
  responsavel             text not null default 'por-preencher'
    check (responsavel in ('por-preencher', 'autoridade', 'outra')),
  responsavel_nome        text,
  responsavel_artigo      text not null default ''
    check (responsavel_artigo in ('', 'o', 'a', 'os', 'as')),
  privacidade_email       text
    check (privacidade_email is null
           or privacidade_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  updated_by text not null,
  updated_at timestamptz not null default now(),

  constraint region_contactos_outra_tem_nome
    check (responsavel <> 'outra' or length(trim(coalesce(responsavel_nome, ''))) > 0)
);

comment on table public.region_contactos is
  'Os contactos que a declaração de acessibilidade e a página de privacidade de '
  'cada região mostram. Escreve-os quem gere a região, no painel, com rasto em '
  'admin_actions (region.contactos). Legíveis com a chave pública para as '
  'regiões ligadas.';

create trigger region_contactos_updated_at
  before update on public.region_contactos
  for each row execute function public.set_updated_at();

alter table public.region_contactos enable row level security;

-- A PERGUNTA «ESTA REGIÃO ESTÁ LIGADA?» NUMA FUNÇÃO, e não numa subconsulta à
-- `regions` dentro da policy: a subconsulta corre com os privilégios de quem
-- pergunta, e a chave pública só lê a `regions` onde a plataforma lho dá por
-- omissão. Com a função, a policy vale igual no projeto e num Postgres limpo.
create or replace function public.regiao_publica(p_region_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.regions r where r.id = p_region_id and r.is_enabled);
$$;

revoke all on function public.regiao_publica(text) from public;
grant execute on function public.regiao_publica(text) to anon, authenticated, service_role;

create policy region_contactos_public_read on public.region_contactos
  for select to anon, authenticated
  using (public.regiao_publica(region_id));

-- ---------------------------------------------------------------------------

-- Gravar os contactos de uma região, de uma vez. Devolve `false` quando nada
-- mudou — gravar o mesmo não é um acontecimento, e não deixa linha.
create or replace function public.set_region_contactos(
  p_region_id               text,
  p_acessibilidade_email    text,
  p_acessibilidade_telefone text,
  p_reclamacao_url          text,
  p_responsavel             text,
  p_responsavel_nome        text,
  p_responsavel_artigo      text,
  p_privacidade_email       text,
  p_actor                   text,
  p_ip_hash                 text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
  v_resp   text := coalesce(nullif(trim(p_responsavel), ''), 'por-preencher');
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se mudam contactos';
  end if;
  if not exists (select 1 from public.regions where id = p_region_id) then
    raise exception 'não há região com o identificador %', p_region_id;
  end if;

  select to_jsonb(c) - 'updated_at' - 'updated_by' into v_antes
    from public.region_contactos c where c.region_id = p_region_id;

  insert into public.region_contactos as c (
    region_id, acessibilidade_email, acessibilidade_telefone, reclamacao_url,
    responsavel, responsavel_nome, responsavel_artigo, privacidade_email, updated_by
  ) values (
    p_region_id,
    nullif(lower(trim(coalesce(p_acessibilidade_email, ''))), ''),
    nullif(trim(coalesce(p_acessibilidade_telefone, '')), ''),
    nullif(trim(coalesce(p_reclamacao_url, '')), ''),
    v_resp,
    case when v_resp = 'outra' then nullif(trim(coalesce(p_responsavel_nome, '')), '') end,
    case when v_resp = 'outra' then coalesce(nullif(trim(p_responsavel_artigo), ''), '') else '' end,
    nullif(lower(trim(coalesce(p_privacidade_email, ''))), ''),
    p_actor
  )
  on conflict (region_id) do update set
    acessibilidade_email    = excluded.acessibilidade_email,
    acessibilidade_telefone = excluded.acessibilidade_telefone,
    reclamacao_url          = excluded.reclamacao_url,
    responsavel             = excluded.responsavel,
    responsavel_nome        = excluded.responsavel_nome,
    responsavel_artigo      = excluded.responsavel_artigo,
    privacidade_email       = excluded.privacidade_email,
    updated_by              = excluded.updated_by
  -- O MESMO NÃO SE REGRAVA: sem isto, gravar sem mudar nada mudava o autor e
  -- a hora da linha, e quem perguntasse «quem pôs este email?» lia o nome de
  -- quem só carregou no botão.
  where (c.acessibilidade_email, c.acessibilidade_telefone, c.reclamacao_url, c.responsavel,
         c.responsavel_nome, c.responsavel_artigo, c.privacidade_email)
        is distinct from
        (excluded.acessibilidade_email, excluded.acessibilidade_telefone, excluded.reclamacao_url,
         excluded.responsavel, excluded.responsavel_nome, excluded.responsavel_artigo,
         excluded.privacidade_email);

  select to_jsonb(c) - 'updated_at' - 'updated_by' into v_depois
    from public.region_contactos c where c.region_id = p_region_id;

  if v_antes is not distinct from v_depois then
    return false;
  end if;

  perform public.log_admin_action(
    p_actor, 'region.contactos', 'region', p_region_id, v_antes, v_depois, p_ip_hash
  );
  return true;
end;
$$;

-- ---------------------------------------------------------------------------

revoke all on table public.region_contactos from public, anon, authenticated;
-- O `select` abre a porta; quem decide o que passa por ela é a policy acima.
grant select on table public.region_contactos to anon, authenticated;
grant select, insert, update, delete on table public.region_contactos to service_role;

revoke all on function public.set_region_contactos(
  text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.set_region_contactos(
  text, text, text, text, text, text, text, text, text, text) to service_role;
