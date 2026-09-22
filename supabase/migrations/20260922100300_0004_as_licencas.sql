-- 0004 — As licenças das regiões: contratos com prazo, à vista do painel.
--
-- Cada região é um contrato comercial com a sua autoridade de transportes —
-- datas próprias, termos próprios, renovações. Isto NÃO é a licença do
-- software (essa é a AGPL, com o nome e a marca de fora — ver AUTORIA.md): é
-- o registo de negócio de quem pode usar o serviço e até quando.
--
-- Levantado do Coreto (migração 0112), com as mesmas três decisões:
--
--   1. Histórico, não estado. Uma linha por contrato ou renovação, nunca um
--      update. Corrigir é acrescentar, com nota.
--   2. Expirar não desliga. O painel avisa; o corte é um gesto humano no
--      interruptor da região. Um relógio não deve tirar do ar os horários de
--      uma região.
--   3. Invisível ao público. RLS ligada e nenhuma policy. Só a chave de
--      serviço lê.

create table public.region_licenses (
  id         uuid primary key default gen_random_uuid(),
  region_id  text not null references public.regions(id) on delete cascade,
  starts_on  date not null,
  -- Nulo = sem prazo (uma demonstração, um piloto aberto).
  ends_on    date,
  -- «contrato», «piloto», «demo», «cortesia» — texto livre, curto.
  kind       text not null,
  notes      text,
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint region_licenses_prazo_ordenado
    check (ends_on is null or ends_on >= starts_on)
);

comment on table public.region_licenses is
  'O registo comercial de cada região: uma linha por contrato ou renovação, '
  'histórico e nunca reescrito. Expirar avisa no painel; desligar é sempre '
  'um gesto humano. Nada disto é público.';

alter table public.region_licenses enable row level security;

create or replace function public.add_region_license(
  p_region_id text,
  p_starts_on date,
  p_ends_on   date,
  p_kind      text,
  p_notes     text,
  p_actor     text,
  p_ip_hash   text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se regista licença nenhuma';
  end if;
  if coalesce(trim(p_kind), '') = '' then
    raise exception 'a licença precisa de um tipo — «contrato», «piloto», o que for';
  end if;
  if not exists (select 1 from public.regions where id = p_region_id) then
    raise exception 'não há região com o identificador %', p_region_id;
  end if;

  insert into public.region_licenses (region_id, starts_on, ends_on, kind, notes, created_by)
  values (p_region_id, p_starts_on, p_ends_on, trim(p_kind),
          nullif(trim(coalesce(p_notes, '')), ''), p_actor)
  returning id into v_id;

  perform public.log_admin_action(
    p_actor, 'region.license_add', 'region', p_region_id,
    null,
    jsonb_build_object('license_id', v_id, 'starts_on', p_starts_on,
                       'ends_on', p_ends_on, 'kind', trim(p_kind)),
    p_ip_hash
  );

  return v_id;
end;
$$;

comment on function public.add_region_license(text, date, date, text, text, text, text) is
  'Regista uma licença de região, com linha de auditoria. Insert-only.';

revoke all on function public.add_region_license(text, date, date, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_region_license(text, date, date, text, text, text, text)
  to service_role;

-- As duas regiões de prova nascem licenciadas a si próprias, sem prazo: são a
-- demonstração do produto. Uma região real NÃO tem linha aqui, e é a verdade
-- — não há contrato assinado enquanto não houver (CLAUDE.md §9, Fase 5). A
-- primeira linha dela entra pelo painel no dia em que houver.
insert into public.region_licenses (region_id, starts_on, ends_on, kind, notes, created_by) values
  ('prova',           current_date, null, 'demo',
   'A região de prova do produto. Sem prazo por natureza.', 'migracao-0004'),
  ('prova-municipio', current_date, null, 'demo',
   'A segunda região de prova — uma autoridade que é um município. Sem prazo.', 'migracao-0004');
