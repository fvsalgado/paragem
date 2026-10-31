-- 0011 — A chave pública só lê, e há nomes que nenhuma região pode ter.
--
-- Da auditoria de 31/10/2026, com o sim do dono no mesmo dia. Nada muda para
-- quem visita o sítio.
--
-- 1. A CHAVE PÚBLICA SÓ LÊ. Na base real, o `anon` tinha todos os privilégios
--    de tabela nas seis tabelas do painel (`regions`, `region_domain_aliases`,
--    `modulos`, `region_licenses`, `admin_actions`, `rate_limits`): são os que
--    o Supabase dá por omissão a cada tabela nova do esquema `public`. A RLS
--    já recusava as escritas, e a escrita desta casa é só pela chave de
--    serviço, por função (0001). Mas o `TRUNCATE` não passa pela RLS, e a
--    regra não pode depender de a API não o expor. Fica o `SELECT`, que a RLS
--    filtra; sai o resto. E sai também dos privilégios por omissão, para a
--    tabela seguinte não nascer com eles. Nas migrações ensaiadas no CI o
--    `anon` nunca os teve, e por isso lá isto não muda nada: a asserção em
--    `scripts/schema-checks.sql` é que guarda a base real.
--
-- 2. OS NOMES RESERVADOS. Uma região é servida em `/<id>/…` por dentro
--    (`regiao-host.ts`), e dois segmentos de topo do sítio não são de região
--    nenhuma: `api`, que o encaminhador deixa passar sempre para as rotas da
--    API, e `admin`, que é o painel. Uma região chamada `api` não abria uma
--    página; uma chamada `admin` servia o painel no domínio dela. Os segmentos
--    internos (`-produto`, `-widget`) já estão fora, porque um identificador
--    não começa por hífen.
--
-- Volta atrás: `grant insert, update, delete, truncate, references, trigger
-- on <tabela> to anon`, os privilégios por omissão como estavam, e `alter
-- table public.regions drop constraint regions_id_nao_reservado`.

do $$
declare
  t text;
begin
  foreach t in array array[
    'regions', 'region_domain_aliases', 'modulos', 'region_licenses',
    'admin_actions', 'rate_limits'
  ] loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      t
    );
  end loop;
end
$$;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon;

alter table public.regions
  add constraint regions_id_nao_reservado
  check (id not in ('admin', 'api'));

comment on constraint regions_id_nao_reservado on public.regions is
  'Segmentos de topo do sítio que não são de região nenhuma: /api/ é a API e '
  '/admin/ é o painel (0011).';
