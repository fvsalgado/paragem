-- 0003 — Os módulos de cada região: ligados ou não.
--
-- «Desligar a FlixBus» e «desligar a CP» — o pedido do dono — são interruptores
-- por MODO: `expresso` e `comboio`. É a granularidade que a interface tem (a
-- grelha dos modos, as camadas do mapa, as páginas de modo) e a que quem
-- opera reconhece. Que fonte alimenta cada modo é assunto da receita da
-- região (`fontes.yaml`, `publica: false`), não do painel.
--
-- QUE MÓDULOS EXISTEM É DO CÓDIGO; SE ESTÃO LIGADOS É DA BASE. A lista dos
-- sete modos é a do produto (CLAUDE.md §3 e `NOME_DOS_MODOS` no sítio); que
-- modos cada região TEM é o `modos:` do seu `regiao.yaml`. Esta tabela só
-- guarda os que estão desligados: uma região sem linhas tem tudo ligado, e
-- ligar o que já está ligado por omissão não é um acontecimento.
--
-- O mesmo desenho das `site_sections` do Coreto (migração 0102), com a mesma
-- regra de degradação do lado de quem lê: se a leitura falhar, mostra-se
-- tudo. O contrário — assumir tudo desligado quando não se consegue ler —
-- fazia desaparecer seis modos por causa de uma falha de rede.

create table public.modulos (
  region_id   text not null references public.regions(id) on delete cascade,
  id          text not null
    check (id in ('autocarro', 'a-pedido', 'comboio', 'urbano-municipal',
                  'bicicleta', 'expresso', 'taxi')),
  is_enabled  boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (region_id, id)
);

comment on table public.modulos is
  'O interruptor de cada módulo (modo de transporte) por região. Que módulos '
  'existem é do produto; que modos cada região tem é do seu regiao.yaml; aqui '
  'guarda-se só se cada um está ligado hoje. Sem linhas, tudo ligado. '
  'Escreve-se por set_modulo, que deixa rasto em admin_actions.';

create trigger modulos_set_updated_at
  before update on public.modulos
  for each row execute function public.set_updated_at();

-- O sítio lê isto com a chave anónima para decidir o que desenha.
alter table public.modulos enable row level security;

create policy modulos_public_read on public.modulos
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Ligar e desligar um módulo — o único caminho de escrita, com auditoria
-- ---------------------------------------------------------------------------
create or replace function public.set_modulo(
  p_region  text,
  p_id      text,
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
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se liga nem desliga nada';
  end if;
  if not exists (select 1 from public.regions where id = p_region) then
    raise exception 'não há região com o identificador %', p_region;
  end if;

  select is_enabled into v_antes
  from public.modulos
  where region_id = p_region and id = p_id
  for update;

  if not found then
    -- Sem linha, o módulo está ligado. Ligar o que já está ligado não é um
    -- acontecimento; desligar é o primeiro toque, e cria a linha.
    if p_enabled then
      return false;
    end if;
    -- A restrição da tabela recusa um identificador que não seja dos sete,
    -- com a mensagem do Postgres; aqui fica a frase em português.
    if p_id not in ('autocarro', 'a-pedido', 'comboio', 'urbano-municipal',
                    'bicicleta', 'expresso', 'taxi') then
      raise exception 'não há módulo com o identificador %', p_id;
    end if;
    insert into public.modulos (region_id, id, is_enabled, updated_by)
    values (p_region, p_id, false, p_actor);
    v_antes := true;
  else
    if v_antes = p_enabled then
      return false;
    end if;
    update public.modulos
    set is_enabled = p_enabled, updated_by = p_actor
    where region_id = p_region and id = p_id;
  end if;

  perform public.log_admin_action(
    p_actor,
    case when p_enabled then 'module.enable' else 'module.disable' end,
    'module',
    p_region || '/' || p_id,
    jsonb_build_object('is_enabled', v_antes),
    jsonb_build_object('is_enabled', p_enabled),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.set_modulo(text, text, boolean, text, text) is
  'Liga ou desliga um módulo numa região, com linha de auditoria. Devolve '
  'false quando já estava assim.';

revoke all on function public.set_modulo(text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_modulo(text, text, boolean, text, text)
  to service_role;
