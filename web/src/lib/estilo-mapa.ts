import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * O estilo do mapa, escrito por nós.
 *
 * **Não se usa um estilo de terceiro, e não é ideologia.** Um estilo pronto
 * traz licença de terceiro, um servidor de terceiro para os tipos de letra e
 * os ícones, e uma paleta que não é a do §6 — três dependências novas para
 * poupar um ficheiro. O §5 já diz «sem serviços de mapas privados»; isto é a
 * mesma frase aplicada ao estilo.
 *
 * O esquema das camadas é o do OpenMapTiles, que é o que o Planetiler produz
 * e o que os mosaicos de uma região inventada imitam (`mosaicos_proprios.py`).
 *
 * **O MAPA DE FUNDO É FUNDO.** A primeira paleta era quase monocromática e
 * lia-se como uma folha em branco; a segunda corrigiu isso a mais — mata,
 * campo e parques em verdes saturados, vias rápidas a laranja, e a rede de
 * transportes, que é a razão de o mapa existir, perdida por baixo de tudo.
 * Esta é a terceira, e a hierarquia é outra: **a rede é o que mais se vê**, o
 * casario e a água orientam, e o resto recua. O campo é da cor do fundo; só a
 * mata e os jardins levam verde, e um verde baixo.
 *
 * A REGRA QUE FICA DA PRIMEIRA: **cada camada distingue-se da que está por
 * baixo**. O casario é mais CLARO do que o campo à volta (é assim que se lê
 * uma vila), as ruas são brancas com contorno, os edifícios mais escuros do
 * que a rua. Uma vila inteira desenhada dentro de três por cento de diferença
 * é uma folha em branco ao sol.
 */

const CLARA = {
  FUNDO: '#eef0eb',
  AGUA: '#afd2e5',
  /** O nome da água: 5,7:1 sobre o halo, e não se confunde com o texto. */
  AGUA_TEXTO: '#2e6584',
  MATA: '#d6e6cf',
  PARQUE: '#cde5c4',
  URBANO: '#f7f5f0',
  EDIFICIO: '#e3dfd7',
  EDIFICIO_RISCO: '#d2cdc3',
  ESTRADA: '#ffffff',
  ESTRADA_RISCO: '#cfd6d2',
  ESTRADA_MENOR: '#ffffff',
  /* As vias rápidas num amarelo baixo: lê-se a rede principal sem ler um
     nome, e não grita mais alto do que a rede de transportes. */
  RAPIDA: '#f5e1b5',
  RAPIDA_RISCO: '#d8b573',
  /** O caminho de ferro do mapa de base — sem serviço; o que tem serviço é da rede. */
  FERROVIA: '#a3adb2',
  TEXTO: '#102c3f',
  TEXTO_HALO: '#f7f8f5',
  SECUNDARIO: '#4a5c66',
  FRONTEIRA: '#9aa7a0',
};

/**
 * O TEMA ESCURO, a mesma regra ao contrário: o casario mais claro do que o
 * campo, as ruas mais claras do que o casario, a água mais azul do que tudo
 * — e as ruas MAIS ESCURAS do que a rede. Estavam a `#46565e`, mais claras do
 * que as paragens (~2:1 entre as duas): de noite lia-se a malha das ruas e
 * não a dos autocarros.
 */
const ESCURA: typeof CLARA = {
  FUNDO: '#172127',
  AGUA: '#1c3a4b',
  AGUA_TEXTO: '#9fc9e0',
  MATA: '#1b2d24',
  PARQUE: '#1e3328',
  URBANO: '#1f2a30',
  EDIFICIO: '#27343b',
  EDIFICIO_RISCO: '#33424a',
  ESTRADA: '#323f46',
  ESTRADA_RISCO: '#26323a',
  ESTRADA_MENOR: '#2a363c',
  RAPIDA: '#5e4b2a',
  RAPIDA_RISCO: '#4a3b21',
  FERROVIA: '#55636b',
  TEXTO: '#e6edf0',
  TEXTO_HALO: '#172127',
  SECUNDARIO: '#a9b8bf',
  FRONTEIRA: '#4f5f66',
};

export type TemaDoMapa = 'claro' | 'escuro';

const PALETA = { claro: CLARA, escuro: ESCURA };

/** O fundo do mapa em cada tema — o mesmo que o `--fundo-do-mapa` do CSS. */
export const FUNDO_DO_MAPA: Record<TemaDoMapa, string> = {
  claro: CLARA.FUNDO,
  escuro: ESCURA.FUNDO,
};

/**
 * AS CORES DA REDE, por modo e por tema — e não o `route_color` de cada linha.
 *
 * Trinta linhas de uma região real partilham o mesmo bege (2,27:1 sobre o
 * fundo): pintadas pela cor da operadora, a rede era uma teia de traços que
 * mal se viam e que não diziam nada — a cor de uma linha só serve a quem já
 * sabe qual é. O modo responde à pergunta que o mapa faz primeiro, «o que
 * passa aqui», e as cores são as do §6, todas a ≥ 5:1 sobre o fundo claro.
 * No escuro sobem de luminosidade (≥ 6:1 sobre o fundo, ≥ 4,8:1 sobre uma
 * estrada), com o mesmo tom.
 */
export const CORES_DA_REDE: Record<TemaDoMapa, Record<string, string>> = {
  claro: { autocarro: '#0a5c7a', comboio: '#3f4852', 'urbano-municipal': '#5b3a8e' },
  escuro: { autocarro: '#6cb8d6', comboio: '#b4bec5', 'urbano-municipal': '#b39ddb' },
};

/** Um modo sem cor declarada (uma rede de um modo que nunca vimos): a do autocarro. */
export const corDaRede = (tema: TemaDoMapa, modo: string): string =>
  CORES_DA_REDE[tema][modo] ?? CORES_DA_REDE[tema].autocarro;

/** `a` misturada com `b`, com `peso` de `a` — em sRGB, que é como o ecrã mistura. */
export function misturar(a: string, b: string, peso: number): string {
  const canais = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [canais(a), canais(b)];
  return `#${x
    .map((v, i) => Math.round(v * peso + y[i] * (1 - peso)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * As cores dos pontos que mudam com o tema. A paragem é um anel com o miolo
 * claro, como uma estação num mapa de metro: um disco da cor da rede, por
 * cima de um traço da mesma cor, desaparecia nele.
 */
export const CORES_DOS_PONTOS: Record<
  TemaDoMapa,
  { anel: string; miolo: string; texto: string; halo: string; secundario: string }
> = {
  claro: {
    anel: CORES_DA_REDE.claro.autocarro,
    miolo: '#ffffff',
    texto: CLARA.TEXTO,
    halo: CLARA.TEXTO_HALO,
    secundario: CLARA.SECUNDARIO,
  },
  escuro: {
    anel: CORES_DA_REDE.escuro.autocarro,
    miolo: '#f2f6f8',
    texto: ESCURA.TEXTO,
    halo: ESCURA.TEXTO_HALO,
    secundario: ESCURA.SECUNDARIO,
  },
};

/**
 * Uma largura que cresce com o zoom, exponencialmente — como a escala do
 * mapa —, e não em degraus bruscos.
 */
const largura = (paradas: [number, number][]): unknown => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...paradas.flat(),
];

/** O contorno de uma estrada: a largura dela, mais uma margem que cresce com o zoom. */
const contorno = (paradas: [number, number][]): [number, number][] =>
  paradas.map(([z, l]) => [z, l + (z < 11 ? 1 : z < 15 ? 1.6 : 2.4)]);

/**
 * A HIERARQUIA DAS ESTRADAS. Eram todas da mesma largura e da mesma cor, da
 * nacional à rua da aldeia: de longe, uma malha uniforme onde nada se
 * destacava. Cada classe entra ao zoom em que começa a servir para alguma
 * coisa, e engrossa a partir daí.
 */
const ESTRADAS: {
  id: string;
  classes: string[];
  minzoom: number;
  larguras: [number, number][];
  rapida?: boolean;
  menor?: boolean;
}[] = [
  {
    id: 'menor',
    classes: ['minor', 'service'],
    minzoom: 13,
    larguras: [
      [13, 0.5],
      [15, 3],
      [18, 14],
    ],
    menor: true,
  },
  {
    id: 'terciaria',
    classes: ['tertiary'],
    minzoom: 10,
    larguras: [
      [10, 0.4],
      [12, 1.2],
      [14, 5],
      [18, 18],
    ],
  },
  {
    id: 'secundaria',
    classes: ['secondary'],
    minzoom: 9,
    larguras: [
      [9, 0.5],
      [11, 1.5],
      [14, 6],
      [18, 20],
    ],
  },
  {
    id: 'primaria',
    classes: ['primary'],
    minzoom: 7,
    larguras: [
      [7, 0.6],
      [10, 2],
      [14, 7],
      [18, 22],
    ],
  },
  {
    id: 'rapida',
    classes: ['motorway', 'trunk'],
    minzoom: 6,
    larguras: [
      [6, 0.8],
      [10, 2.5],
      [14, 8],
      [18, 24],
    ],
    rapida: true,
  },
];

/**
 * A atribuição de um mapa do OpenStreetMap — a de omissão, para os dados de
 * antes de a região dizer de quem é o mapa dela.
 */
export const ATRIBUICAO_OSM =
  '© contribuidores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL';

export const FONTE_REGULAR = ['Atkinson Hyperlegible Regular'];
export const FONTE_NEGRITO = ['Atkinson Hyperlegible Bold'];

export function estiloDoMapa(
  urlDosMosaicos: string,
  atribuicao: string = ATRIBUICAO_OSM,
  tema: TemaDoMapa = 'claro',
): StyleSpecification {
  const P = PALETA[tema];
  const estradas = (['contorno', 'enchimento'] as const).flatMap((parte): LayerSpecification[] =>
    ESTRADAS.map((e) => {
      const risco = e.rapida ? P.RAPIDA_RISCO : P.ESTRADA_RISCO;
      const cheio = e.rapida ? P.RAPIDA : e.menor ? P.ESTRADA_MENOR : P.ESTRADA;
      return {
        id: `estradas-${e.id}-${parte}`,
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: e.minzoom,
        filter: ['in', ['get', 'class'], ['literal', e.classes]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': parte === 'contorno' ? risco : cheio,
          'line-width': largura(parte === 'contorno' ? contorno(e.larguras) : e.larguras) as number,
        },
      } as LayerSpecification;
    }),
  );

  return {
    version: 8,
    name: 'Paragem',
    // A atribuição do OpenStreetMap NÃO é uma cortesia: a ODbL segue a obra
    // derivada, e estes mosaicos são obra derivada. Vai na fonte, que é o
    // sítio onde o MapLibre a lê para a mostrar sozinho — um rodapé
    // esquece-se numa refatoração, um campo da fonte viaja com os dados.
    //
    // E VEM DOS DADOS DA REGIÃO. Um mapa desenhado por nós a partir de uma
    // geografia inventada não é do OpenStreetMap, e escrevê-lo no canto era
    // atribuir-lhe o que não fez.
    sources: {
      osm: {
        type: 'vector',
        url: `pmtiles://${urlDosMosaicos}`,
        attribution: atribuicao,
      },
    },
    // OS GLIFOS SÃO NOSSOS, e não de um servidor de terceiro: o MapLibre
    // exige-os para qualquer etiqueta de texto, e sem eles as camadas de
    // nomes recusavam-se a carregar e o mapa INTEIRO ficava cinzento. São
    // gerados por `scripts/glifos.mjs` do mesmo Atkinson Hyperlegible do §6
    // — o Regular e o Bold —, e guardados no repositório.
    glyphs: '/glifos/{fontstack}/{range}.pbf',
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': P.FUNDO } },

      // --- o que está no chão ------------------------------------------
      //
      // O CAMPO NÃO SE PINTA. Lavoura, mato e prado eram um verde-claro que
      // cobria três quartos de uma região do interior, e era nele que a rede
      // se perdia. É da cor do fundo — que é o mesmo que não estar lá, sem o
      // custo de o desenhar.
      {
        id: 'urbano',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landuse',
        filter: ['in', 'class', 'residential', 'suburb', 'neighbourhood', 'commercial', 'retail'],
        paint: { 'fill-color': P.URBANO },
      },
      {
        id: 'mata',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'forest'],
        paint: { 'fill-color': P.MATA },
      },
      // OS JARDINS, e não as áreas protegidas. A camada `park` do
      // OpenMapTiles é a das áreas classificadas — Rede Natura, parques
      // naturais —, que no interior cobrem concelhos inteiros de olival e
      // pinhal: pintadas de verde, metade da região parecia um jardim. Os
      // jardins de uma vila vêm no `landcover`; a demonstração desenha os
      // seus como `public_park`.
      {
        id: 'parque',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['in', 'subclass', 'park', 'garden', 'recreation_ground', 'village_green'],
        paint: { 'fill-color': P.PARQUE },
      },
      {
        id: 'parque-publico',
        type: 'fill',
        source: 'osm',
        'source-layer': 'park',
        filter: ['in', 'class', 'public_park', 'park'],
        paint: { 'fill-color': P.PARQUE },
      },
      {
        id: 'agua',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water',
        filter: ['!=', 'class', 'swimming_pool'],
        paint: { 'fill-color': P.AGUA },
      },
      // OS RIOS E OS RIBEIROS NÃO SÃO IGUAIS. Eram o mesmo traço: de longe, a
      // região era uma rede de linhas azuis tão densa como a de estradas.
      {
        id: 'rio',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        filter: ['in', 'class', 'river', 'canal'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': P.AGUA,
          'line-width': largura([
            [8, 0.8],
            [12, 2],
            [16, 6],
          ]) as number,
        },
      },
      {
        id: 'ribeiro',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        minzoom: 13,
        filter: ['!in', 'class', 'river', 'canal'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': P.AGUA,
          'line-width': largura([
            [13, 0.6],
            [16, 1.6],
            [18, 3],
          ]) as number,
        },
      },

      // --- os edifícios, só de perto -----------------------------------
      {
        id: 'edificios',
        type: 'fill',
        source: 'osm',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-color': P.EDIFICIO,
          'fill-outline-color': P.EDIFICIO_RISCO,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
        },
      },

      // --- os caminhos e o caminho de ferro sem serviço ------------------
      {
        id: 'caminhos',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['in', 'class', 'path', 'track'],
        paint: {
          'line-color': P.ESTRADA_RISCO,
          'line-width': largura([
            [15, 0.6],
            [18, 2],
          ]) as number,
          'line-dasharray': [2, 2],
        },
      },
      // O CAMINHO DE FERRO DO MAPA DE BASE É CINZENTO E FINO: é a via, e não
      // o serviço. O que tem comboios por cima é desenhado pela camada da
      // rede, na cor do comboio e com as travessas — uma linha fechada ao
      // tráfego não pode parecer igual a uma com vinte comboios por dia.
      {
        id: 'caminho-de-ferro',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'rail', 'transit'],
        paint: {
          'line-color': P.FERROVIA,
          'line-width': largura([
            [8, 0.6],
            [14, 1.5],
            [18, 3],
          ]) as number,
        },
      },

      // --- as estradas: os contornos todos primeiro, depois o asfalto ----
      //
      // Dois traços por estrada, como num mapa impresso. Os contornos vão
      // todos por baixo de todos os asfaltos: num cruzamento, a nacional e a
      // municipal juntam-se em vez de uma cortar a outra com uma risca.
      ...estradas,

      // --- as fronteiras dos concelhos, e só essas ------------------------
      //
      // Desenhava `admin_level <= 8`, e no OpenStreetMap português o 8 é a
      // freguesia: o mapa enchia-se de tracejados que não dizem nada a quem
      // apanha um autocarro. O concelho é o 7 (e o distrito e o país, que
      // coincidem com fronteiras de concelho, vêm com ele).
      {
        id: 'fronteiras',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundary',
        filter: ['all', ['<=', 'admin_level', 7], ['!=', 'maritime', 1]],
        paint: { 'line-color': P.FRONTEIRA, 'line-width': 1, 'line-dasharray': [4, 2] },
      },

      // --- os nomes ------------------------------------------------------
      //
      // Do menos importante para o mais: no MapLibre, a camada de cima é a
      // primeira a escolher onde se põe, e as de baixo ficam com o espaço que
      // sobra. As ruas cedem à água, a água às aldeias, as aldeias às vilas.
      {
        id: 'nomes-de-ruas',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONTE_REGULAR,
          'text-size': 11,
          'symbol-placement': 'line',
        },
        paint: {
          'text-color': P.SECUNDARIO,
          'text-halo-color': P.TEXTO_HALO,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'nomes-de-agua',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'water_name',
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONTE_REGULAR,
          'text-size': 11,
          'symbol-placement': 'line',
          'text-max-width': 8,
        },
        paint: {
          'text-color': P.AGUA_TEXTO,
          'text-halo-color': P.TEXTO_HALO,
          'text-halo-width': 1.4,
        },
      },
      // AS ALDEIAS, pequenas e em secundário, só de perto. A z9 eram tantas
      // como as vilas e do mesmo tamanho, e tapavam-nas.
      {
        id: 'nomes-de-aldeias',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        minzoom: 11,
        filter: [
          'any',
          ['in', ['get', 'class'], ['literal', ['village', 'suburb']]],
          ['all', ['==', ['get', 'class'], 'hamlet'], ['>=', ['zoom'], 14]],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONTE_REGULAR,
          'text-size': ['match', ['get', 'class'], 'hamlet', 11, 12],
          'text-max-width': 8,
          'text-padding': 4,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 20],
        },
        paint: {
          'text-color': P.SECUNDARIO,
          'text-halo-color': P.TEXTO_HALO,
          'text-halo-width': 1.4,
        },
      },
      // AS CIDADES E AS VILAS, em negrito e por ordem de importância. O
      // tamanho dependia só da classe, e entre duas vilas que colidiam
      // ganhava a que calhava: agora ganha a de menor `rank` — a sede de
      // concelho à freguesia vizinha.
      {
        id: 'nomes-de-sitios',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONTE_NEGRITO,
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            ['match', ['get', 'class'], 'city', 16, 14],
            12,
            ['match', ['get', 'class'], 'city', 20, 17],
          ],
          'text-max-width': 8,
          'text-padding': 6,
          'symbol-sort-key': [
            'coalesce',
            ['get', 'rank'],
            ['match', ['get', 'class'], 'city', 1, 5],
          ],
        },
        paint: {
          'text-color': P.TEXTO,
          'text-halo-color': P.TEXTO_HALO,
          'text-halo-width': 1.8,
        },
      },
    ],
  } as StyleSpecification;
}

// --- a rede, por cima das estradas e por baixo dos pontos -------------------

/**
 * A ESPESSURA PELA FREQUÊNCIA, em três classes de viagens por dia útil:
 * ≥ 20, de 6 a 19, e até 5 (ou desconhecida). Três e não uma escala
 * contínua: a diferença entre 7 e 8 viagens não se lê num traço, e a entre
 * «passa de hora a hora» e «passa duas vezes por dia» lê-se de longe.
 */
export function classeDasViagens(viagens: number | null | undefined): 1 | 2 | 3 {
  const n = viagens ?? 0;
  return n >= 20 ? 3 : n >= 6 ? 2 : 1;
}

/**
 * AS LARGURAS, a z8, z11, z14 e z16. A de z16 só pode ser esta porque a forma
 * vem do traçado a 8 m (`rede_no_mapa.TOLERANCIA_FINA`): com os 25 m dos
 * percursos do planeador, um traço de 7 px desviado vinte e sete píxeis
 * atravessava um quarteirão a direito e parecia um erro.
 */
const LARGURAS_DA_REDE: Record<1 | 2 | 3, [number, number, number, number]> = {
  3: [1.5, 3, 5, 7],
  2: [1, 2, 3.5, 5],
  1: [0.6, 1.2, 2, 3],
};

/** A largura de um traço da rede, por classe e por zoom; `mais` é o contorno. */
function larguraDaRede(mais = 0): unknown {
  const em = (i: number) => [
    'match',
    ['get', 'f'],
    3,
    LARGURAS_DA_REDE[3][i] + mais,
    2,
    LARGURAS_DA_REDE[2][i] + mais,
    LARGURAS_DA_REDE[1][i] + mais,
  ];
  return ['interpolate', ['linear'], ['zoom'], 8, em(0), 11, em(1), 14, em(2), 16, em(3)];
}

export const FONTE_DA_REDE = 'rede';

/**
 * As camadas da rede: o contorno, o traço na cor do modo, e as travessas do
 * comboio. `esbatida` é a rede por trás de uma viagem escolhida: a 25 %,
 * para a viagem ser a única coisa que se lê.
 *
 * O ESBATIDO É UMA COR, E NÃO UMA OPACIDADE. Com `line-opacity`, cada sítio
 * onde dois traços se tocam — e numa rede são milhares, nas juntas e nos
 * troços partilhados — fica com o dobro da tinta, e a rede esbatida enchia-se
 * de nós escuros. A cor misturada com o fundo é a mesma em toda a parte.
 */
export function camadasDaRede(tema: TemaDoMapa, esbatida = false): LayerSpecification[] {
  const fundo = FUNDO_DO_MAPA[tema];
  const cor = (modo: string) => {
    const c = corDaRede(tema, modo);
    return esbatida ? misturar(c, fundo, 0.25) : c;
  };
  const porModo = [
    'match',
    ['get', 'modo'],
    ...Object.keys(CORES_DA_REDE[tema]).flatMap((m) => [m, cor(m)]),
    cor('autocarro'),
  ];
  // Os mais frequentes por cima: onde uma linha de hora a hora cruza uma de
  // duas viagens por dia, o traço grosso não fica cortado pelo fino.
  const ordem = ['coalesce', ['get', 'viagens'], 0];
  return [
    {
      id: 'rede-contorno',
      type: 'line',
      source: FONTE_DA_REDE,
      minzoom: 7,
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ordem },
      paint: {
        // Branco no claro; no escuro, o fundo — um contorno claro à volta
        // de cada traço era uma segunda rede, mais clara do que a primeira.
        'line-color': tema === 'claro' ? '#ffffff' : fundo,
        'line-width': larguraDaRede(2),
        'line-opacity': esbatida ? 0 : 1,
      },
    } as LayerSpecification,
    {
      id: 'rede-linha',
      type: 'line',
      source: FONTE_DA_REDE,
      minzoom: 7,
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ordem },
      paint: {
        'line-color': porModo,
        'line-width': larguraDaRede(),
      },
    } as LayerSpecification,
    // AS TRAVESSAS DO COMBOIO: um tracejado claro por dentro do traço, que é
    // o desenho de sempre do caminho de ferro. Só a partir de onde o traço
    // tem largura para elas.
    {
      id: 'rede-travessas',
      type: 'line',
      source: FONTE_DA_REDE,
      minzoom: 11,
      filter: ['==', ['get', 'modo'], 'comboio'],
      paint: {
        'line-color': tema === 'claro' ? '#ffffff' : fundo,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 1.4, 16, 2.2],
        'line-dasharray': [1.2, 2.4],
        'line-opacity': esbatida ? 0 : 1,
      },
    } as LayerSpecification,
  ];
}

// --- os nomes dos pontos ----------------------------------------------------

/**
 * OS NOMES DAS ESTAÇÕES E DAS PARAGENS. Nenhuma tinha nome no mapa: quem o
 * abria via um ponto e tinha de lhe tocar para saber o que era. As estações
 * desde que se distinguem umas das outras (z11), em negrito; as paragens só
 * de perto (z15), e só onde couberem — cedem a tudo o resto.
 *
 * `zminDoPonto` é a regra de `pontos-no-mapa.ts` (o zoom a partir do qual o
 * ponto se desenha): um nome não aparece antes do ponto dele.
 */
export function camadasDosNomesDosPontos(tema: TemaDoMapa, fonte: string): LayerSpecification[] {
  const C = CORES_DOS_PONTOS[tema];
  return [
    {
      id: 'nomes-de-paragens',
      type: 'symbol',
      source: fonte,
      minzoom: 15,
      filter: [
        'all',
        ['==', ['get', 'tipo'], 'paragem'],
        ['>=', ['zoom'], ['coalesce', ['get', 'zmin'], 0]],
      ],
      layout: {
        'text-field': ['coalesce', ['get', 'rotulo'], ['get', 'nome']],
        'text-font': FONTE_REGULAR,
        'text-size': 11,
        'text-max-width': 9,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        'text-radial-offset': 0.9,
        'text-justify': 'auto',
        'text-padding': 3,
        // As mais servidas primeiro: entre duas que não cabem, fica o nome
        // da que tem mais autocarros.
        'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'partidas'], 0]],
      },
      paint: {
        'text-color': C.secundario,
        'text-halo-color': C.halo,
        'text-halo-width': 1.6,
      },
    } as LayerSpecification,
    {
      id: 'nomes-de-estacoes',
      type: 'symbol',
      source: fonte,
      minzoom: 11,
      filter: ['==', ['get', 'tipo'], 'estacao'],
      layout: {
        'text-field': ['coalesce', ['get', 'rotulo'], ['get', 'nome']],
        'text-font': FONTE_NEGRITO,
        'text-size': 12,
        'text-max-width': 9,
        'text-variable-anchor': ['right', 'left', 'top', 'bottom'],
        'text-radial-offset': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 16, 1.3],
        'text-justify': 'auto',
        'text-padding': 4,
      },
      paint: {
        'text-color': C.texto,
        'text-halo-color': C.halo,
        'text-halo-width': 1.8,
      },
    } as LayerSpecification,
  ];
}
