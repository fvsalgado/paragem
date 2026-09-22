-- 0005 — O limite de tentativas de entrada no painel.
--
-- O painel (`/admin`) tem uma palavra-passe e não tem contas: quem a sabe
-- entra. Uma palavra-passe só vale enquanto ninguém a puder adivinhar às
-- cegas, e é isto que trava as adivinhas: uma contagem por origem e por
-- janela de tempo, incrementada e lida numa só ida à base.
--
-- Levantado do Coreto (migrações 0005 e 0007, `rate_limits` e
-- `rate_limit_hit`), com uma diferença: lá há um cron de manutenção que chama
-- `prune_rate_limits`; aqui a própria função limpa o que já não conta, porque
-- a tabela só guarda tentativas de entrada — dezenas de linhas, não milhares —
-- e um cron para apagar dez linhas era uma peça a mais para falhar às três da
-- manhã.
--
-- Sem Redis nem serviço externo, de propósito. Chega para o que isto tem de
-- aguentar; uma dependência a menos é uma coisa a menos para falhar.
--
-- O QUE FICA GUARDADO: um balde (`<rota>:<hash do IP>`) e uma contagem. O
-- endereço IP nunca entra em claro — quem chama já o traz reduzido a um hash
-- com sal (`web/src/lib/painel/ip.ts`), e daqui não se reconstrói.

create table public.rate_limits (
  bucket       text not null,              -- '<rota>:<hash do IP>'
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

comment on table public.rate_limits is
  'Tentativas por origem e por janela de tempo — hoje só a entrada no painel. '
  'O balde é o hash do IP com sal, nunca o endereço. As janelas velhas '
  'apagam-se de cada vez que a função corre.';

create index rate_limits_window_idx on public.rate_limits (window_start);

-- Invisível ao público: RLS ligada e nenhuma policy. Só a chave de serviço
-- lhe toca, e só através da função.
alter table public.rate_limits enable row level security;

-- Incrementa e devolve o número de pedidos na janela corrente. Uma só ida à
-- base por tentativa; a janela é fixa, não deslizante, o que é suficiente
-- para travar abuso sem guardar histórico de ninguém.
create or replace function public.rate_limit_hit(
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

  -- A limpeza vive aqui e não num cron: o que já saiu de todas as janelas
  -- possíveis não serve para nada, e a tabela é pequena de propósito.
  delete from public.rate_limits where window_start < now() - interval '2 days';

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
  do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  return query select v_hits <= p_limit, v_hits,
                      v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is
  'Conta uma tentativa no balde e diz se ainda cabe no limite da janela. '
  'Limpa as janelas com mais de dois dias de cada vez que corre.';

revoke all on function public.rate_limit_hit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer)
  to service_role;
