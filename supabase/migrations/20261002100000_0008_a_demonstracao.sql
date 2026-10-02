-- ---------------------------------------------------------------------------
-- A REGIÃO DE DEMONSTRAÇÃO: as Terras do Ameno.
--
-- As duas regiões de prova são o dia zero — de propósito mínimas, para provar
-- que uma região nasce sem código. Esta é o dia 100: a que se mostra a quem
-- decide, com os sete modos e um mapa desenhado por nós (regioes/demo/).
--
-- Nasce aqui pela mesma razão das provas (migração 0002): é inventada de fio
-- a pavio, vai para o repositório público inteira, e não é de nenhum cliente.
-- Uma região REAL continua a nascer no painel, nunca numa migração.
--
-- Os valores de `name`, `article` e `domain` são os de regioes/demo/regiao.yaml,
-- letra a letra — `ferramentas/verificar-seeds.py` confere no CI. O domínio
-- tem de entrar também no projeto da plataforma de alojamento para responder.
-- ---------------------------------------------------------------------------
insert into public.regions (id, name, article, domain, is_enabled, sort_order) values
  ('demo', 'Terras do Ameno', 'as', 'demo.paragem.pt', true, 89);

-- Licenciada a si própria, sem prazo, como as provas: é a demonstração.
insert into public.region_licenses (region_id, starts_on, ends_on, kind, notes, created_by) values
  ('demo', current_date, null, 'demo',
   'A região de demonstração do produto — a «no dia 100». Sem prazo por natureza.',
   'migracao-0008');

-- ---------------------------------------------------------------------------
-- OS AVISOS DE EXEMPLO.
--
-- Uma página de avisos vazia não mostra a quem decide o que o painel faz. Por
-- isso a demonstração nasce com dois, já publicados — e DIZEM QUE SÃO
-- EXEMPLOS, no título e no texto: são lidos por quem abre o sítio, e uma
-- obra inventada apresentada como verdadeira era o que o produto se recusa a
-- fazer em todo o lado (CLAUDE.md §4.4).
--
-- Só a demonstração os tem: `ferramentas/verificar-seeds.py` confere que todo
-- o aviso que uma migração semeia é de uma região declarada
-- `demonstracao: true`. Sem prazo (`inicio` e `fim` nulos), para não
-- envelhecerem como o calendário das provas envelheceu.
-- ---------------------------------------------------------------------------
insert into public.avisos (
  id, region_id, titulo, texto, gravidade, causa, efeito,
  inicio, fim, linhas, paragens, modos, url, publicado, created_by
) values
  ('d3e0a000-0000-4000-8000-000000000001', 'demo',
   'Exemplo: obras na Rua Direita de Porto Ameno',
   'Isto é um aviso de exemplo, numa região inventada, para mostrar como a autoridade '
   'de transportes publica uma alteração ao serviço. Durante as obras, a Circular de '
   'Porto Ameno (linha 11) não para no Largo da Fonte: a paragem mais perto é a do '
   'Terminal, a cinco minutos a pé.',
   'WARNING', 'CONSTRUCTION', 'DETOUR',
   null, null, '{RA11}', '{pam_fonte}', '{autocarro}', null, true, 'migracao-0008'),
  ('d3e0a000-0000-4000-8000-000000000002', 'demo',
   'Exemplo: duas estações da Bici Ameno fechadas para manutenção',
   'Isto é um aviso de exemplo, numa região inventada. As estações do Castelo de Almeão '
   'e do Jardim do Rio estão fechadas para manutenção; as outras seis funcionam como de '
   'costume.',
   'INFO', 'MAINTENANCE', 'REDUCED_SERVICE',
   null, null, '{}', '{}', '{bicicleta}', null, true, 'migracao-0008');

-- A rede de segurança desta migração.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.avisos
   where created_by = 'migracao-0008' and titulo like 'Exemplo:%' and publicado;
  if v_n <> 2 then
    raise exception 'os avisos de exemplo da demonstração não ficaram como deviam (%)', v_n;
  end if;
end $$;
