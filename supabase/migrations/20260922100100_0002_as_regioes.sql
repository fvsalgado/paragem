-- 0002 — As regiões: ligadas ou não, e em que domínio respondem.
--
-- Uma região do Paragem.pt é uma autoridade de transportes e o território que
-- ela serve (CLAUDE.md §11.3). O que ela É — nome, artigo, autoridade, caixa,
-- concelhos, modos, receita — está em `regioes/<id>/regiao.yaml`, que é o que
-- o pipeline lê. Esta tabela guarda o que só faz sentido em tempo de
-- execução, e que o painel muda sem um commit:
--
--   · se está ligada — uma região desligada desaparece do mapa de domínios e
--     o middleware deixa de a servir;
--   · o domínio canónico em que responde — é por aqui que um pedido a
--     prova.paragem.pt vira a Serra da Pedra Alta e um a <outra>.paragem.pt
--     vira a outra. O §4.7 manda não fixar o domínio no código, e não está: é um
--     dado, numa linha, que se muda no painel.
--
-- O nome e o artigo estão aqui EM DUPLICADO, de propósito e com guarda: o
-- painel precisa deles para listar regiões sem ir buscar ficheiros a lado
-- nenhum, e `ferramentas/verificar-seeds.py` compara-os, no CI, com o que o
-- `regiao.yaml` declara. Uma cópia com verificação é aceitável; uma cópia
-- sem ela é a que diverge em silêncio.
--
-- Os identificadores são os das pastas em `regioes/`. Não mudam.

create table public.regions (
  id          text primary key,      -- 'prova': a pasta em regioes/
  name        text not null,         -- 'Serra da Pedra Alta'
  article     text not null          -- «a» Serra da Pedra Alta, «o» Baixo Sável
    check (article in ('o', 'a', 'os', 'as')),

  -- O Host canónico. Único: dois domínios a servir a mesma região eram
  -- conteúdo duplicado; o segundo entra como alias (abaixo) e redireciona.
  domain      text not null unique
    check (domain = lower(domain) and domain !~ '[/:\s]'),

  is_enabled  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.regions is
  'As regiões servidas pelo Paragem.pt: o interruptor e o domínio de cada uma. '
  'A identidade inteira continua em regioes/<id>/regiao.yaml; o nome e o '
  'artigo repetem-se aqui só para o painel, e o CI confere que batem certo.';

create trigger regions_set_updated_at
  before update on public.regions
  for each row execute function public.set_updated_at();

-- Leitura pública só do que está ligado — é isto que faz uma região
-- desligada desaparecer do mapa que o middleware lê com a chave anónima.
-- Escrita, como em toda a base, só pela chave de serviço, por função.
alter table public.regions enable row level security;

create policy regions_public_read on public.regions
  for select to anon, authenticated using (is_enabled);

-- ---------------------------------------------------------------------------
-- region_domain_aliases — os outros endereços, que só redirecionam
--
-- Um alias é encaminhamento, não identidade: nunca serve conteúdo, redireciona
-- (308) para o canónico com o caminho intacto. A regra de que um alias não
-- pode ser o canónico de ninguém vive em scripts/schema-checks.sql, que é
-- onde as regras entre tabelas desta casa vivem.
-- ---------------------------------------------------------------------------
create table public.region_domain_aliases (
  domain     text primary key
    check (domain = lower(domain) and domain !~ '[/:\s]'),
  region_id  text not null references public.regions(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.region_domain_aliases is
  'Domínios que redirecionam (308) para o canónico da sua região. '
  'Encaminhamento, não identidade: um alias nunca serve conteúdo.';

alter table public.region_domain_aliases enable row level security;

create policy region_domain_aliases_public_read on public.region_domain_aliases
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Ligar e desligar uma região — o único caminho de escrita, com auditoria
-- ---------------------------------------------------------------------------
create or replace function public.set_region_enabled(
  p_region  text,
  p_enabled boolean,
  p_actor   text,
  p_ip_hash text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean;
  v_ligadas integer;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se liga nem desliga nada';
  end if;

  select is_enabled into v_antes
  from public.regions
  where id = p_region
  for update;

  if not found then
    raise exception 'não há região com o identificador %', p_region;
  end if;

  if v_antes = p_enabled then
    return false;  -- não é um acontecimento; não se regista
  end if;

  -- Nunca se desliga a última. Um produto sem uma única região ligada é um
  -- produto que não responde a ninguém, e isso não se faz por engano.
  if not p_enabled then
    select count(*) into v_ligadas from public.regions where is_enabled and id <> p_region;
    if v_ligadas = 0 then
      raise exception 'não se desliga a última região ligada';
    end if;
  end if;

  update public.regions
  set is_enabled = p_enabled
  where id = p_region;

  perform public.log_admin_action(
    p_actor,
    case when p_enabled then 'region.enable' else 'region.disable' end,
    'region',
    p_region,
    jsonb_build_object('is_enabled', v_antes),
    jsonb_build_object('is_enabled', p_enabled),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.set_region_enabled(text, boolean, text, text) is
  'Liga ou desliga uma região, com linha de auditoria. Devolve false quando '
  'já estava assim. Recusa desligar a última.';

revoke all on function public.set_region_enabled(text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_region_enabled(text, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- As regiões de prova nascem aqui. As reais, não.
--
-- As migrações trazem o PRODUTO: o esquema e a sua demonstração — as duas
-- regiões de prova, que são inventadas e vão para o repositório público
-- inteiras. Uma região REAL é um dado desta instalação, não do produto: a
-- linha dela entra pelo painel (ou por SQL, na raiz onde ela vive — ver
-- docs/NOVA-REGIAO.md), nunca por uma migração. É a regra do Coreto
-- («isto não é uma migração»), e aqui vale por mais uma razão: o esqueleto
-- público leva estas migrações tal e qual, e o nome de um cliente numa
-- migração era o nome de um cliente publicado.
--
-- Os valores de `name`, `article` e `domain` são os de
-- regioes/<id>/regiao.yaml, letra a letra — `ferramentas/verificar-seeds.py`
-- confere no CI. Nenhum destes domínios resolve ainda: entram no Vercel e no
-- DNS quando o middleware por host chegar. Até lá, esta tabela é um registo
-- que nada lê — e é de propósito que entra primeiro: prova-se a base antes
-- de haver quem dependa dela.
-- ---------------------------------------------------------------------------
insert into public.regions (id, name, article, domain, is_enabled, sort_order) values
  ('prova',           'Serra da Pedra Alta', 'a', 'prova.paragem.pt',           true, 90),
  ('prova-municipio', 'Baixo Sável',         'o', 'prova-municipio.paragem.pt', true, 91);

-- A rede de segurança desta migração.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.regions where is_enabled;
  if v_n < 1 then
    raise exception 'não ficou uma única região ligada';
  end if;
end $$;
