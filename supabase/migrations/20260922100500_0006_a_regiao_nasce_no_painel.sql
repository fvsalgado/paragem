-- 0006 — A região nasce no painel, e o domínio muda lá.
--
-- A 0002 semeou as regiões de prova e disse que uma região REAL entra pelo
-- painel, nunca por uma migração — e não deu ao painel função nenhuma para o
-- fazer. Esta dá-lhe as quatro que faltavam, todas pelo mesmo caminho das
-- outras: nenhuma escrita toca nas tabelas por fora, todas deixam linha em
-- `admin_actions` com o antes e o depois.
--
--   · `create_region` — a linha nova, DESLIGADA à nascença. Uma região nasce no
--     painel antes de os dados dela estarem no armazém, e ligá-la sem dados
--     era pôr um domínio a responder 404. Liga-se depois, com um gesto que
--     fica registado.
--   · `set_region_domain` — o dia em que a autoridade traz o domínio dela. O
--     antigo pode ficar como alias, para as ligações que andam por aí
--     continuarem a chegar (308).
--   · `add_region_alias` e `remove_region_alias` — os outros endereços, que só
--     redirecionam.
--
-- O QUE NÃO SE MUDA AQUI: o nome e o artigo. São identidade da região e vivem
-- no `regiao.yaml` dela; a base guarda uma cópia que o CI confere
-- (`ferramentas/verificar-seeds.py`). Uma função para os mudar no painel era
-- um convite a que a base e o ficheiro divergissem — e o CI reprovava a
-- seguir, com razão.

-- Os identificadores são os das pastas em `regioes/`: minúsculas, dígitos e
-- hífens. É a mesma expressão do sítio (`IDENTIFICADOR` em `dados.ts`).
create or replace function public.identificador_de_regiao_valido(p_id text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_id ~ '^[a-z0-9][a-z0-9-]{0,63}$';
$$;

-- Um domínio vem de um formulário: tira-se o que sobra e baixa-se a caixa. O
-- que passar daqui tem ainda de passar na restrição da tabela (sem barras,
-- dois-pontos nem espaços).
create or replace function public.dominio_normalizado(p_domain text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(trim(coalesce(p_domain, '')));
$$;

-- ---------------------------------------------------------------------------
-- create_region — a linha nova, desligada, com rasto
-- ---------------------------------------------------------------------------
create or replace function public.create_region(
  p_id         text,
  p_name       text,
  p_article    text,
  p_domain     text,
  p_sort_order integer,
  p_actor      text,
  p_ip_hash    text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := public.dominio_normalizado(p_domain);
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não nasce região nenhuma';
  end if;
  if not public.identificador_de_regiao_valido(p_id) then
    raise exception 'o identificador «%» não serve: minúsculas, dígitos e hífens, a começar por letra ou dígito', coalesce(p_id, '');
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a região precisa de nome — o do regiao.yaml, letra a letra';
  end if;
  if p_article is null or p_article not in ('o', 'a', 'os', 'as') then
    raise exception 'o artigo tem de ser «o», «a», «os» ou «as»';
  end if;
  if v_domain = '' then
    raise exception 'a região precisa do domínio em que responde';
  end if;
  if exists (select 1 from public.regions where id = p_id) then
    raise exception 'já há uma região com o identificador %', p_id;
  end if;
  if exists (select 1 from public.regions where domain = v_domain) then
    raise exception 'o domínio % já é o canónico de outra região', v_domain;
  end if;
  if exists (select 1 from public.region_domain_aliases where domain = v_domain) then
    raise exception 'o domínio % já é alias de outra região', v_domain;
  end if;

  insert into public.regions (id, name, article, domain, is_enabled, sort_order)
  values (p_id, trim(p_name), p_article, v_domain, false, coalesce(p_sort_order, 0));

  perform public.log_admin_action(
    p_actor, 'region.create', 'region', p_id,
    null,
    jsonb_build_object('name', trim(p_name), 'article', p_article,
                       'domain', v_domain, 'sort_order', coalesce(p_sort_order, 0),
                       'is_enabled', false),
    p_ip_hash
  );

  return p_id;
end;
$$;

comment on function public.create_region(text, text, text, text, integer, text, text) is
  'Cria a linha de uma região, DESLIGADA, com linha de auditoria. O nome, o '
  'artigo e o domínio são os do regiao.yaml dela; o CI confere.';

revoke all on function public.create_region(text, text, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.create_region(text, text, text, text, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- set_region_domain — o canónico muda; o antigo pode ficar a redirecionar
-- ---------------------------------------------------------------------------
create or replace function public.set_region_domain(
  p_region      text,
  p_domain      text,
  p_keep_alias  boolean,
  p_actor       text,
  p_ip_hash     text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := public.dominio_normalizado(p_domain);
  v_antes  text;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se muda domínio nenhum';
  end if;
  if v_domain = '' then
    raise exception 'a região precisa do domínio em que responde';
  end if;

  select domain into v_antes from public.regions where id = p_region for update;
  if not found then
    raise exception 'não há região com o identificador %', p_region;
  end if;
  if v_antes = v_domain then
    return false;  -- já era; não é um acontecimento
  end if;
  if exists (select 1 from public.regions where domain = v_domain and id <> p_region) then
    raise exception 'o domínio % já é o canónico de outra região', v_domain;
  end if;
  if exists (select 1 from public.region_domain_aliases
              where domain = v_domain and region_id <> p_region) then
    raise exception 'o domínio % já é alias de outra região', v_domain;
  end if;

  -- Um alias desta região promovido a canónico deixa de ser alias: o mesmo
  -- host nas duas listas era um laço de redirecionamento.
  delete from public.region_domain_aliases where domain = v_domain and region_id = p_region;

  update public.regions set domain = v_domain where id = p_region;

  if p_keep_alias then
    insert into public.region_domain_aliases (domain, region_id)
    values (v_antes, p_region)
    on conflict (domain) do nothing;
  end if;

  perform public.log_admin_action(
    p_actor, 'region.domain', 'region', p_region,
    jsonb_build_object('domain', v_antes),
    jsonb_build_object('domain', v_domain, 'old_domain_kept_as_alias', coalesce(p_keep_alias, false)),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.set_region_domain(text, text, boolean, text, text) is
  'Muda o domínio canónico de uma região, com linha de auditoria; com '
  'p_keep_alias o antigo passa a alias e redireciona. Devolve false quando já era.';

revoke all on function public.set_region_domain(text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_region_domain(text, text, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- add_region_alias / remove_region_alias — os endereços que só redirecionam
-- ---------------------------------------------------------------------------
create or replace function public.add_region_alias(
  p_domain  text,
  p_region  text,
  p_actor   text,
  p_ip_hash text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := public.dominio_normalizado(p_domain);
  v_de     text;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se acrescenta alias nenhum';
  end if;
  if v_domain = '' then
    raise exception 'o alias precisa de um domínio';
  end if;
  if not exists (select 1 from public.regions where id = p_region) then
    raise exception 'não há região com o identificador %', p_region;
  end if;
  if exists (select 1 from public.regions where domain = v_domain) then
    raise exception 'o domínio % é o canónico de uma região, e um canónico não redireciona', v_domain;
  end if;

  select region_id into v_de from public.region_domain_aliases where domain = v_domain;
  if found then
    if v_de = p_region then
      return false;  -- já era alias desta; não é um acontecimento
    end if;
    raise exception 'o domínio % já é alias de outra região', v_domain;
  end if;

  insert into public.region_domain_aliases (domain, region_id) values (v_domain, p_region);

  perform public.log_admin_action(
    p_actor, 'region.alias_add', 'region', p_region,
    null,
    jsonb_build_object('domain', v_domain),
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.add_region_alias(text, text, text, text) is
  'Acrescenta um alias a uma região, com linha de auditoria. Devolve false '
  'quando já o era.';

revoke all on function public.add_region_alias(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.add_region_alias(text, text, text, text)
  to service_role;

create or replace function public.remove_region_alias(
  p_domain  text,
  p_actor   text,
  p_ip_hash text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := public.dominio_normalizado(p_domain);
  v_de     text;
begin
  if p_actor is null or p_actor = '' then
    raise exception 'sem autor não se retira alias nenhum';
  end if;

  delete from public.region_domain_aliases where domain = v_domain
  returning region_id into v_de;
  if not found then
    return false;
  end if;

  perform public.log_admin_action(
    p_actor, 'region.alias_remove', 'region', v_de,
    jsonb_build_object('domain', v_domain),
    null,
    p_ip_hash
  );

  return true;
end;
$$;

comment on function public.remove_region_alias(text, text, text) is
  'Retira um alias, com linha de auditoria. Devolve false quando não havia.';

revoke all on function public.remove_region_alias(text, text, text)
  from public, anon, authenticated;
grant execute on function public.remove_region_alias(text, text, text)
  to service_role;

-- As duas funções puras são úteis a quem lê; não escrevem nada.
grant execute on function public.identificador_de_regiao_valido(text)
  to anon, authenticated, service_role;
grant execute on function public.dominio_normalizado(text)
  to anon, authenticated, service_role;
