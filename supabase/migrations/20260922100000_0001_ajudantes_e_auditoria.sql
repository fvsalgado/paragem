-- 0001 — Os ajudantes, e o registo de quem fez o quê.
--
-- A base de dados do Paragem.pt guarda POUCO, de propósito. O conteúdo — as
-- paragens, as linhas, os horários, os mosaicos — é construído pelo pipeline
-- a partir das fontes e vive em ficheiros (docs/BASE-DE-DADOS.md). O que vive
-- aqui é o que o painel governa em tempo de execução: que regiões estão
-- ligadas, em que domínio respondem, que módulos cada uma mostra, e o
-- registo de cada alteração.
--
-- É o mesmo desenho do Coreto (fvsalgado/coreto, migrações 0006 e 0101 em
-- diante), levantado e reduzido. Onde o Coreto guarda a identidade inteira de
-- uma região na base, aqui ela continua em `regioes/<id>/regiao.yaml`, porque
-- é o pipeline que a lê e porque uma região tem de poder viver noutra raiz
-- (CLAUDE.md §11.6). A base guarda só o interruptor e o rasto.

-- ---------------------------------------------------------------------------
-- updated_at por trigger, para ninguém se esquecer de o escrever
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_actions — cada gesto do painel, com o antes e o depois
--
-- Nunca se reescreve e nunca se apaga: uma correção é uma linha nova. É o que
-- permite responder «quem desligou o comboio nesta região, e quando» sem
-- adivinhar — e é a razão de nenhuma escrita do painel tocar nas tabelas
-- diretamente: todas passam por uma função SQL que insere aqui.
-- ---------------------------------------------------------------------------
create table public.admin_actions (
  id           bigint generated always as identity primary key,
  actor        text not null,
  action       text not null,          -- 'region.enable', 'module.disable', …
  entity_type  text not null,          -- 'region', 'module', 'license'
  entity_id    text not null,
  before       jsonb,
  after        jsonb,
  ip_hash      text,
  created_at   timestamptz not null default now()
);

comment on table public.admin_actions is
  'O registo de auditoria do painel. Insert-only: nunca se reescreve nem se '
  'apaga. Toda a escrita do painel passa por uma função SQL que deixa aqui '
  'uma linha com o antes e o depois.';

create index admin_actions_entity_idx
  on public.admin_actions (entity_type, entity_id, created_at desc);
create index admin_actions_created_idx
  on public.admin_actions (created_at desc);

-- Invisível ao público: RLS ligada e nenhuma policy. Só a chave de serviço lê.
alter table public.admin_actions enable row level security;

create or replace function public.log_admin_action(
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip_hash text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se regista nada';
  end if;
  insert into public.admin_actions (actor, action, entity_type, entity_id, before, after, ip_hash)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_before, p_after, p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_admin_action(text, text, text, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.log_admin_action(text, text, text, text, jsonb, jsonb, text)
  to service_role;
