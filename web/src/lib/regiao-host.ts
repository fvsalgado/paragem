/**
 * De que região é este pedido — decidido pelo Host, no middleware.
 *
 * O contrato do multi-região é: cada região tem o seu domínio
 * (`regions.domain`, declarado no `regiao.yaml` dela e copiado para a base), e
 * um pedido a esse domínio vê essa região. O middleware lê o cabeçalho Host,
 * traduz para o identificador e reescreve o caminho para o segmento interno
 * `/<regiao>/…` — é reescrita e nunca `headers()` numa página, porque uma
 * página que lê o Host deixa de poder ficar em cache, e é a cache que faz
 * este sítio aguentar-se com o motor em baixo.
 *
 * Levantado do Coreto (`src/lib/regiao-host.ts`), com a mesma regra de
 * degradação, que é a decisão central do módulo: **um Host que não é de
 * nenhuma região não vale região nenhuma.** Vale `null`, e o middleware
 * serve-lhe só a página do produto — nunca a rede de um cliente num endereço
 * que ninguém lhe atribuiu. Um preview da plataforma, um `localhost`, um Host
 * esquisito: todos veem a montra, e mais nada. O caminho antigo
 * (`/<regiao>/…` num anfitrião qualquer) deixa de existir por decisão do dono
 * (CLAUDE.md §11.7).
 *
 * Duas fontes para o mapa, e a ordem importa:
 *
 *   1. a BASE do painel — `public.regions` (só as ligadas) e
 *      `region_domain_aliases` —, lida pela porta pública com a chave
 *      anónima. É o que faz uma região nova entrar sem deploy: liga-se na
 *      base, e cinco minutos depois o domínio dela responde;
 *   2. o AMBIENTE, `PARAGEM_DOMINIOS` (`id=host,id=host`), que se SOMA ao
 *      que a base diz. É como o CI testa três regiões em `*.localhost` sem
 *      base nenhuma, e como uma pré-visualização da plataforma mostra uma
 *      região no seu endereço provisório.
 *
 * Uma falha na leitura da base não rebenta: serve-se o mapa que já se tinha —
 * ou só o do ambiente, ou o vazio, em que todos os anfitriões são
 * desconhecidos e veem a montra. Degradar, nunca partir, e nunca para a casa
 * de outra pessoa.
 *
 * Isto corre no runtime de edge, e por isso não importa nada do Node nem do
 * `next/cache`: a memória é do módulo, com prazo.
 */

/** Quanto tempo o mapa domínio→região vale antes de se voltar a perguntar. */
export const VALIDADE_DO_MAPA_MS = 5 * 60 * 1000;
/** Depois de uma falha, volta-se a tentar depressa — sem martelar. */
const VALIDADE_APOS_FALHA_MS = 30 * 1000;
/**
 * Dois segundos, e depois disso o mapa velho serve. Isto corre à frente de
 * TODOS os pedidos públicos de TODAS as regiões: um pedido sem prazo aqui é
 * um sítio inteiro parado à espera de uma base que se arrasta.
 */
const PRAZO_DO_MAPA_MS = 2000;

/** Os identificadores são os das pastas em `regioes/`: minúsculas, dígitos e hífens. */
const IDENTIFICADOR = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type Mapa = {
  /** domínio canónico (sem porto, em minúsculas) → identificador da região */
  dominios: Record<string, string>;
  /** alias → domínio canónico (redireciona, nunca serve) */
  redirecionamentos: Record<string, string>;
  /**
   * identificador → anfitrião TAL COMO FOI DECLARADO, porto incluído. É o que
   * se escreve numa ligação para a região: `prova.localhost:4321` nos testes,
   * `prova.paragem.pt` na base. A comparação com o Host de um pedido usa
   * `dominios`, que é sem porto; isto é para escrever, não para comparar.
   */
  origens: Record<string, string>;
};

export const MAPA_VAZIO: Mapa = { dominios: {}, redirecionamentos: {}, origens: {} };

/**
 * O Host tal como chega, reduzido ao nome: sem porto, em minúsculas.
 *
 * `pedraalta.paragem.pt:443` e `PedraAlta.Paragem.PT` são o mesmo sítio; um
 * IPv6 entre parêntesis retos (`[::1]:3000`) fica `[::1]`, que nunca está no
 * mapa e por isso não é de região nenhuma — que é o que se quer de um pedido
 * feito por endereço.
 */
export function normalizarHost(hostHeader: string | null | undefined): string | null {
  if (!hostHeader) return null;
  const semEspacos = hostHeader.trim().toLowerCase();
  if (semEspacos.length === 0) return null;
  if (semEspacos.startsWith('[')) {
    const fecho = semEspacos.indexOf(']');
    return fecho === -1 ? semEspacos : semEspacos.slice(0, fecho + 1);
  }
  const doisPontos = semEspacos.indexOf(':');
  return doisPontos === -1 ? semEspacos : semEspacos.slice(0, doisPontos);
}

/**
 * A tradução Host→região, pura: `null` para quem não estiver no mapa. A
 * comparação é exata — `www.` ou um subdomínio a mais não é o domínio da
 * região, e adivinhar seria servir a rede de um cliente num endereço que
 * ninguém lhe atribuiu.
 */
export function regiaoDoHost(
  hostHeader: string | null | undefined,
  dominios: Readonly<Record<string, string>>,
): string | null {
  const host = normalizarHost(hostHeader);
  if (!host) return null;
  return dominios[host] ?? null;
}

/**
 * O mapa que o ambiente declara: `PARAGEM_DOMINIOS="id=host,id=host"`.
 * Uma entrada mal escrita é ignorada, não adivinhada.
 */
export function mapaDoAmbiente(valor = process.env.PARAGEM_DOMINIOS): Mapa {
  const dominios: Record<string, string> = {};
  const origens: Record<string, string> = {};
  for (const entrada of (valor ?? '').split(',')) {
    const [id, host] = entrada.split('=').map((x) => x.trim());
    const nome = normalizarHost(host);
    if (!id || !nome || !IDENTIFICADOR.test(id)) continue;
    dominios[nome] = id;
    origens[id] = host.toLowerCase();
  }
  return { dominios, redirecionamentos: {}, origens };
}

/** As regiões que o mapa conhece, pela ordem em que aparecem. */
export function regioesDoMapa(mapa: Mapa): string[] {
  return [...new Set(Object.values(mapa.dominios))];
}

/** O anfitrião de uma região, como se escreve numa ligação, ou `null` se o mapa não a tiver. */
export function dominioDaRegiao(mapa: Mapa, regiao: string): string | null {
  return mapa.origens[regiao] ?? null;
}

type Linha = { id: string; domain: string };
type Alias = { domain: string; region_id: string };

/**
 * O mapa tal como a base o tem, lido pela porta pública. Rebenta em vez de
 * devolver metade: quem chama decide o que fazer com uma falha (guardar o
 * velho, somar o do ambiente), e uma leitura a meio não é um mapa.
 */
export async function lerMapaNaBase(
  buscar: typeof fetch = fetch,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Promise<Mapa> {
  if (!url || !chave) throw new Error('sem base');
  const base = url.replace(/\/+$/, '');
  const opcoes = {
    headers: { apikey: chave, accept: 'application/json' },
    signal: AbortSignal.timeout(PRAZO_DO_MAPA_MS),
  };
  const [rRegioes, rAliases] = await Promise.all([
    buscar(
      `${base}/rest/v1/regions?select=id,domain&is_enabled=eq.true&order=sort_order.asc,id.asc`,
      opcoes,
    ),
    buscar(`${base}/rest/v1/region_domain_aliases?select=domain,region_id`, opcoes),
  ]);
  if (!rRegioes.ok || !rAliases.ok) {
    throw new Error(`regions: HTTP ${rRegioes.status} / aliases: HTTP ${rAliases.status}`);
  }
  const regioes = (await rRegioes.json()) as Linha[];
  const aliases = (await rAliases.json()) as Alias[];
  const dominios: Record<string, string> = {};
  const origens: Record<string, string> = {};
  const canonicoDe: Record<string, string> = {};
  for (const linha of regioes) {
    const host = normalizarHost(linha.domain);
    if (!host || !IDENTIFICADOR.test(String(linha.id))) continue;
    dominios[host] = linha.id;
    origens[linha.id] = host;
    canonicoDe[linha.id] = host;
  }
  const redirecionamentos: Record<string, string> = {};
  for (const alias of aliases) {
    const host = normalizarHost(alias.domain);
    const canonico = canonicoDe[alias.region_id];
    // Um alias de uma região desligada não redireciona para lado nenhum: a
    // região não responde, e mandar alguém para lá era mandá-lo para um 404.
    if (host && canonico && host !== canonico && !dominios[host])
      redirecionamentos[host] = canonico;
  }
  return { dominios, redirecionamentos, origens };
}

/** O que a base diz mais o que o ambiente declara; o ambiente ganha à base. */
export function somar(daBase: Mapa, doAmbiente: Mapa): Mapa {
  return {
    dominios: { ...daBase.dominios, ...doAmbiente.dominios },
    redirecionamentos: { ...daBase.redirecionamentos, ...doAmbiente.redirecionamentos },
    origens: { ...daBase.origens, ...doAmbiente.origens },
  };
}

let guardado: { mapa: Mapa; expira: number } | null = null;

/** Só para os testes: esquece o mapa guardado. */
export function esquecerMapa(): void {
  guardado = null;
}

/**
 * O mapa, com memória de módulo e prazo — é o que o middleware usa.
 *
 * Uma região nova entra em produção sem deploy, com no máximo cinco minutos
 * de espera. Uma falha guarda o que já se tinha (ou o do ambiente, ou o
 * vazio) e volta a tentar em segundos.
 */
export async function mapaDeDominios(
  buscar: typeof fetch = fetch,
  agora: () => number = Date.now,
): Promise<Mapa> {
  if (guardado && guardado.expira > agora()) return guardado.mapa;
  const doAmbiente = mapaDoAmbiente();
  const temBase =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!temBase) {
    guardado = { mapa: doAmbiente, expira: agora() + VALIDADE_DO_MAPA_MS };
    return guardado.mapa;
  }
  try {
    const daBase = await lerMapaNaBase(buscar);
    guardado = { mapa: somar(daBase, doAmbiente), expira: agora() + VALIDADE_DO_MAPA_MS };
  } catch {
    guardado = {
      mapa: guardado?.mapa ?? doAmbiente,
      expira: agora() + VALIDADE_APOS_FALHA_MS,
    };
  }
  return guardado.mapa;
}

// --- a decisão, pura ---------------------------------------------------------

export type Decisao =
  | { tipo: 'passar' }
  | { tipo: 'reescrever'; para: string }
  | { tipo: 'redirecionar'; host: string };

/**
 * Os ficheiros de `public/` e as convenções de raiz — não são páginas e não
 * têm região. **Lista fechada**: uma pasta nova em `public/` tem de entrar
 * aqui, senão passa pela resolução de região e acaba num 404 com o ficheiro à
 * espera. O `/_next/` fica de fora pelo `matcher` do middleware.
 */
export const CAMINHOS_DE_FICHEIROS = ['/glifos/'] as const;
export const FICHEIROS_DE_RAIZ = [
  '/robots.txt',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon.png',
] as const;

/**
 * Um segmento que nenhuma região pode ter: começa por hífen, e o leitor de
 * dados recusa-o sem ir à rede. É para onde vai o que não é endereço num
 * anfitrião desconhecido — cai no 404 de qualquer página inexistente.
 */
export const NAO_E_ENDERECO = '/-nao-e-endereco';

/**
 * O que fazer com um pedido, dado o Host e o caminho. Puro, para se testar
 * frase a frase: cada `it` dos testes é uma promessa do produto.
 */
export function decidir(
  hostHeader: string | null | undefined,
  pathname: string,
  mapa: Mapa,
): Decisao {
  // Da API nada é de uma região: o sinal, as contagens, os expressos servem
  // todas. E os ficheiros a sério saem de `public/` tal como estão.
  if (pathname.startsWith('/api/')) return { tipo: 'passar' };
  if (
    FICHEIROS_DE_RAIZ.includes(pathname as (typeof FICHEIROS_DE_RAIZ)[number]) ||
    CAMINHOS_DE_FICHEIROS.some((prefixo) => pathname.startsWith(prefixo))
  ) {
    return { tipo: 'passar' };
  }

  const host = normalizarHost(hostHeader);

  // Um alias não serve: redireciona para o canónico, caminho intacto (308).
  const canonico = host ? mapa.redirecionamentos[host] : undefined;
  if (canonico) return { tipo: 'redirecionar', host: canonico };

  const regiao = host ? (mapa.dominios[host] ?? null) : null;
  if (regiao === null) {
    // O anfitrião não é de ninguém: a montra, e só a montra. Tudo o resto vai
    // para um caminho que não existe — incluindo `/<regiao>/…`, que era o
    // endereço antigo e deixou de o ser.
    return pathname === '/'
      ? { tipo: 'passar' }
      : { tipo: 'reescrever', para: NAO_E_ENDERECO + pathname };
  }
  return { tipo: 'reescrever', para: `/${regiao}${pathname}` };
}
