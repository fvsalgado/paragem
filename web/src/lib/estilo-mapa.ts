import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Sede } from './sedes';

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

/** O nome da fonte das sedes de concelho, que o estilo traz já com os pontos. */
export const FONTE_DAS_SEDES = 'sedes';

export function estiloDoMapa(
  urlDosMosaicos: string,
  atribuicao: string = ATRIBUICAO_OSM,
  tema: TemaDoMapa = 'claro',
  sedes: readonly Sede[] = [],
): StyleSpecification {
  const P = PALETA[tema];
  // OS NOMES DAS SEDES SAEM DO MAPA DE BASE quando a região os traz: escritos
  // duas vezes, um em cima do outro, liam-se borrados; e o do mapa de base só
  // existe a alguns zooms. Ver `nomes-das-sedes`, no fim.
  const naoESede: unknown[] = sedes.length
    ? ['!', ['in', ['get', 'name'], ['literal', sedes.map((x) => x.nome)]]]
    : ['literal', true];
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
      // As sedes de concelho, já no estilo: nascem com o mapa e não esperam
      // por pedido nenhum. São poucas (uma por concelho), e vêm da página.
      [FONTE_DAS_SEDES]: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: sedes.map((x) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [x.lon, x.lat] },
            properties: { nome: x.nome, peso: x.peso },
          })),
        },
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
          'all',
          naoESede,
          [
            'any',
            ['in', ['get', 'class'], ['literal', ['village', 'suburb']]],
            ['all', ['==', ['get', 'class'], 'hamlet'], ['>=', ['zoom'], 14]],
          ],
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
      //
      // E AS VILAS SÓ A PARTIR DE z9. De longe, o recorte traz meia dúzia de
      // vilas fora da região e nenhuma das de dentro que não seja sede — e as
      // sedes têm camada própria. Uma vila a 60 km da rede a tirar o lugar a
      // uma cidade da região era ruído no ecrã que mostra a região inteira.
      {
        id: 'nomes-de-sitios',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: [
          'all',
          naoESede,
          [
            'any',
            ['==', ['get', 'class'], 'city'],
            ['all', ['==', ['get', 'class'], 'town'], ['>=', ['zoom'], 9]],
          ],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': FONTE_NEGRITO,
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            ['match', ['get', 'class'], 'city', 14, 13],
            12,
            ['match', ['get', 'class'], 'city', 19, 16],
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
      // AS SEDES DE CONCELHO, POR CIMA DE TUDO, A TODOS OS ZOOMS (`sedes.ts`).
      // São o que orienta quem abre a região inteira num telemóvel, e o mapa
      // de base só as trazia a partir de z9 ou z10. A camada de cima é a
      // primeira a escolher onde se põe: entre uma sede e outra terra que não
      // cabem as duas, fica a sede. Um pouco maiores do que as cidades de
      // fora, e com o halo mais largo, para se lerem por cima da rede.
      {
        id: 'nomes-das-sedes',
        type: 'symbol',
        source: FONTE_DAS_SEDES,
        layout: {
          'text-field': ['get', 'nome'],
          'text-font': FONTE_NEGRITO,
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 13, 8, 14, 11, 17, 14, 20],
          'text-max-width': 8,
          'text-padding': 3,
          // Entre duas sedes que não cabem, fica a do concelho mais servido.
          'symbol-sort-key': ['-', 0, ['coalesce', ['get', 'peso'], 0]],
        },
        paint: {
          'text-color': P.TEXTO,
          'text-halo-color': P.TEXTO_HALO,
          'text-halo-width': 2,
        },
      },
    ],
  } as StyleSpecification;
}

// --- a rede, por cima das estradas e por baixo dos pontos -------------------

/**
 * A ESPESSURA PELA FREQUÊNCIA, em quatro classes de viagens por dia útil:
 * 12 ou mais, de 4 a 11, de 1 a 3, e nenhuma (ou desconhecida). Classes e não
 * uma escala contínua: a diferença entre 7 e 8 viagens não se lê num traço, e
 * a entre «passa de hora a hora» e «passa duas vezes por dia» lê-se de longe.
 *
 * OS LIMIARES SÃO OS DE UMA REDE DO INTERIOR, e foi a medição que os mudou.
 * Eram 20 e 6, que é como se conta numa cidade. Numa região real, pesada pelo
 * comprimento, a rede de autocarro tem a mediana nas 2 viagens por dia e o
 * percentil 90 nas 7: 72 % dos quilómetros caíam na classe fina e 1 % na
 * grossa, e a hierarquia que o código desenhava não se via — era um novelo.
 * Com 12 e 4, os corredores separam-se das carreiras de duas ou três
 * viagens, e estas das que nesse dia não andam.
 *
 * Zero viagens é uma linha que no dia de referência não anda (só ao sábado,
 * só nas férias); sem número é um urbano de que não se conhece a frequência
 * (`rede_no_mapa.py`). As duas ficam com o traço mais fino, que é não afirmar
 * o que não se sabe.
 */
export type ClasseDasViagens = 0 | 1 | 2 | 3;

const LIMIARES_DA_REDE = [1, 4, 12] as const;

export function classeDasViagens(viagens: number | null | undefined): ClasseDasViagens {
  const n = viagens ?? 0;
  return n >= LIMIARES_DA_REDE[2]
    ? 3
    : n >= LIMIARES_DA_REDE[1]
      ? 2
      : n >= LIMIARES_DA_REDE[0]
        ? 1
        : 0;
}

/** Os zooms das tabelas de larguras. */
const ZOOMS_DAS_LARGURAS = [8, 11, 14, 16] as const;
type Larguras = readonly [number, number, number, number];

/**
 * AS LARGURAS, a z8, z11, z14 e z16. Afastadas umas das outras de longe — à
 * escala da região eram 1,5, 1 e 0,6 px, e ao olho o mesmo fio — e de perto
 * como eram. A de z16 não passa dos 7 px porque a forma vem do traçado a 8 m
 * (`rede_no_mapa.TOLERANCIA_FINA`): com os 25 m dos percursos do planeador,
 * um traço de 7 px desviado vinte e sete píxeis atravessava um quarteirão a
 * direito e parecia um erro.
 */
const LARGURAS_DA_REDE: Record<ClasseDasViagens, Larguras> = {
  3: [3, 4, 5.5, 7],
  2: [1.6, 2.4, 3.5, 5],
  1: [0.8, 1.3, 2.2, 3],
  0: [0.5, 0.9, 1.6, 2.5],
};

/**
 * O COMBOIO FICA COMO ESTAVA: os limiares de antes (20 e 6 viagens) e as
 * larguras de antes. São poucas linhas, cinzentas e com travessas, e não se
 * perdiam no novelo; medi-las com a régua do autocarro engrossava o caminho
 * de ferro até gritar mais alto do que a rede de autocarros que o mapa mostra.
 */
const LIMIARES_DO_COMBOIO = [6, 20] as const;
const LARGURAS_DO_COMBOIO: readonly [Larguras, Larguras, Larguras] = [
  [0.6, 1.2, 2, 3],
  [1, 2, 3.5, 5],
  [1.5, 3, 5, 7],
];

/**
 * O CONTORNO NASCE COM O ZOOM. Era um traço claro de +2 px à volta de cada
 * linha a todas as escalas, e à da região, com mil e quinhentos traços finos,
 * havia mais contorno do que linha: o novelo era sobretudo ele, desenhado com
 * a mesma gramática das estradas. Até z9,5 a rede vai sem contorno; daí até
 * z12 ele aparece, e de perto separa a linha das ruas por onde ela passa,
 * como antes. O comboio leva-o sempre, como levava.
 */
export const CONTORNO_DESDE = 9.5;
const CONTORNO_INTEIRO = 12;

/**
 * O que o contorno tem a mais do que a linha, de cada lado somado: nada até
 * z9,5, 2 px a partir de z12, e a crescer entre os dois. Até z9,5 ele nem se
 * pinta (`line-opacity` em degrau, em `camadasDaRede`): da mesma largura da
 * linha, um contorno claro por baixo ainda aclarava a orla dos traços finos.
 */
export function haloDoContorno(z: number): number {
  return 2 * Math.min(1, Math.max(0, (z - CONTORNO_DESDE) / (CONTORNO_INTEIRO - CONTORNO_DESDE)));
}

/** Os zooms da expressão: os das tabelas e os do contorno, para a interpolação do MapLibre ser a desta conta. */
const ZOOMS_DA_REDE = [8, CONTORNO_DESDE, 11, CONTORNO_INTEIRO, 14, 16] as const;

const arredondar = (n: number) => Math.round(n * 100) / 100;

/** Uma tabela a um zoom qualquer: a interpolação linear que o MapLibre faz entre as paragens. */
function aoZoom(tabela: Larguras, z: number): number {
  const zs = ZOOMS_DAS_LARGURAS;
  if (z <= zs[0]) return tabela[0];
  for (let i = 1; i < zs.length; i++) {
    if (z <= zs[i]) {
      return tabela[i - 1] + ((tabela[i] - tabela[i - 1]) * (z - zs[i - 1])) / (zs[i] - zs[i - 1]);
    }
  }
  return tabela[tabela.length - 1];
}

export type TracoDaRede = { modo: string; viagens: number | null | undefined };

/**
 * A LARGURA DE UM TRAÇO DA REDE, em píxeis, a um zoom; `contorno` é a do
 * traço claro por baixo. É a conta de que sai a expressão do MapLibre
 * (`larguraDaRede`), e é ela que os testes leem.
 */
export function larguraDoTraco(
  { modo, viagens }: TracoDaRede,
  z: number,
  contorno = false,
): number {
  if (modo === 'comboio') {
    const n = viagens ?? 0;
    const classe = n >= LIMIARES_DO_COMBOIO[1] ? 2 : n >= LIMIARES_DO_COMBOIO[0] ? 1 : 0;
    return arredondar(aoZoom(LARGURAS_DO_COMBOIO[classe], z) + (contorno ? 2 : 0));
  }
  const linha = aoZoom(LARGURAS_DA_REDE[classeDasViagens(viagens)], z);
  if (!contorno) return arredondar(linha);
  return arredondar(linha + haloDoContorno(z));
}

/** A largura de um traço da rede como expressão do MapLibre, a partir de `larguraDoTraco`. */
function larguraDaRede(contorno = false): unknown {
  const px = (modo: string, viagens: number, z: number) =>
    larguraDoTraco({ modo, viagens }, z, contorno);
  const em = (z: number) => [
    'case',
    ['==', ['get', 'modo'], 'comboio'],
    [
      'step',
      ['coalesce', ['get', 'viagens'], 0],
      px('comboio', 0, z),
      LIMIARES_DO_COMBOIO[0],
      px('comboio', LIMIARES_DO_COMBOIO[0], z),
      LIMIARES_DO_COMBOIO[1],
      px('comboio', LIMIARES_DO_COMBOIO[1], z),
    ],
    [
      'match',
      ['get', 'f'],
      3,
      px('autocarro', LIMIARES_DA_REDE[2], z),
      2,
      px('autocarro', LIMIARES_DA_REDE[1], z),
      1,
      px('autocarro', LIMIARES_DA_REDE[0], z),
      px('autocarro', 0, z),
    ],
  ];
  return ['interpolate', ['linear'], ['zoom'], ...ZOOMS_DA_REDE.flatMap((z) => [z, em(z)])];
}

/**
 * OS RAMAIS RECUAM DE LONGE. Até z10 — a escala a que a região inteira cabe
 * no ecrã — as linhas com três viagens por dia ou menos vão num tom da cor do
 * modo, misturado com o fundo; a z12,5 já têm a cor inteira. Recuam e não se
 * escondem: um mapa da rede que tira uma linha por ela passar pouco mente
 * sobre a rede (`rede_no_mapa.py`).
 *
 * O tom é uma cor e não uma opacidade, pela razão da rede esbatida (abaixo),
 * e fica a 3:1 ou mais (WCAG 1.4.11) sobre as superfícies grandes do mapa —
 * o fundo, a mata, os jardins e o casario —, nos dois temas
 * (`tests/rede-no-mapa.test.mts`).
 *
 * Só recua o que se sabe que passa pouco: um urbano sem número de viagens tem
 * o traço mais fino, mas a cor inteira. E o comboio fica como estava.
 */
export const PESO_DOS_RAMAIS = 0.75;
const RAMAL_ATE_VIAGENS = 3;
const RAMAIS_RECUADOS_ATE = 10;
const RAMAIS_INTEIROS_DESDE = 12.5;

export function corDoRamal(tema: TemaDoMapa, modo: string): string {
  return misturar(corDaRede(tema, modo), FUNDO_DO_MAPA[tema], PESO_DOS_RAMAIS);
}

/** As superfícies do mapa de fundo por onde um traço da rede passa quilómetros a fio. */
export const SUPERFICIES_DO_MAPA: Record<TemaDoMapa, readonly string[]> = {
  claro: [CLARA.FUNDO, CLARA.MATA, CLARA.PARQUE, CLARA.URBANO],
  escuro: [ESCURA.FUNDO, ESCURA.MATA, ESCURA.PARQUE, ESCURA.URBANO],
};

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
  const cor = (modo: string, ramal: boolean) => {
    const c = corDaRede(tema, modo);
    if (esbatida) return misturar(c, fundo, 0.25);
    return ramal ? corDoRamal(tema, modo) : c;
  };
  const porModo = (ramal = false) => [
    'match',
    ['get', 'modo'],
    ...Object.keys(CORES_DA_REDE[tema]).flatMap((m) => [m, cor(m, ramal)]),
    cor('autocarro', ramal),
  ];
  // Um ramal: não é comboio, e sabe-se que passa pouco — sem número, não é.
  const eRamal = [
    'all',
    ['!=', ['get', 'modo'], 'comboio'],
    ['<=', ['coalesce', ['get', 'viagens'], RAMAL_ATE_VIAGENS + 1], RAMAL_ATE_VIAGENS],
  ];
  // Por trás de uma viagem escolhida a rede inteira já recuou, e por igual.
  const corDoTraco = esbatida
    ? porModo()
    : [
        'interpolate',
        ['linear'],
        ['zoom'],
        RAMAIS_RECUADOS_ATE,
        ['case', eRamal, porModo(true), porModo()],
        RAMAIS_INTEIROS_DESDE,
        porModo(),
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
        'line-width': larguraDaRede(true),
        // De longe só o comboio leva contorno; a rede de autocarros, a partir de z9,5.
        'line-opacity': esbatida
          ? 0
          : [
              'step',
              ['zoom'],
              ['case', ['==', ['get', 'modo'], 'comboio'], 1, 0],
              CONTORNO_DESDE,
              1,
            ],
      },
    } as LayerSpecification,
    {
      id: 'rede-linha',
      type: 'line',
      source: FONTE_DA_REDE,
      minzoom: 7,
      layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ordem },
      paint: {
        'line-color': corDoTraco,
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

// --- a linha escolhida, acesa por cima da rede -----------------------------

export const FONTE_DA_LINHA = 'linha-escolhida';
export const FONTE_DAS_PARAGENS_DA_LINHA = 'paragens-da-linha';

/** As cores de uma linha no mapa, uma por tema — a do escuro clareada, como os traços da página. */
export type CorDaLinha = { claro: string; escuro: string };

/**
 * A LINHA ESCOLHIDA, por cima da rede esbatida: um contorno da cor do fundo,
 * o traço na cor da linha, e as paragens dela como as estações de um mapa de
 * metro — o miolo claro e o anel da cor da linha. Mais grossa do que qualquer
 * traço da rede, para ser a única coisa que se lê.
 *
 * SEM TRAÇADO, A TRACEJADO (`aproximado`): as paragens ligadas a direito, que
 * é o que o planeador faz a uma perna sem traçado — e um traço cheio diria
 * «é por aqui».
 */
export function camadasDaLinha(
  tema: TemaDoMapa,
  cor: CorDaLinha,
  aproximado: boolean,
): LayerSpecification[] {
  const fundo = tema === 'claro' ? '#ffffff' : FUNDO_DO_MAPA.escuro;
  const traco = cor[tema];
  const pelo = (pares: [number, number][]) => [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...pares.flat(),
  ];
  return [
    {
      id: 'linha-contorno',
      type: 'line',
      source: FONTE_DA_LINHA,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': fundo,
        'line-width': pelo([
          [8, 5],
          [12, 8],
          [16, 13],
        ]),
      },
    } as LayerSpecification,
    {
      id: 'linha-traco',
      type: 'line',
      source: FONTE_DA_LINHA,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': traco,
        'line-width': pelo([
          [8, 3],
          [12, 5],
          [16, 8],
        ]),
        'line-dasharray': aproximado ? ['literal', [2, 1.5]] : ['literal', [1, 0]],
      },
    } as LayerSpecification,
    {
      id: 'linha-paragens',
      type: 'circle',
      source: FONTE_DAS_PARAGENS_DA_LINHA,
      paint: {
        // Pequenas de longe — num concelho são centenas, e de longe o que
        // se quer ver é onde há paragens, e não cada uma.
        'circle-radius': pelo([
          [8, 1.4],
          [11, 2.2],
          [13, 3.6],
          [16, 6.5],
        ]),
        'circle-color': tema === 'claro' ? '#ffffff' : CORES_DOS_PONTOS.escuro.miolo,
        'circle-stroke-color': traco,
        'circle-stroke-width': pelo([
          [8, 1],
          [11, 1.4],
          [13, 2.2],
          [16, 3],
        ]),
      },
    } as LayerSpecification,
  ];
}
