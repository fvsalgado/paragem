import 'server-only';

/**
 * A base do painel, pela chave de serviço.
 *
 * Sem biblioteca: o PostgREST fala HTTP, e o sítio já o lê assim pela chave
 * pública (`dados.ts`, `regiao-host.ts`). Duas maneiras de falar com a mesma
 * base divergem; esta é a mesma, com outra chave.
 *
 * A chave de serviço ignora a RLS, e é por isso que só existe aqui, num módulo
 * `server-only`, e nunca em nada `NEXT_PUBLIC_`. As ESCRITAS não tocam em
 * tabela nenhuma: chamam as funções SQL (`set_region_enabled`, `set_modulo`,
 * `add_region_license`, `create_region`, …), que são o único caminho de
 * escrita e as que deixam a linha em `admin_actions`. As leituras são sempre
 * frescas (`no-store`): um interruptor que mostra o estado de há meia hora é
 * um interruptor em que ninguém confia.
 */

const PRAZO_MS = 8000;

function endereco(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
}

function chave(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
}

/** `true` quando há chave de serviço — só existe no servidor. */
export function temChaveDeServico(): boolean {
  return Boolean(endereco()) && Boolean(chave());
}

/** O que o PostgREST diz quando recusa: a frase da função, em português. */
export class ErroDaBase extends Error {
  constructor(
    mensagem: string,
    readonly estado: number,
    readonly codigo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroDaBase';
  }
}

function cabecalhos(): Record<string, string> {
  return {
    apikey: chave(),
    authorization: `Bearer ${chave()}`,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

async function erroDe(resposta: Response, contexto: string): Promise<ErroDaBase> {
  let mensagem = `${contexto}: HTTP ${resposta.status}`;
  let codigo: string | undefined;
  try {
    const corpo = (await resposta.json()) as { message?: string; hint?: string; code?: string };
    if (corpo.message) mensagem = corpo.message;
    if (corpo.hint) mensagem += ` (${corpo.hint})`;
    codigo = corpo.code;
  } catch {
    // Sem corpo, fica o estado HTTP.
  }
  return new ErroDaBase(mensagem, resposta.status, codigo);
}

function exigirChave(): void {
  if (!temChaveDeServico()) throw new ErroDaBase('SUPABASE_SERVICE_ROLE_KEY em falta', 0);
}

/** Lê linhas de uma tabela: `ler('regions', 'select=*&order=id')`. */
export async function ler<T>(tabela: string, consulta: string): Promise<T[]> {
  exigirChave();
  const resposta = await fetch(`${endereco()}/rest/v1/${tabela}?${consulta}`, {
    headers: cabecalhos(),
    cache: 'no-store',
    signal: AbortSignal.timeout(PRAZO_MS),
  });
  if (!resposta.ok) throw await erroDe(resposta, tabela);
  return (await resposta.json()) as T[];
}

/**
 * Chama uma função SQL: `chamar('set_modulo', { p_region: 'prova', … })`.
 * Uma exceção levantada na função chega aqui como `ErroDaBase` com a frase
 * dela — «não se desliga a última região ligada» —, que é o que o painel
 * mostra a quem carregou no botão.
 */
export async function chamar<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  exigirChave();
  const resposta = await fetch(`${endereco()}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify(argumentos),
    cache: 'no-store',
    signal: AbortSignal.timeout(PRAZO_MS),
  });
  if (!resposta.ok) throw await erroDe(resposta, funcao);
  const texto = await resposta.text();
  return (texto ? JSON.parse(texto) : null) as T;
}
