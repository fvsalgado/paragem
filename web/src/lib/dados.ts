/**
 * Os dados que o sítio lê, escritos pelo `uv run pipeline sitio` e publicados
 * pelo `uv run pipeline publicar`.
 *
 * Isto NÃO abre GTFS. O pipeline já o fez, e há uma razão para não o fazer
 * duas vezes: duas implementações do mesmo formato divergem, e a divergência
 * aparece como uma paragem que a página diz que a linha serve e o planeador
 * diz que não. Quem viaja não tem como saber qual das duas mente.
 *
 * E o sítio não sabe o que é uma região. Lê `<armazém>/<id>/…` e mostra o que
 * lá está — trocar de região é trocar de pasta, não de código.
 *
 * O QUE MUDOU, E PORQUÊ (CLAUDE.md §11.7). Isto lia `build/<id>/sitio/` do
 * disco, na construção, e o sítio saía como ficheiros. Aguentou uma região:
 * a segunda não cabia no limite de ficheiros da plataforma, e o painel do
 * dono não podia esperar dezoito minutos por uma reconstrução. Agora lê os
 * mesmos ficheiros por HTTP, de um armazém público onde o pipeline os põe, e
 * cada página fica guardada depois de rendida — com uma etiqueta por região,
 * para que o pipeline a possa deitar fora quando publica dados novos
 * (`/api/revalidate`). O resultado é o mesmo que o estático prometia: uma
 * página servida como ficheiro, que funciona com o motor de viagens em baixo.
 * O que se ganha é publicar o sítio em minutos, separado dos dados.
 *
 * DUAS CACHES, e convém saber qual é qual:
 *
 *   · `fetch` com `next.tags`: a cache de DADOS do Next. Um ficheiro lido uma
 *     vez fica guardado até o prazo passar ou a etiqueta ser invalidada. É
 *     por região, e é o que `/api/revalidate` limpa.
 *   · `cache()` do React: por PEDIDO. O invólucro, a página e três
 *     componentes pedem todos `regiao(id)`; isto faz com que seja uma leitura
 *     e não cinco.
 *
 * Nada aqui guarda estado entre pedidos em variáveis de módulo. Havia dois
 * mapas assim, para as partidas; ficariam com dados velhos depois de uma
 * publicação, sem ninguém dar por isso.
 */
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import {
  dominioDaRegiao,
  lerMapaNaBase,
  mapaDoAmbiente,
  regioesDoMapa,
  somar,
  type Mapa,
} from './regiao-host';
import { modosLigados, modulosDesligadosDoAmbiente, semModulosDesligados } from './modulos';

/**
 * Onde estão os dados. Em produção é a porta pública do balde `sitio` do
 * Storage; nos testes é um servidor local a servir `build/` com a mesma forma
 * (`web/scripts/servir-dados.mjs`). `PARAGEM_DADOS` é a variável do servidor;
 * sem ela vale a do navegador, que é a mesma morada vista de fora.
 */
const BASE = (process.env.PARAGEM_DADOS ?? process.env.NEXT_PUBLIC_PARAGEM_DADOS ?? '').replace(
  /\/+$/,
  '',
);

/** Uma hora entre releituras por tempo. O sinal do pipeline chega antes. */
export const VALIDADE_S = 3600;

/** A etiqueta de cache de uma região: é o que `/api/revalidate` invalida. */
export const etiquetaDaRegiao = (r: string): string => `regiao:${r}`;
/** A etiqueta da lista de regiões — a página de produto e os interruptores. */
export const ETIQUETA_DAS_REGIOES = 'regioes';

/**
 * Lê um ficheiro de uma região. «Não existe» dá a omissão — é o que era antes,
 * quando se olhava para o disco; qualquer outro erro rebenta, porque uma
 * página rendida sem metade dos dados é pior do que uma página que não sai.
 *
 * O «não existe» é 404 num servidor de ficheiros e **400** na porta pública do
 * Storage, que responde `{"statusCode":"404","error":"not_found"}` com 400
 * por fora. Medido antes de escrever isto; um leitor que só conhecesse o 404
 * rebentava em cada região sem transporte a pedido.
 */
async function ler<T>(r: string, relativo: string, omissao: T): Promise<T> {
  if (!BASE || !IDENTIFICADOR.test(r)) return omissao;
  const res = await fetch(`${BASE}/${r}/${relativo}`, {
    next: { revalidate: VALIDADE_S, tags: [etiquetaDaRegiao(r)] },
  });
  if (res.status === 404 || res.status === 400) return omissao;
  if (!res.ok) throw new Error(`${relativo} ${r}: HTTP ${res.status} de ${BASE}`);
  return (await res.json()) as T;
}

// --- as regiões ------------------------------------------------------------

/**
 * As regiões LIGADAS, lidas da base do painel (`public.regions`, só as que a
 * política de leitura deixa ver: `is_enabled`).
 *
 * `null` quando não se sabe: sem base configurada, ou com a base a não
 * responder. Não é a mesma coisa que «nenhuma», e quem lê isto trata as duas
 * de maneira diferente — o público degrada, não desaparece.
 *
 * Uma falha não fica guardada: a função rebenta por dentro do `unstable_cache`
 * para que ele não guarde nada, e é apanhada por fora.
 */
const lerRegioesNaBase = unstable_cache(
  async (): Promise<string[]> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) throw new Error('sem base');
    const res = await fetch(
      `${url.replace(/\/+$/, '')}/rest/v1/regions?select=id&is_enabled=eq.true&order=sort_order.asc,id.asc`,
      { headers: { apikey: chave, accept: 'application/json' }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) throw new Error(`regions: HTTP ${res.status}`);
    const linhas = (await res.json()) as { id: string }[];
    return linhas.map((l) => String(l.id)).filter((id) => IDENTIFICADOR.test(id));
  },
  ['regioes-ligadas'],
  { tags: [ETIQUETA_DAS_REGIOES], revalidate: 300 },
);

const temBase = (): boolean =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Quem decide que regiões há:
 *
 *   1. a base do painel, quando está configurada e responde;
 *   2. senão `PARAGEM_REGIOES` no ambiente — é assim que o CI testa três
 *      regiões sem base nenhuma, e que um cliente aloja só a sua;
 *   3. senão não se sabe (`null`), e cada região existe se os dados dela
 *      existirem no armazém.
 */
const regioesConhecidas = cache(async (): Promise<string[] | null> => {
  if (temBase()) {
    try {
      return await lerRegioesNaBase();
    } catch {
      // A base está em baixo ou mal configurada: não se decide nada por ela.
    }
  }
  const doAmbiente = (process.env.PARAGEM_REGIOES ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => IDENTIFICADOR.test(x));
  if (doAmbiente.length) return doAmbiente;
  // Sem lista, valem as regiões que o mapa de domínios do ambiente declara.
  const doMapa = regioesDoMapa(mapaDoAmbiente());
  return doMapa.length ? doMapa : null;
});

/**
 * O mapa domínio→região, como as PÁGINAS o veem: a base (com a etiqueta das
 * regiões, para o painel a invalidar) somada ao ambiente. O middleware tem a
 * sua própria cópia, com memória de módulo — corre no edge, onde não há
 * `unstable_cache`. As duas leem a mesma função.
 */
const lerMapaCacheado = unstable_cache(
  async (): Promise<Mapa> => await lerMapaNaBase(),
  ['mapa-de-dominios'],
  {
    tags: [ETIQUETA_DAS_REGIOES],
    revalidate: 300,
  },
);

export const mapaDasRegioes = cache(async (): Promise<Mapa> => {
  const doAmbiente = mapaDoAmbiente();
  if (!temBase()) return doAmbiente;
  try {
    return somar(await lerMapaCacheado(), doAmbiente);
  } catch {
    return doAmbiente;
  }
});

/**
 * O esquema das ligações para outras origens: `https` em produção, `http`
 * nos testes, onde as regiões vivem em `*.localhost:4321`.
 */
const ESQUEMA = process.env.PARAGEM_ESQUEMA === 'http' ? 'http' : 'https';

/** Onde uma região responde — `https://<domínio>` —, ou `null` se não tiver domínio no mapa. */
export async function origemDaRegiao(r: string): Promise<string | null> {
  const dominio = dominioDaRegiao(await mapaDasRegioes(), r);
  return dominio ? `${ESQUEMA}://${dominio}` : null;
}

/**
 * As regiões que há para mostrar, pela ordem de quem as declarou. Vazio
 * quando não se sabe: a página de produto diz que ainda não há nenhuma, em
 * vez de inventar uma lista.
 */
export async function regioesDisponiveis(): Promise<string[]> {
  return (await regioesConhecidas()) ?? [];
}

/**
 * Uma região que a base tenha DESLIGADO não existe — nem por ligação antiga,
 * nem por endereço decorado. Quando não se sabe, vale o que está no armazém.
 */
async function regiaoLigada(r: string): Promise<boolean> {
  const conhecidas = await regioesConhecidas();
  return conhecidas === null || conhecidas.includes(r);
}

// --- as formas -------------------------------------------------------------

// Os tipos e as funções puras vivem em `formato.ts` — ver lá porquê.
export * from './formato';
// O `export *` reexporta, mas não traz os nomes para ESTE ficheiro.
import { IDENTIFICADOR, seguro } from './formato';
import type {
  APedido,
  Concelho,
  Descarga,
  Estacao,
  Lacunas,
  Linha,
  LinhaDetalhe,
  Modos,
  ModoDetalhe,
  Paragem,
  Partida,
  Regiao,
  Ponto,
  Tarifas,
} from './formato';

/** O que o pipeline publicou de uma região: a lista dos ficheiros, escrita no fim. */
export type Inventario = {
  regiao: string;
  publicado_em: string;
  ficheiros: Record<string, { bytes: number; md5?: string }>;
};

// --- os leitores -----------------------------------------------------------

/** A declaração da região, ou `null` quando não há dados dela no armazém. */
export const regiao = cache(async (r: string): Promise<Regiao | null> => {
  const d = await ler<Regiao | null>(r, 'regiao.json', null);
  if (!d) return null;
  // OS MÓDULOS DESLIGADOS SAEM DAQUI, e é por isso que todas as páginas os
  // respeitam sem saber de painel nenhum: quem pergunta «que modos tem a
  // região» lê `modos`, e `modos` já vem sem o que o painel desligou.
  const fora = await modulosDesligados(r);
  const declarados = d.modos ?? [];
  return {
    ...d,
    modos: modosLigados(declarados, fora),
    modos_desligados: declarados.filter((m) => fora.includes(m)),
  };
});

// --- os módulos ------------------------------------------------------------

/**
 * Os módulos que o painel DESLIGOU nesta região — `public.modulos`, só as
 * linhas a false —, pela chave pública, com a etiqueta da região: é o que o
 * painel invalida ao mexer no interruptor, e cinco minutos no máximo sem
 * sinal. Rebenta por dentro do `unstable_cache` para ele não guardar uma
 * falha.
 */
function lerModulosDesligadosNaBase(r: string): Promise<string[]> {
  return unstable_cache(
    async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !chave) throw new Error('sem base');
      const res = await fetch(
        `${url.replace(/\/+$/, '')}/rest/v1/modulos?select=id&region_id=eq.${encodeURIComponent(r)}&is_enabled=eq.false`,
        {
          headers: { apikey: chave, accept: 'application/json' },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!res.ok) throw new Error(`modulos: HTTP ${res.status}`);
      const linhas = (await res.json()) as { id: string }[];
      return linhas.map((l) => String(l.id));
    },
    ['modulos-desligados', r],
    { tags: [ETIQUETA_DAS_REGIOES, etiquetaDaRegiao(r)], revalidate: 300 },
  )();
}

/**
 * O que está desligado nesta região: a base SOMADA ao ambiente
 * (`PARAGEM_MODULOS_DESLIGADOS`, que é como o CI prova o efeito sem base).
 *
 * O PÚBLICO DEGRADA: com a base em baixo não se desliga nada. Assumir tudo
 * desligado por causa de uma falha de rede fazia desaparecer seis modos
 * (`docs/BASE-DE-DADOS.md`).
 */
export const modulosDesligados = cache(async (r: string): Promise<string[]> => {
  const doAmbiente = modulosDesligadosDoAmbiente()[r] ?? [];
  if (!temBase()) return doAmbiente;
  try {
    return [...new Set([...(await lerModulosDesligadosNaBase(r)), ...doAmbiente])];
  } catch {
    return doAmbiente;
  }
});

async function desligado(r: string, modo: string): Promise<boolean> {
  return (await modulosDesligados(r)).includes(modo);
}

/** `true` quando a região declara o modo e o painel não o desligou. */
export async function temModo(r: string, modo: string): Promise<boolean> {
  return (await regiao(r))?.modos.includes(modo) ?? false;
}

/**
 * A página de um modo que a região não tem — ou que o painel desligou — não
 * existe: é o mesmo 404 de uma paragem que não existe.
 */
export async function exigirModo(r: string, modo: string): Promise<void> {
  if (!(await temModo(r, modo))) notFound();
}

/**
 * A região que a página pede, ou 404. É o `exigirDados` de antes, que rebentava
 * a construção com uma frase útil: agora não há construção para rebentar, e a
 * resposta certa a uma região que não existe — ou que foi desligada — é a
 * mesma que a uma paragem que não existe.
 */
export async function exigirRegiao(r: string): Promise<Regiao> {
  const dados = await regiao(r);
  if (!dados || !(await regiaoLigada(r))) notFound();
  return dados;
}

export const inventario = cache(
  async (r: string): Promise<Inventario | null> =>
    await ler<Inventario | null>(r, 'inventario.json', null),
);

/** Se a região tem mosaicos do mapa: uma sem recorte do OpenStreetMap não tem. */
export async function temMosaicos(r: string): Promise<boolean> {
  const inv = await inventario(r);
  return !!inv && 'regiao.pmtiles' in inv.ficheiros;
}

export const concelhos = cache(
  async (r: string): Promise<Concelho[]> => await ler<Concelho[]>(r, 'concelhos.json', []),
);
// Cada leitor de um modo respeita o interruptor dele: com o módulo
// desligado, a lista vem vazia e a página que a pede não tem o que mostrar.
export const paragens = cache(async (r: string): Promise<Paragem[]> => {
  if (await desligado(r, 'autocarro')) return [];
  return await ler<Paragem[]>(r, 'paragens.json', []);
});
export const linhas = cache(async (r: string): Promise<Linha[]> => {
  if (await desligado(r, 'autocarro')) return [];
  return await ler<Linha[]>(r, 'linhas.json', []);
});
export const estacoes = cache(async (r: string): Promise<Estacao[]> => {
  if (await desligado(r, 'comboio')) return [];
  return await ler<Estacao[]>(r, 'estacoes.json', []);
});
export const tarifas = cache(
  async (r: string): Promise<Tarifas> =>
    await ler<Tarifas>(r, 'tarifas.json', {
      moeda: 'EUR',
      titulos: [],
      por_confirmar: 0,
      reservas: {},
    }),
);
/* OS AVISOS NÃO ESTÃO AQUI, e é a única exceção no sítio inteiro.
   Tudo o resto vem do armazém, escrito pelo pipeline e servido da cache com
   uma etiqueta por região. Um aviso não pode esperar por uma publicação: lê-se
   da base, por pedido, em `lib/avisos.ts`. */
/** `null` quando a região não declara transporte a pedido — e aí a página não existe. */
export const aPedido = cache(async (r: string): Promise<APedido | null> => {
  if (await desligado(r, 'a-pedido')) return null;
  const d = await ler<APedido | Record<string, never>>(r, 'a-pedido.json', {});
  return 'zonas' in d && d.zonas.length ? (d as APedido) : null;
});
/**
 * Os modos que não têm catálogo próprio: bicicletas, táxis, urbanos, expressos.
 *
 * Vazio numa região que não os declare — e aí as páginas não existem, em vez
 * de existirem vazias.
 */
export const modos = cache(async (r: string): Promise<Modos> => {
  const todos = await ler<Modos>(r, 'modos.json', {});
  const fora = await modulosDesligados(r);
  return Object.fromEntries(Object.entries(todos).filter(([m]) => !fora.includes(m)));
});
export const modo = async (r: string, m: string): Promise<ModoDetalhe | null> =>
  (await modos(r))[m] ?? null;

export const lacunas = cache(
  async (r: string): Promise<Lacunas> =>
    await ler<Lacunas>(r, 'lacunas.json', { bloqueios: [], lacunas: [], contagens: {} }),
);
export const dadosAbertos = cache(async (r: string): Promise<Descarga[]> => {
  const todos = await ler<Descarga[]>(r, 'dados-abertos.json', []);
  // «Desligar a FlixBus» é tirá-la do sítio inteiro, os ficheiros incluídos.
  const fora = await modulosDesligados(r);
  return todos.filter((d) => d.modo === null || !fora.includes(d.modo));
});

/**
 * O índice leve que VAI PARA O NAVEGADOR — o planeador e o «Perto de ti».
 *
 * Estava lido à mão dentro da página do planeador. Passou a viver aqui quando
 * a página inicial precisou do mesmo ficheiro: duas leituras do mesmo formato
 * divergem, e a divergência aparece como um sítio que uma página encontra e a
 * outra não.
 */
export const procura = cache(async (r: string): Promise<Ponto[]> => {
  const d = await ler<{ campos: string[]; pontos: unknown[][] }>(r, 'procura.json', {
    campos: [],
    pontos: [],
  });
  // Os pontos de um módulo desligado saem do mapa, da procura e do «Perto de
  // ti» — é este índice que os três leem.
  const fora = await modulosDesligados(r);
  const pontos = d.pontos.map((linha) => ({
    nome: String(linha[0]),
    lat: Number(linha[1]),
    lon: Number(linha[2]),
    tipo: String(linha[3]),
    // O NÚMERO DE PARTIDAS VINHA E PERDIA-SE AQUI.
    //
    // O `procura.json` sempre o trouxe, e este mapeamento deitava-o fora — e
    // com ele a regra que mostra, entre o zoom 11 e o 13, só as paragens com
    // serviço a sério. Sem o campo, a regra comparava `undefined` com 40 e
    // dava sempre falso: a esses zooms o mapa ficava sem paragem nenhuma, e
    // parecia de propósito.
    partidas: Number(linha[4] ?? 0),
    id: String(linha[5] ?? ''),
    concelho: String(linha[6] ?? 'fora-da-regiao'),
  }));
  return semModulosDesligados(pontos, fora);
});

/**
 * A FICHA DE UMA PARAGEM: a paragem e as partidas dela, num ficheiro só.
 *
 * O `id` é o do endereço (`seguro(stop_id)`), que é o nome do ficheiro que o
 * pipeline escreve — há identificadores com vírgulas e pontos, e um endereço
 * que acaba em ponto parece um ficheiro a quem serve. Alguns kB por paragem:
 * é o que a página lê, e cabe na cache de dados. O ficheiro do concelho
 * (`partidas/<concelho>.json`) continua a existir para o navegador, que serve
 * dezenas de paragens com um pedido; para uma página, o de um concelho grande
 * passava do limite de 2 MB da cache e era relido a cada renderização.
 */
export type FichaDeParagem = { paragem: Paragem; partidas: Partida[] };

export const paragem = cache(
  async (r: string, id: string): Promise<FichaDeParagem | null> =>
    await ler<FichaDeParagem | null>(r, `paragens/${seguro(id)}.json`, null),
);

/** O endereço da página de uma paragem, a partir do `stop_id` tal como vem. */
export const urlDaParagem = (r: string, stopId: string): string =>
  urlRede(r, `paragens/${seguro(stopId)}/`);

export const linhaDetalhe = cache(
  async (r: string, id: string): Promise<LinhaDetalhe | null> =>
    await ler<LinhaDetalhe | null>(r, `linhas/${seguro(id)}.json`, null),
);

/**
 * Uma ligação interna, dentro da região.
 *
 * NÃO LEVA A REGIÃO: cada região responde no seu domínio (CLAUDE.md §11.7), e
 * o middleware é que põe o segmento por dentro. Uma ligação com `/<regiao>/`
 * à frente chegava ao servidor como `/<regiao>/<regiao>/…` e dava 404. O
 * parâmetro fica para quem chama não mudar — e para o dia em que uma região
 * precisar de uma exceção, que é aqui que ela se escreve.
 */
export const url = (_r: string, caminho = ''): string => `/${caminho.replace(/^\//, '')}`;

/**
 * UMA FICHA DO CATÁLOGO: paragem, linha, estação, concelho, tarifário.
 *
 * Existe por causa de um erro que custou o sítio inteiro. Quando o catálogo se
 * mudou para `/rede/`, as ligações ficaram a apontar para onde ele estava —
 * `/<regiao>/paragens/<id>/` em vez de `/<regiao>/rede/paragens/<id>/` — e
 * **4 834 dos 4 854 destinos do sítio passaram a dar 404**, em produção, sem
 * um teste a queixar-se: os testes visitavam páginas, não seguiam ligações.
 *
 * Duas coisas mudaram por causa disso. Esta função, para o prefixo estar num
 * sítio só; e o `npm run ligacoes`, que segue TODAS as ligações internas do
 * sítio a correr e falha se alguma não responder.
 */
export const urlRede = (_r: string, caminho = ''): string => `/rede/${caminho.replace(/^\//, '')}`;
