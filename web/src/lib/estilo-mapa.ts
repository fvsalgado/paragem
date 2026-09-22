import type { StyleSpecification } from 'maplibre-gl';

/**
 * O estilo do mapa, escrito por nós.
 *
 * **Não se usa um estilo de terceiro, e não é ideologia.** Um estilo pronto
 * traz licença de terceiro, um servidor de terceiro para os tipos de letra e
 * os ícones, e uma paleta que não é a do §8 — três dependências novas para
 * poupar um ficheiro. O §7 já diz «sem serviços de mapas privados»; isto é a
 * mesma frase aplicada ao estilo.
 *
 * O esquema das camadas é o do OpenMapTiles, que é o que o Planetiler produz.
 *
 * AS CORES SAEM DO §8, com três acrescentos que o briefing não tinha porque
 * não previa mapa: a água, o verde e o cinzento das estradas. Escolhidos para
 * viverem com o `--fundo` e a `--marca`, e escuros o suficiente para o texto
 * por cima passar os 4,5:1.
 */

/**
 * A PALETA. A primeira versão era quase monocromática — creme, com verde a
 * 80 % de transparência e estradas brancas sobre fundo quase branco — e o
 * resultado, visto num telemóvel à luz do dia, era uma folha em branco com
 * nomes de ruas a flutuar. Um mapa sem cor não é sóbrio, é ilegível: a cor é
 * o que separa a água da mata e a mata do casario, antes de se ler um nome.
 *
 * Continua a sair do §8 no que o §8 define — o fundo, o texto, a marca — e
 * acrescenta o que ele não previa porque não previa mapa.
 *
 * A REGRA QUE ISTO FIXA, e que custou uma tarde a descobrir: **cada camada
 * tem de se distinguir da que está por baixo**. A segunda versão desta paleta
 * parecia razoável em papel e desenhava uma vila inteira dentro de três por
 * cento de diferença — `#e9e8e3` de casario, `#eef1ec` de fundo, `#fdfdfb` de
 * rua. Num ecrã ao sol isso é uma folha em branco, e eu passei meia hora a
 * procurar um mapa avariado que estava a funcionar perfeitamente.
 *
 * Agora: o fundo é o mais escuro dos claros, o casario é mais CLARO do que o
 * campo à volta (é assim que se lê uma vila num mapa), as ruas são brancas
 * com contorno cinzento, e os edifícios são visivelmente mais escuros do que
 * a rua. Todas continuam claras o suficiente para o texto preto por cima
 * passar os 4,5:1.
 */
const FUNDO = '#e6ebe3';
const AGUA = '#a3ccdf';
const AGUA_ESCURA = '#5d93b4';
const MATA = '#b9d8b1';
const CAMPO = '#d8e8ce';
const PARQUE = '#b5dfae';
const URBANO = '#f2f0ea';
const EDIFICIO = '#dbd7ce';
const EDIFICIO_RISCO = '#c4bfb4';
const ESTRADA = '#ffffff';
const ESTRADA_RISCO = '#bcc6bf';
const ESTRADA_MENOR = '#ffffff';
/* As vias rápidas em quente, como em qualquer mapa de estradas: é o que
   permite ler a rede principal sem ler um nome. */
const RAPIDA = '#f7d69a';
const RAPIDA_RISCO = '#d9a94f';
const TEXTO = '#102c3f';
const TEXTO_HALO = '#f3f6f1';
const SECUNDARIO = '#4a5c66';
const FRONTEIRA = '#a9b5ae';

/** A largura de uma estrada cresce com o zoom, e não em degraus bruscos. */
const largura = (paradas: [number, number][]): unknown => ({
  base: 1.4,
  stops: paradas,
});

export function estiloDoMapa(urlDosMosaicos: string): StyleSpecification {
  return {
    version: 8,
    name: 'Paragem',
    // A atribuição do OpenStreetMap NÃO é uma cortesia: a ODbL segue a obra
    // derivada, e estes mosaicos são obra derivada. Vai na fonte, que é o
    // sítio onde o MapLibre a lê para a mostrar sozinho — um rodapé
    // esquece-se numa refatoração, um campo da fonte viaja com os dados.
    sources: {
      osm: {
        type: 'vector',
        url: `pmtiles://${urlDosMosaicos}`,
        attribution:
          '© contribuidores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL',
      },
    },
    // OS GLIFOS SÃO NOSSOS, e não de um servidor de terceiro.
    //
    // O MapLibre exige isto para qualquer etiqueta de texto. Tentei sem — a
    // ideia era usar o tipo de letra do navegador pelo
    // `localIdeographFontFamily` — e não funciona: esse só cobre CJK. As
    // camadas de nomes recusavam-se a carregar e o mapa INTEIRO ficava
    // cinzento, sem dizer porquê.
    //
    // São 8 ficheiros e 260 kB, gerados por `scripts/glifos.mjs` do mesmo
    // Atkinson Hyperlegible do §8, e guardados no repositório.
    glyphs: '/glifos/{fontstack}/{range}.pbf',
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': FUNDO } },

      // --- o que está no chão ------------------------------------------
      {
        id: 'agua',
        type: 'fill',
        source: 'osm',
        'source-layer': 'water',
        paint: { 'fill-color': AGUA },
      },
      // O URBANO, por baixo de tudo o resto: é o que dá ao casario uma cor
      // diferente do campo, e é meio caminho para se perceber onde é a vila.
      {
        id: 'urbano',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landuse',
        filter: ['in', 'class', 'residential', 'suburb', 'neighbourhood', 'commercial'],
        paint: { 'fill-color': URBANO },
      },
      // A MATA E O CAMPO EM TONS DIFERENTES. Eram um só, a 80 % de
      // transparência: numa região que seja metade pinhal e metade olival,
      // isso apagava a diferença que mais se vê da estrada.
      {
        id: 'campo',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'grass', 'farmland', 'scrub'],
        paint: { 'fill-color': CAMPO },
      },
      {
        id: 'mata',
        type: 'fill',
        source: 'osm',
        'source-layer': 'landcover',
        filter: ['in', 'class', 'wood', 'forest'],
        paint: { 'fill-color': MATA },
      },
      {
        id: 'parque',
        type: 'fill',
        source: 'osm',
        'source-layer': 'park',
        paint: { 'fill-color': PARQUE },
      },
      {
        id: 'rio',
        type: 'line',
        source: 'osm',
        'source-layer': 'waterway',
        paint: {
          'line-color': AGUA,
          'line-width': largura([
            [8, 0.6],
            [14, 3],
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
          'fill-color': EDIFICIO,
          'fill-outline-color': EDIFICIO_RISCO,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
        },
      },

      // --- as estradas: contorno primeiro, enchimento depois -----------
      //
      // Dois traços por estrada, como num mapa impresso: o de baixo mais largo
      // e escuro faz o contorno, o de cima mais estreito e claro faz o asfalto.
      // Sem isto, duas estradas que se cruzam ficam uma mancha.
      {
        id: 'estradas-contorno',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'class'],
            'motorway',
            RAPIDA_RISCO,
            'trunk',
            RAPIDA_RISCO,
            ESTRADA_RISCO,
          ],
          'line-width': largura([
            [6, 1.5],
            [10, 4],
            [14, 12],
            [18, 32],
          ]) as number,
        },
      },
      // As ruas da vila levam contorno como as outras: sem ele, uma rua
      // branca sobre casario claro não existe — que foi exatamente o que
      // aconteceu na versão anterior desta paleta.
      {
        id: 'estradas-menores-contorno',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', 'class', 'minor', 'service', 'track'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ESTRADA_RISCO,
          'line-width': largura([
            [12, 1.6],
            [16, 8],
            [18, 17],
          ]) as number,
        },
      },
      {
        id: 'estradas-menores',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', 'class', 'minor', 'service', 'track'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ESTRADA_MENOR,
          'line-width': largura([
            [12, 0.8],
            [16, 6],
            [18, 14],
          ]) as number,
        },
      },
      {
        id: 'estradas',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'class'], 'motorway', RAPIDA, 'trunk', RAPIDA, ESTRADA],
          'line-width': largura([
            [6, 0.5],
            [10, 2.5],
            [14, 9],
            [18, 26],
          ]) as number,
        },
      },
      {
        id: 'caminhos',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['==', 'class', 'path'],
        paint: {
          'line-color': ESTRADA_RISCO,
          'line-width': largura([
            [15, 0.6],
            [18, 2],
          ]) as number,
          'line-dasharray': [2, 2],
        },
      },
      // O caminho de ferro, em dois traços: o carril escuro e as travessas
      // claras por cima. É o desenho de sempre, e é o que o distingue de uma
      // estrada num relance — aqui importa, porque metade da rede é comboio.
      {
        id: 'caminho-de-ferro',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'rail'],
        paint: {
          'line-color': SECUNDARIO,
          'line-width': largura([
            [9, 0.8],
            [14, 2.6],
            [18, 5],
          ]) as number,
          'line-opacity': 0.75,
        },
      },
      {
        id: 'caminho-de-ferro-travessas',
        type: 'line',
        source: 'osm',
        'source-layer': 'transportation',
        filter: ['==', 'class', 'rail'],
        minzoom: 11,
        paint: {
          'line-color': '#ffffff',
          'line-width': largura([
            [11, 0.6],
            [14, 1.4],
            [18, 2.6],
          ]) as number,
          'line-dasharray': [1.5, 2.5],
        },
      },

      // --- as fronteiras dos concelhos ---------------------------------
      {
        id: 'fronteiras',
        type: 'line',
        source: 'osm',
        'source-layer': 'boundary',
        filter: ['<=', 'admin_level', 8],
        paint: { 'line-color': FRONTEIRA, 'line-width': 1.2, 'line-dasharray': [3, 2] },
      },

      // --- os nomes ------------------------------------------------------
      //
      // `text-font: []` de propósito: sem servidor de glifos, o MapLibre usa
      // o tipo de letra local. É menos bonito do que uma fonte desenhada para
      // mapa, e é uma dependência a menos que pode falhar.
      {
        id: 'nomes-de-sitios',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['in', 'class', 'city', 'town', 'village', 'suburb'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Atkinson Hyperlegible Regular'],
          'text-size': ['match', ['get', 'class'], 'city', 16, 'town', 14, 'village', 12, 11],
          'text-max-width': 8,
        },
        paint: {
          'text-color': TEXTO,
          'text-halo-color': TEXTO_HALO,
          'text-halo-width': 1.6,
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
          'text-font': ['Atkinson Hyperlegible Regular'],
          'text-size': 11,
          'symbol-placement': 'line',
          'text-max-width': 8,
        },
        paint: {
          'text-color': AGUA_ESCURA,
          'text-halo-color': TEXTO_HALO,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'nomes-de-ruas',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Atkinson Hyperlegible Regular'],
          'text-size': 11,
          'symbol-placement': 'line',
        },
        paint: {
          'text-color': SECUNDARIO,
          'text-halo-color': TEXTO_HALO,
          'text-halo-width': 1.4,
        },
      },
    ],
  } as StyleSpecification;
}
