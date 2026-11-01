'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  Map as MapaLibre,
  GeoJSONSource,
  LayerSpecification,
  MapGeoJSONFeature,
} from 'maplibre-gl';
import {
  ATRIBUICAO_OSM,
  CORES_DOS_PONTOS,
  FONTE_DA_REDE,
  camadasDaRede,
  camadasDosNomesDosPontos,
  classeDasViagens,
  estiloDoMapa,
  type TemaDoMapa,
} from '@/lib/estilo-mapa';
import {
  camadasDe,
  raioNoZoom,
  rotuloNoMapa,
  zoomDeAparecer,
  type CamadaDePontos,
} from '@/lib/pontos-no-mapa';
import { DENSIDADE, LADO, imagemDaPlaca } from '@/lib/icones-do-mapa';
import type { Ponto } from '@/lib/formato';
import { descodificarLinha, type PercursoGeo } from '@/lib/otp';
import { ouvirTema, temaEfetivo } from '@/lib/tema';

/**
 * O mapa. Não é um componente numa página — é a página.
 *
 * **O MapLibre entra por importação dinâmica, dentro do `useEffect`.** Mesmo
 * um componente `'use client'` é renderizado em Node no servidor, e a
 * biblioteca toca no `window` ao ser importada. Um `import` no topo deste
 * ficheiro parte a construção inteira. E vem da pasta onde o processador está
 * (`carregarMapLibre`), não do empacotador.
 *
 * **E o processador é servido por nós.** Desde a versão 6, o trabalho pesado
 * do mapa corre num Web Worker que é um módulo à parte, e a biblioteca não o
 * encontra sozinha dentro de um pacote do Next. O `carregarMapLibre` diz-lhe
 * onde está, e o `scripts/copiar-maplibre.mjs` põe-no lá.
 *
 * **E os mosaicos são nossos.** `pmtiles://` é um protocolo que o MapLibre
 * aprende em execução: o ficheiro está no nosso servidor e o navegador pede-lhe
 * pedaços por intervalos de bytes. Não há servidor de mosaicos, não há chave
 * de API e não há terceiro a ver quem consultou que paragem (§7).
 *
 * ACESSIBILIDADE, e é o ponto que decide se isto é legal ou não. Uma tela de
 * mosaicos não é legível por um leitor de ecrã, e fingir que é com
 * `role="application"` e uma etiqueta é pior do que assumir. Aqui a tela do
 * mapa está `aria-hidden` (os botões dele não: têm nome, e o foco chega-lhes),
 * e **tudo o que se faz nele faz-se também na lista ao lado** —
 * que é HTML a sério, com ligações a sério. O mapa é uma vista dos dados, não
 * a única porta para eles.
 */

export type Marca = Ponto & { partidas?: number };

/** O que o MapLibre escreve nos controlos que este mapa usa, em português. */
const NOMES_DOS_CONTROLOS = {
  'AttributionControl.ToggleAttribution': 'Mostrar ou esconder a atribuição',
  'AttributionControl.MapFeedback': 'Corrigir o mapa',
  'GeolocateControl.FindMyLocation': 'Mostrar onde estou',
  'GeolocateControl.LocationNotAvailable': 'Localização indisponível',
  'Map.Title': 'Mapa',
  'Marker.Title': 'Marcador no mapa',
  'NavigationControl.ResetBearing': 'Pôr o norte para cima',
  'NavigationControl.ZoomIn': 'Aproximar',
  'NavigationControl.ZoomOut': 'Afastar',
  'Popup.Close': 'Fechar',
};

/**
 * Onde está o MapLibre: a pasta que o `scripts/copiar-maplibre.mjs` enche com
 * a versão instalada, e que o `next.config.mjs` diz qual é.
 */
const PASTA_DO_MAPLIBRE = `/maplibre/${process.env.NEXT_PUBLIC_MAPLIBRE}`;

type Biblioteca = typeof import('maplibre-gl');

/**
 * A FOLHA DE ESTILO DA BIBLIOTECA, pedida quando o mapa se vai desenhar.
 *
 * Sem ela os controlos ficam sem tamanho nem ícone e apanham o `button` global
 * deste sítio: apareciam três bolas azuis no canto. Era um `import` de CSS
 * neste ficheiro, e o Next punha-a no `<head>` como folha que BLOQUEIA A
 * PINTURA (P3-028): 83 kB à frente de qualquer pixel, também nas páginas a que
 * os pré-carregamentos a levavam, que não têm mapa nenhum. Agora entra só onde
 * há mapa, e só quando ele se vai desenhar — e o mapa espera por ela, para os
 * botões não aparecerem um instante sem estilo e depois saltarem.
 *
 * No fim do `<head>`, como estava: as regras deste sítio que a corrigem são
 * mais precisas do que as dela, e as que empatam ganham por virem depois.
 */
function folhaDoMapa(): Promise<void> {
  const href = `${PASTA_DO_MAPLIBRE}/maplibre-gl.css`;
  return new Promise((resolver) => {
    const ja = document.querySelector<HTMLLinkElement>('link[data-folha-do-mapa]');
    if (ja?.sheet) return resolver();
    const l = ja ?? document.createElement('link');
    l.addEventListener('load', () => resolver(), { once: true });
    // Sem a folha o mapa desenha-se na mesma, e os botões ficam feios — o que
    // é melhor do que não haver mapa.
    l.addEventListener('error', () => resolver(), { once: true });
    if (!ja) {
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.folhaDoMapa = '';
      document.head.appendChild(l);
    }
  });
}

/**
 * A biblioteca, carregada uma vez e guardada.
 *
 * O `setWorkerUrl` tem de acontecer antes do primeiro `new Map` e nunca mais.
 * Amarrá-lo ao carregamento garante isso sem uma bandeira à parte, e deixa
 * dito num sítio só que isto se carrega uma vez.
 *
 * VEM DA PASTA DO PROCESSADOR, E NÃO DO EMPACOTADOR (P3-007). O `import()` do
 * pacote fazia o Next pôr o MapLibre num pedaço seu, com uma cópia do código
 * partilhado lá dentro — e o processador ia buscar outra cópia do mesmo
 * código a `/maplibre/`. Eram 137 kB comprimidos descarregados duas vezes, e
 * analisados duas vezes, na página mais pesada do sítio. Daqui, o principal e
 * o processador importam o MESMO `maplibre-gl-shared.mjs`, e a cache serve-o
 * uma vez. O `webpackIgnore` deixa o `import()` para o navegador; os tipos
 * continuam a vir do pacote.
 *
 * A versão vai no caminho, como a pasta onde o `copiar-maplibre.mjs` a põe:
 * um processador antigo em cache nunca fala com um módulo principal novo.
 */
let biblioteca: Promise<Biblioteca> | null = null;

function carregarMapLibre(): Promise<Biblioteca> {
  biblioteca ??= Promise.all([
    import(/* webpackIgnore: true */ `${PASTA_DO_MAPLIBRE}/maplibre-gl.mjs`) as Promise<Biblioteca>,
    folhaDoMapa(),
  ])
    .then(([modulo]) => {
      modulo.setWorkerUrl(`${PASTA_DO_MAPLIBRE}/maplibre-gl-worker.mjs`);
      return modulo;
    })
    .catch((e) => {
      // Uma falha não fica guardada: a próxima tentativa volta a pedir.
      biblioteca = null;
      throw e;
    });
  return biblioteca;
}

/** Quem liga «menos movimento» no sistema está a pedir que nada deslize. */
const semMovimento = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * O tema da página — o escolhido no cabeçalho, ou o do aparelho (`lib/tema.ts`).
 * Era só o do sistema: com o tema à escolha, um mapa claro numa página que se
 * escolheu escura voltava a encandear.
 */
function temaDaPagina(): TemaDoMapa {
  return temaEfetivo();
}

/**
 * MUDA O TEMA DE UM MAPA QUE JÁ ESTÁ DESENHADO, camada a camada.
 *
 * Um `setStyle` refazia o estilo inteiro e levava com ele as camadas que o
 * sítio acrescenta depois — os pontos da rede, o percurso escolhido. As cores
 * do mapa de base são só tinta: troca-se a tinta de cada camada do estilo, e
 * o resto fica onde estava. As camadas que o sítio acrescenta — a rede, os
 * pontos e os nomes deles — trocam a sua da mesma maneira (`camadasNossas`).
 */
function aplicarTema(
  m: MapaLibre,
  mosaicos: string,
  atribuicao: string | undefined,
  tema: TemaDoMapa,
  nossas: LayerSpecification[],
) {
  pintar(m, [...estiloDoMapa(mosaicos, atribuicao, tema).layers, ...nossas]);
}

/** Troca a tinta destas camadas, as que existirem no mapa. */
function pintar(m: MapaLibre, camadas: LayerSpecification[]) {
  for (const camada of camadas) {
    if (!('paint' in camada) || !camada.paint || !m.getLayer(camada.id)) continue;
    for (const [propriedade, valor] of Object.entries(camada.paint)) {
      m.setPaintProperty(
        camada.id,
        propriedade as Parameters<MapaLibre['setPaintProperty']>[1],
        valor,
      );
    }
  }
}

/** Só se mostra o que já se separou do vizinho: ver `zoomDeAparecer`. */
const JA_APARECEU = ['>=', ['zoom'], ['coalesce', ['get', 'zmin'], 0]];

/** Uma interpolação pelo zoom, a partir de pares `[zoom, valor]`. */
const pelosZooms = (pares: [number, number][], f: (v: number) => number = (v) => v) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...pares.flatMap(([z, v]) => [z, f(v)]),
];

/**
 * A CAMADA DE UM MODO — a mesma especificação para a criar e para lhe trocar
 * a tinta quando o tema muda.
 *
 * A PARAGEM É UM ANEL, com o miolo claro e o contorno da cor da rede: um disco
 * azul por cima do traço azul da linha desaparecia nele. O anel lê-se como as
 * estações de um mapa de metro, e o contorno engrossa com o zoom.
 */
function camadaDosPontos(c: CamadaDePontos, tema: TemaDoMapa, placa: boolean): LayerSpecification {
  const id = `pontos-${c.tipo}`;
  const filtro = ['all', ['==', ['get', 'tipo'], c.tipo], JA_APARECEU];
  if (placa) {
    return {
      id,
      type: 'symbol',
      source: 'paragens',
      minzoom: c.minzoom,
      filter: filtro,
      // A PLACA NÃO EMPURRA OS NOMES. Por baixo deles na ordem de desenho, e
      // fora da deteção de colisões: um nome de terra não desaparece por haver
      // uma estação ao lado. E OPACA DESDE QUE APARECE: a desvanecer entre o
      // `minzoom` e o seguinte, a estação era invisível a z9 — o zoom em que
      // se vê a região inteira, e em que ela é o marco que orienta.
      metadata: { cor: c.cor, forma: c.forma },
      layout: {
        'icon-image': `placa-${c.tipo}`,
        'icon-size': pelosZooms(c.raios, (r) => (r * 2) / (LADO / DENSIDADE)),
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    } as LayerSpecification;
  }
  const P = CORES_DOS_PONTOS[tema];
  const paragem = c.tipo === 'paragem';
  const escuro = tema === 'escuro';
  return {
    id,
    type: 'circle',
    source: 'paragens',
    minzoom: c.minzoom,
    metadata: { cor: c.cor, forma: c.forma },
    // DE LONGE NÃO SE MOSTRAM TODAS. Vistas de cima, as paragens são uma
    // nuvem que tapa a própria rede, e a esse zoom não se distingue uma da
    // outra. O `zmin` de cada ponto diz quando aparece (`zoomDeAparecer`):
    // as mais servidas desde o `minzoom`, as outras desde 13, e a gémea do
    // outro lado da rua só quando já se separa. O catálogo em `/rede/` tem-nas
    // todas, sempre.
    filter: filtro,
    paint: {
      'circle-radius': pelosZooms(c.raios),
      // O ANEL DE UM PRIVADO, no escuro, troca de papéis: miolo escuro e anel
      // claro. Branco, era o disco mais claro do mapa — um farol em cima do
      // terminal, a anunciar o expresso mais alto do que a rede.
      'circle-color': paragem ? P.miolo : c.anel ? (escuro ? P.halo : '#ffffff') : c.cor,
      'circle-stroke-color': paragem
        ? P.anel
        : c.anel
          ? escuro
            ? P.secundario
            : c.cor
          : '#ffffff',
      'circle-stroke-width': paragem
        ? pelosZooms([
            [11, 1.2],
            [13, 1.6],
            [14, 2],
            [16, 2.6],
          ])
        : c.anel
          ? 3
          : 1.5,
    },
  } as LayerSpecification;
}

/** Os modos da rede e os tipos de ponto que os filtros ligam e desligam. */
const TIPO_DO_MODO: Record<string, string> = { autocarro: 'paragem', comboio: 'estacao' };

/** O ficheiro da rede tal como o pipeline o escreve (`rede_no_mapa.py`). */
type RedeCrua = { modos: string[]; trocos: [number, number | null, string][] };

/**
 * A rede em GeoJSON, para o MapLibre: um traço por elemento, com o modo, as
 * viagens e a classe de espessura. Os módulos desligados no painel ficam de
 * fora, como os pontos deles.
 */
function rotasDaRede(d: RedeCrua, desligados: readonly string[]) {
  return {
    type: 'FeatureCollection' as const,
    features: (d.trocos ?? []).flatMap(([m, viagens, polilinha]) => {
      const modo = d.modos?.[m];
      if (!modo || desligados.includes(modo)) return [];
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: descodificarLinha(polilinha) },
          properties: { modo, viagens, f: classeDasViagens(viagens) },
        },
      ];
    }),
  };
}

/**
 * O QUE O DEDO APANHA: o ponto mais perto numa caixa de 44 × 44 px à volta do
 * toque (§4.5). Um anel de 5 px pede uma pontaria que ninguém tem de pé num
 * autocarro; o alvo é a caixa, e entre dois pontos dentro dela ganha o mais
 * perto do dedo.
 */
const ALVO = 44;

/** Onde se guarda a última vista, por região: `lembrarVista` é a chave. */
type Vista = { lon: number; lat: number; zoom: number };

function lerVista(chave: string, limites: Limites | null): Vista | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(chave) ?? 'null') as Vista | null;
    if (!v || ![v.lon, v.lat, v.zoom].every((x) => typeof x === 'number' && isFinite(x))) {
      return null;
    }
    if (v.zoom < 5 || v.zoom > 20) return null;
    // UMA VISTA DE OUTRO SÍTIO NÃO SE ABRE. Com a caixa da área servida
    // alargada para metade de cada lado: o que estiver fora disso é de outra
    // região no mesmo endereço (uma pré-visualização), ou de uns dados que
    // mudaram de sítio.
    if (limites) {
      const [[o, s], [e, n]] = limites;
      const [dx, dy] = [(e - o) / 2, (n - s) / 2];
      if (v.lon < o - dx || v.lon > e + dx || v.lat < s - dy || v.lat > n + dy) return null;
    }
    return v;
  } catch {
    return null;
  }
}

function guardarVista(chave: string, v: Vista): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(v));
  } catch {
    // Sem armazenamento (navegação privada, cota cheia): abre-se na área toda.
  }
}

/** `[[oeste, sul], [este, norte]]`, como o `fitBounds` do MapLibre. */
export type Limites = [[number, number], [number, number]];

/**
 * O RESPIRO À VOLTA DA ÁREA SERVIDA, além do que as folhas tapam: a coluna dos
 * botões do mapa à direita, e a escala e a atribuição em baixo.
 */
const RESPIRO = { top: 16, bottom: 40, left: 16, right: 60 };

/**
 * O centro e o zoom que mostram os limites inteiros no que as folhas não
 * tapam — a conta do `fitBounds`, feita aqui para o esboço e para o mapa
 * nascerem já no sítio.
 */
function vistaDosLimites(
  limites: Limites,
  largura: number,
  altura: number,
  margem: { top: number; bottom: number; left: number; right: number },
): { centro: [number, number]; zoom: number } {
  const [[o, s], [e, n]] = limites;
  const [x0, y0] = projetar(n, o, 0);
  const [x1, y1] = projetar(s, e, 0);
  const livreX = Math.max(80, largura - margem.left - margem.right - RESPIRO.left - RESPIRO.right);
  const livreY = Math.max(80, altura - margem.top - margem.bottom - RESPIRO.top - RESPIRO.bottom);
  const zoom = Math.log2(
    Math.min(livreX / Math.max(x1 - x0, 1e-9), livreY / Math.max(y1 - y0, 1e-9)),
  );
  return {
    centro: [(s + n) / 2, (o + e) / 2],
    zoom: Math.max(6, Math.min(15, zoom)),
  };
}

/**
 * A imagem da placa de um modo, posta no mapa uma vez. `false` quando não se
 * pôde desenhar (sem tela) — e aí a camada é o círculo de sempre.
 */
function juntarPlaca(m: MapaLibre, c: CamadaDePontos): boolean {
  const nome = `placa-${c.tipo}`;
  if (m.hasImage(nome)) return true;
  const clara = c.fundo.toLowerCase() === '#ffffff';
  const imagem = imagemDaPlaca(c.modo, c.fundo, clara ? '#102c3f' : '#ffffff');
  if (!imagem) return false;
  m.addImage(nome, imagem, { pixelRatio: DENSIDADE });
  return true;
}

/**
 * A MARGEM DE BAIXO NUNCA PASSA DE DOIS TERÇOS DA TELA. As folhas chegam a
 * 62 % do mapa (a de abertura), e a margem é o que elas tapam, medido; o que
 * sobra é onde desenhar — sem sobra, o `fitBounds` desiste.
 */
const MARGEM_MAXIMA = 0.65;

/**
 * As margens que o mapa recebe: o que as folhas tapam, com os tetos que
 * deixam sempre onde desenhar. Em cima e em baixo juntos nunca passam de
 * quatro quintos da tela, e à esquerda nunca de metade — senão o `fitBounds`
 * desiste.
 */
function margensEfetivas(
  largura: number,
  altura: number,
  m: { baixo: number; esquerda: number; cima: number },
): { top: number; right: number; bottom: number; left: number } {
  const baixo = Math.min(m.baixo, altura * MARGEM_MAXIMA);
  const cima = Math.max(0, Math.min(m.cima, altura * 0.8 - baixo));
  return { top: cima, right: 0, bottom: baixo, left: Math.min(m.esquerda, largura * 0.5) };
}

/** Web Mercator, em píxeis de um mundo de 512 × 2^zoom — o que o MapLibre usa. */
function projetar(lat: number, lon: number, zoom: number): [number, number] {
  const mundo = 512 * 2 ** zoom;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * mundo, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * mundo];
}

/**
 * O ESBOÇO DO MAPA, ENQUANTO O MAPA NÃO CHEGA (P3-023).
 *
 * Em 4G lenta o mapa ficava quinze segundos um retângulo cinzento com «A
 * carregar o mapa…» — e quinze segundos de cinzento parecem avaria. Os pontos
 * já estão no navegador desde o primeiro instante: desenham-se aqui, no sítio
 * exato onde o mapa os vai pôr (a mesma projeção, o mesmo centro, o mesmo
 * zoom), e o mapa a sério pinta por cima quando chegar. Não salta nada — os
 * pontos já estavam onde ficam.
 *
 * É só desenho, e escondido de quem usa leitor de ecrã: o que se lê está na
 * procura e nas listas.
 */
function Esboco({
  pontos,
  centro,
  zoom,
  largura,
  altura,
  margemInferior,
  margemEsquerda,
}: {
  pontos: Marca[];
  centro: [number, number];
  zoom: number;
  largura: number;
  altura: number;
  margemInferior: number;
  margemEsquerda: number;
}) {
  const [cx, cy] = projetar(centro[0], centro[1], zoom);
  // O centro do mapa fica a meio do que as folhas NÃO tapam — é onde o mapa o
  // põe quando recebe as margens.
  const baixo = Math.min(margemInferior, altura * MARGEM_MAXIMA);
  const esquerda = Math.min(margemEsquerda, largura * 0.5);
  const meioY = (altura - baixo) / 2;
  const meioX = esquerda + (largura - esquerda) / 2;
  const camadas = camadasDe(pontos.map((p) => p.tipo));
  const regra = new Map(camadas.map((c) => [c.tipo, c]));
  // A MESMA REGRA DO MAPA: o que ainda não se separou do vizinho não aparece,
  // e o raio é o que o MapLibre vai interpolar a este zoom.
  const zmin = zoomDeAparecer(pontos);
  const escuro = temaDaPagina() === 'escuro';
  const cores = CORES_DOS_PONTOS[escuro ? 'escuro' : 'claro'];
  const visiveis = pontos.flatMap((p, i) => {
    const c = regra.get(p.tipo);
    if (!c || zoom < c.minzoom || Math.floor(zoom) < zmin[i]) return [];
    const [x, y] = projetar(p.lat, p.lon, zoom);
    const px = x - cx + meioX;
    const py = y - cy + meioY;
    if (px < -10 || py < -10 || px > largura + 10 || py > altura + 10) return [];
    return [{ px, py, c, r: raioNoZoom(c.raios, zoom) }];
  });
  return (
    <svg
      className="mapa-esboco"
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden="true"
      focusable="false"
    >
      {visiveis.map(({ px, py, c, r }, i) => (
        <circle
          key={i}
          cx={px}
          cy={py}
          r={r}
          fill={
            c.tipo === 'paragem'
              ? cores.miolo
              : c.anel
                ? escuro
                  ? cores.halo
                  : '#ffffff'
                : c.forma === 'placa'
                  ? c.fundo
                  : c.cor
          }
          stroke={
            c.tipo === 'paragem'
              ? cores.anel
              : c.anel && escuro
                ? cores.secundario
                : c.anel || c.fundo === '#ffffff'
                  ? c.cor
                  : '#ffffff'
          }
          strokeWidth={c.tipo === 'paragem' ? 1.5 : c.anel ? 2.5 : 1.5}
        />
      ))}
    </svg>
  );
}

export default function Mapa({
  centro,
  zoom = 12,
  tipos,
  pontos,
  aoEscolher,
  aoLocalizar,
  mosaicos,
  atribuicao,
  foco,
  percurso,
  alternativas,
  etiqueta,
  enquadrar,
  margemInferior = 260,
  margemEsquerda = 0,
  margemSuperior = 0,
  margensMedidas = true,
  modosVisiveis,
  rede = null,
  modosDesligados = [],
  limites = null,
  lembrarVista = null,
  perto = null,
}: {
  centro: [number, number];
  zoom?: number;
  /**
   * Os tipos de ponto que a região tem, para as camadas existirem antes de os
   * pontos chegarem — que agora chegam depois da página (P3-006). Sem isto,
   * um mapa que carregasse antes dos pontos ficava sem camada nenhuma onde os
   * pôr. Sem tipos, valem os dos pontos.
   */
  tipos?: string[];
  pontos: Marca[];
  aoEscolher?: (p: Marca) => void;
  /**
   * Onde está quem carregou no botão da localização, quando o navegador
   * responde. É o que deixa a folha dizer o que passa ali perto, em vez de o
   * botão só mexer o mapa (P2-016).
   */
  aoLocalizar?: (lat: number, lon: number) => void;
  mosaicos: string;
  /** De quem é o mapa de fundo, em HTML — sem isto, a do OpenStreetMap. */
  atribuicao?: string;
  /** Para onde o mapa se desloca quando alguém escolhe um sítio. */
  foco?: { lat: number; lon: number } | null;
  /** O itinerário escolhido, desenhado por cima do mapa. */
  percurso?: PercursoGeo | null;
  /** As outras opções, a cinzento por baixo: vê-se que há mais por onde ir. */
  alternativas?: PercursoGeo | null;
  /** A bolha com o tempo, pousada a meio do percurso. */
  etiqueta?: { lat: number; lon: number; texto: string } | null;
  /** A caixa a enquadrar — o percurso inteiro, de ponta a ponta. */
  enquadrar?: [[number, number], [number, number]] | null;
  /** Quanto do mapa está tapado por baixo. Muda quando um cartão sobe ou desce. */
  margemInferior?: number;
  /**
   * Quanto está tapado à esquerda — na secretária e com o telemóvel deitado,
   * as folhas são um painel desse lado, e o percurso enquadra-se no que sobra.
   */
  margemEsquerda?: number;
  /** Quanto está tapado em cima — o cartão das direções, num telemóvel. */
  margemSuperior?: number;
  /**
   * Se as margens já são as medidas. Antes disso o esboço e o aviso «A
   * carregar o mapa…» não se desenham: ficavam no sítio errado e saltavam
   * para o certo uma imagem depois.
   */
  margensMedidas?: boolean;
  /**
   * Os tipos de ponto a mostrar. `undefined` mostra tudo — é o que serve a
   * página de direções, que não tem filtro nenhum por cima.
   */
  modosVisiveis?: Set<string>;
  /**
   * Onde está a rede (`rede-no-mapa.json`): um traço por troço, mais grosso
   * onde passa mais. Sem ela — dados publicados antes de ela existir, ou uma
   * página sem rede para mostrar — o mapa desenha-se como antes, só pontos.
   */
  rede?: string | null;
  /** Os módulos que o painel desligou: a rede deles não se desenha. */
  modosDesligados?: readonly string[];
  /**
   * A ÁREA SERVIDA, para o mapa abrir nela inteira. Abria a z12 em cima da
   * paragem mais servida — via-se um bairro, e não a região a que o sítio
   * diz respeito.
   */
  limites?: Limites | null;
  /** A chave onde guardar a última vista; sem ela, não se guarda nem se lê. */
  lembrarVista?: string | null;
  /**
   * «PERTO DE MIM» NO MAPA: onde a pessoa está e as paragens mais perto, com
   * o número que têm na lista da folha. O mapa enquadra-as todas e numera-as
   * — a lista e o mapa são a mesma coisa. `comPonto` é `false` quando quem
   * deu a posição foi o botão do mapa, que já desenha o seu ponto azul.
   */
  perto?: {
    aqui: [number, number];
    comPonto: boolean;
    paragens: { lat: number; lon: number; n: number }[];
  } | null;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const tiposDasCamadas = useRef<string[]>([]);
  tiposDasCamadas.current = tipos ?? pontos.map((p) => p.tipo);
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;
  const localizar = useRef(aoLocalizar);
  localizar.current = aoLocalizar;
  /** Os pontos pelo tipo e pelo identificador: o toque devolve o ponto, e não uma cópia dele. */
  const pontoDe = useRef(new Map<string, Marca>());
  /**
   * SE A VISTA JÁ ESTÁ DECIDIDA. Até alguém mexer no mapa — ou o mapa ir a um
   * sítio escolhido, a um percurso, à localização —, a vista é a área servida
   * inteira, e volta a enquadrá-la quando as folhas mudam de altura. Depois,
   * é de quem a decidiu.
   */
  const vistaDecidida = useRef(false);
  /** As margens de agora, para quem as lê fora de um efeito (o nascer do mapa). */
  const margens = useRef({ baixo: margemInferior, esquerda: margemEsquerda, cima: margemSuperior });
  margens.current = { baixo: margemInferior, esquerda: margemEsquerda, cima: margemSuperior };
  /** A rede como chegou, para a voltar a filtrar sem a voltar a pedir. */
  const [rotas, setRotas] = useState<ReturnType<typeof rotasDaRede> | null>(null);
  /** O tamanho da caixa, para o esboço que se mostra enquanto o mapa chega. */
  const [tamanho, setTamanho] = useState<{ w: number; h: number } | null>(null);

  /**
   * ONDE O MAPA NASCE: a última vista de quem já cá esteve (`lembrarVista`),
   * ou a área servida inteira no que as folhas não tapam, ou — numa página
   * sem área declarada — o centro que ela deu. O esboço e o mapa perguntam
   * aqui, e nascem no mesmo sítio.
   */
  const cameraInicial = (
    w: number,
    h: number,
  ): { centro: [number, number]; zoom: number; origem: 'guardada' | 'limites' | 'centro' } => {
    const guardada = lembrarVista ? lerVista(lembrarVista, limites) : null;
    if (guardada)
      return { centro: [guardada.lat, guardada.lon], zoom: guardada.zoom, origem: 'guardada' };
    if (limites && w > 0 && h > 0) {
      return {
        ...vistaDosLimites(limites, w, h, margensEfetivas(w, h, margens.current)),
        origem: 'limites',
      };
    }
    return { centro, zoom, origem: 'centro' };
  };

  const [estado, setEstado] = useState<'a-carregar' | 'pronto' | 'falhou'>('a-carregar');

  // O tamanho da caixa, para o esboço: mede-se depois de montar, e segue as
  // mudanças de tamanho da janela enquanto o mapa não chega.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setTamanho({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    let vivo = true;
    let criado: MapaLibre | null = null;

    (async () => {
      try {
        const [{ Map, NavigationControl, GeolocateControl, ScaleControl, addProtocol }, pm] =
          await Promise.all([carregarMapLibre(), import('pmtiles')]);
        if (!vivo || !caixa.current) return;

        // O protocolo `pmtiles://` ensina-se ao MapLibre uma vez por página.
        const protocolo = new pm.Protocol();
        addProtocol('pmtiles', protocolo.tile);

        // ONDE NASCE: a última vista de quem já cá esteve, ou a área servida
        // inteira no que as folhas não tapam (`cameraInicial`). Nasce já com
        // as margens, para não saltar quando elas chegarem depois do `load`.
        const [largura, altura] = [caixa.current.clientWidth, caixa.current.clientHeight];
        const inicio = cameraInicial(largura, altura);
        if (inicio.origem === 'guardada') vistaDecidida.current = true;
        criado = new Map({
          container: caixa.current,
          // O MAPA NO TEMA DA PÁGINA, como o resto dela (P1-044): um mapa
          // claro no meio de uma página escura encandeava exatamente onde o
          // tema escuro devia poupar os olhos.
          style: estiloDoMapa(mosaicos, atribuicao || undefined, temaDaPagina()),
          center: [inicio.centro[1], inicio.centro[0]],
          zoom: inicio.zoom,
          // A ATRIBUIÇÃO JÁ ESCRITA QUANDO O CONTROLO NASCE. Vinha só da fonte
          // dos mosaicos, e o MapLibre só a escrevia quando a fonte respondia —
          // segundos depois, a alargar o canto de baixo para a esquerda: era o
          // salto que restava no ecrã de abertura (CLS 0,015, P3-023). É a
          // mesma frase que a fonte traz, e o MapLibre não a repete.
          attributionControl: { compact: false, customAttribution: atribuicao || ATRIBUICAO_OSM },
          // OS NOMES DOS CONTROLOS EM PORTUGUÊS. O MapLibre traz os seus em
          // inglês: quem parava o rato no botão da localização lia «Find my
          // location», numa página que é toda em português.
          locale: NOMES_DOS_CONTROLOS,
          // O tipo de letra do sistema para as etiquetas — sem servidor de
          // glifos de terceiro. Ver `estilo-mapa.ts`.
          localIdeographFontFamily: "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif",
        });
        mapa.current = criado;
        criado.setPadding(margensEfetivas(largura, altura, margens.current));

        // A TELA ESCONDE-SE, OS BOTÕES NÃO.
        //
        // O mapa inteiro estava `aria-hidden`, com os botões de aproximar, de
        // afastar e da localização lá dentro — e um botão escondido que se
        // alcança com o tabulador é uma armadilha: o foco vai para lá e o
        // leitor de ecrã não diz nada. O axe chama-lhe grave, e só deu por
        // isso quando houve uma região com mapa nos testes. O que não se lê é
        // a tela dos mosaicos, e é só ela que se esconde — e sai da ordem do
        // tabulador com ela. Os botões têm nome em português e ficam.
        const tela = criado.getCanvas();
        tela.setAttribute('aria-hidden', 'true');
        tela.setAttribute('tabindex', '-1');

        // O ÚNICO PONTO POR ONDE ISTO SE TESTA.
        //
        // Um mapa desenha-se numa tela: não há DOM para inspecionar, não há
        // texto para procurar, e comparar capturas de ecrã parte com o vento.
        // Sem um punho no mapa, nada do que este ficheiro decide — que
        // camadas existem, de que cor, ligadas ou desligadas — é verificável,
        // e a última vez que uma regra de zoom se partiu ninguém deu por isso
        // durante meses.
        //
        // É só LEITURA e não é segredo nenhum: é a mesma instância do
        // MapLibre que qualquer pessoa alcança pela consola do navegador.
        (window as unknown as { __mapa?: MapaLibre }).__mapa = criado;

        criado.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        // A LOCALIZAÇÃO EM BAIXO À DIREITA, e grande. É onde o polegar chega
        // sem largar o telemóvel, e é onde toda a gente já a foi procurar
        // mil vezes noutra aplicação. Continua a só perguntar quando se
        // carrega — o controlo do MapLibre não pede nada sozinho.
        // UM PEDIDO POR TOQUE, E NÃO UM SEGUIMENTO (`trackUserLocation:
        // false`). A seguir, o controlo voltava a centrar o mapa na pessoa a
        // CADA posição nova que o telemóvel desse — e cada posição nova punha
        // o «Aqui perto» a enquadrar outra vez a pessoa e as paragens. Os dois
        // puxavam o mapa à vez, sem fim: perto, longe, perto, longe, visto num
        // telemóvel a 1/11/2026. O MapLibre não larga o seguimento quando
        // quem move o mapa é um `fitBounds` que também aproxima (só larga
        // quando o movimento é de outra natureza), e por isso não havia como
        // os pôr de acordo. Aqui a pergunta é «o que passa perto de mim
        // agora», e responde-se a cada toque; o ponto azul fica onde a
        // resposta o pôs.
        const localizacao = new GeolocateControl({
          positionOptions: { enableHighAccuracy: false },
          trackUserLocation: false,
          showAccuracyCircle: true,
          // A z15 na pessoa: vê-se a rua e as paragens dela. Sem deslizar para
          // quem pediu ao sistema menos movimento.
          fitBoundsOptions: { maxZoom: 15, ...(semMovimento() ? { animate: false } : {}) },
        });
        // O PONTO AZUL PASSA A RESPONDER. Quem carrega neste botão quer saber o
        // que passa ali perto, e até aqui o mapa só se mexia (P2-016): a folha
        // de baixo recebe a posição e diz quais são as paragens mais perto.
        localizacao.on('geolocate', (pos) =>
          localizar.current?.(pos.coords.latitude, pos.coords.longitude),
        );
        // A ESCALA EM BAIXO À DIREITA, por cima da atribuição. Estava em
        // baixo à esquerda — e na secretária esse canto é o da coluna das
        // folhas: a escala ficava a meio da coluna, a flutuar sobre o painel.
        // Os controlos de baixo empilham-se do último para o primeiro: a
        // escala antes do botão da localização fica entre ele e a atribuição.
        criado.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
        criado.addControl(localizacao, 'bottom-right');
        // O BOTÃO NASCE SEM NOME. O MapLibre cria-o desativado e só lhe dá o
        // nome quando o navegador responde se sabe dar a localização — e nesse
        // intervalo o axe encontrava um botão sem nome nenhum, que é a
        // violação mais grave que ele conhece. Com o mapa a chegar mais cedo
        // (P3-023), o intervalo passou a apanhar-se. O nome vem já daqui; o
        // MapLibre troca-o pelo seu quando souber a resposta.
        const botaoDaLocalizacao = caixa.current?.querySelector('.maplibregl-ctrl-geolocate');
        if (botaoDaLocalizacao && !botaoDaLocalizacao.getAttribute('aria-label')) {
          const nome = NOMES_DOS_CONTROLOS['GeolocateControl.FindMyLocation'];
          botaoDaLocalizacao.setAttribute('aria-label', nome);
          botaoDaLocalizacao.setAttribute('title', nome);
        }

        // O erro vai para a consola: um mapa que falha em silêncio é uma
        // caixa cinzenta que ninguém consegue diagnosticar.
        //
        // E SÓ O ERRO QUE IMPEDE O MAPA DE NASCER esconde o mapa. O MapLibre
        // emite `error` também por UM mosaico que não chegou — e a página
        // trocava por um aviso de falha um mapa que podia estar quase todo
        // bom. Um mosaico perdido (traz `tile` ou `sourceId`) fica na consola;
        // depois de o mapa ter carregado, nenhum erro o tira do ecrã.
        let carregou = false;
        criado.on('error', (e) => {
          console.error('mapa:', e.error?.message ?? e);
          const deUmMosaico = 'tile' in e || 'sourceId' in e;
          if (!carregou && !deUmMosaico) setEstado('falhou');
        });
        criado.on('load', () => {
          if (!vivo) return;
          carregou = true;
          // OS PONTOS E O PERCURSO FICAM POR BAIXO DOS NOMES (P1-009).
          //
          // Entravam por cima de tudo, e as paragens caíam em cima das letras
          // das localidades: um ponto no meio do nome da vila, outro a comer
          // a preposição do nome do bairro. Os nomes são a única âncora de
          // orientação de um mapa; com um ponto por cima ficam por ler. O `beforeId` põe cada camada nossa logo abaixo da primeira
          // camada de nomes do estilo.
          const antesDosNomes = criado!.getStyle().layers.find((l) => l.type === 'symbol')?.id;
          const tema = temaDaPagina();

          // A REDE, POR BAIXO DE TUDO O QUE O SÍTIO ACRESCENTA. É o que um
          // mapa de transportes diz antes de qualquer outra coisa — por onde
          // passam as linhas —, e era o que este não dizia: os traçados só se
          // desenhavam para a viagem escolhida. Por cima das estradas e por
          // baixo do percurso escolhido e das paragens, que se desenham em
          // cima dela como as estações num mapa de metro.
          criado!.addSource(FONTE_DA_REDE, {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          for (const camada of camadasDaRede(tema)) criado!.addLayer(camada, antesDosNomes);
          if (rede) {
            fetch(rede)
              .then((r) => (r.ok ? (r.json() as Promise<RedeCrua>) : null))
              .then((d) => vivo && d && setRotas(rotasDaRede(d, modosDesligados)))
              // Sem a rede, o mapa é o de antes: pontos. Não é motivo para avisar.
              .catch((e) => console.warn('rede no mapa:', e));
          }

          // O PERCURSO ENTRA PRIMEIRO, para os pontos das paragens ficarem
          // por cima dele. A ordem de `addLayer` é a ordem de desenho, e um
          // traço de 6 px por cima de um ponto de 6 px apaga-o.
          // AS OUTRAS OPÇÕES, a cinzento e por baixo. Ver que há mais dois
          // caminhos possíveis é informação; um mapa com uma linha só faz
          // parecer que aquela é a única.
          criado!.addSource('alternativas', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          criado!.addLayer(
            {
              id: 'alternativas-linha',
              type: 'line',
              source: 'alternativas',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#9aa9a2', 'line-width': 4, 'line-opacity': 0.7 },
            },
            antesDosNomes,
          );

          criado!.addSource('percurso', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          // Duas camadas: um contorno branco por baixo e a cor do modo por
          // cima. Sem o contorno, uma linha azul-escura sobre uma estrada
          // cinzenta some-se — e o percurso é a resposta à pergunta.
          criado!.addLayer(
            {
              id: 'percurso-contorno',
              type: 'line',
              source: 'percurso',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
            },
            antesDosNomes,
          );
          criado!.addLayer(
            {
              id: 'percurso-linha',
              type: 'line',
              source: 'percurso',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': ['get', 'cor'],
                // O TROÇO SEM TRAÇADO É MAIS FINO E A TRACEJADO (P1-038). Um
                // comboio desenhado a direito de estação em estação, ao lado da
                // via férrea que o mapa desenha, parecia um erro de desenho — e
                // um traço cheio diz «é por aqui». O tracejado diz «mais ou
                // menos por aqui», que é o que se sabe.
                'line-width': ['case', ['boolean', ['get', 'aproximado'], false], 3.5, 5],
                // A pé vai a pontinhos, como em qualquer mapa de transportes:
                // é a diferença entre «o autocarro leva-te» e «isto andas tu».
                'line-dasharray': [
                  'case',
                  ['==', ['get', 'modo'], 'WALK'],
                  ['literal', [0.5, 1.6]],
                  ['boolean', ['get', 'aproximado'], false],
                  ['literal', [2, 1.5]],
                  ['literal', [1, 0]],
                ],
              },
            },
            antesDosNomes,
          );

          criado!.addSource('paragens', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          // UMA CAMADA POR MODO, e não um círculo azul para tudo.
          //
          // A cor, o zoom a que aparece, o tamanho e a FORMA vêm de
          // `pontos-no-mapa.ts` e derivam do que EXISTE nos dados: uma região
          // sem bicicletas não ganha camada de bicicletas, e um modo que nunca
          // vimos ganha uma camada neutra sem se tocar em código.
          for (const c of camadasDe(tiposDasCamadas.current)) {
            const id = `pontos-${c.tipo}`;
            const placa = c.forma === 'placa' && juntarPlaca(criado!, c);
            criado!.addLayer(camadaDosPontos(c, tema, placa), antesDosNomes);
            criado!.on('mouseenter', id, () => {
              criado!.getCanvas().style.cursor = 'pointer';
            });
            criado!.on('mouseleave', id, () => {
              criado!.getCanvas().style.cursor = '';
            });
          }

          // OS NOMES DAS ESTAÇÕES E DAS PARAGENS, por cima dos das aldeias e
          // por baixo dos das vilas: entre uma estação e uma aldeia que não
          // cabem as duas, fica a estação; a vila fica sempre.
          const antesDasVilas = criado!.getLayer('nomes-de-sitios') ? 'nomes-de-sitios' : undefined;
          for (const camada of camadasDosNomesDosPontos(tema, 'paragens')) {
            criado!.addLayer(camada, antesDasVilas);
          }

          // UM TOQUE, O PONTO MAIS PERTO DO DEDO (`ALVO`). Era um ouvinte por
          // camada, e só respondia a quem acertasse no próprio círculo — um
          // anel de cinco píxeis. Agora a caixa de 44 px à volta do toque
          // apanha tudo o que lá estiver desenhado, e escolhe-se o mais perto.
          criado!.on('click', (e) => {
            const camadas = camadasDe(tiposDasCamadas.current)
              .map((c) => `pontos-${c.tipo}`)
              .filter(
                (id) =>
                  criado!.getLayer(id) && criado!.getLayoutProperty(id, 'visibility') !== 'none',
              );
            if (!camadas.length || !escolher.current) return;
            const { x, y } = e.point;
            const meio = ALVO / 2;
            let melhor: MapGeoJSONFeature | null = null;
            let distancia = Infinity;
            for (const f of criado!.queryRenderedFeatures(
              [
                [x - meio, y - meio],
                [x + meio, y + meio],
              ],
              { layers: camadas },
            )) {
              if (f.geometry.type !== 'Point') continue;
              const q = criado!.project(f.geometry.coordinates as [number, number]);
              const d = Math.hypot(q.x - x, q.y - y);
              if (d < distancia) [melhor, distancia] = [f, d];
            }
            if (!melhor) return;
            const { tipo, id } = melhor.properties as { tipo: string; id: string };
            escolher.current(
              pontoDe.current.get(`${tipo}|${id}`) ?? (melhor.properties as unknown as Marca),
            );
          });

          // QUEM MEXE NO MAPA DECIDE A VISTA, e é essa que se guarda. Só
          // depois de decidida: a área inteira, sem ninguém lhe tocar, não é
          // uma escolha de ninguém — e guardá-la prendia a próxima visita ao
          // tamanho do ecrã desta.
          criado!.on('movestart', (e) => {
            if ((e as { originalEvent?: unknown }).originalEvent) vistaDecidida.current = true;
          });
          criado!.on('moveend', () => {
            if (!lembrarVista || !vistaDecidida.current) return;
            const c = criado!.getCenter();
            guardarVista(lembrarVista, { lon: c.lng, lat: c.lat, zoom: criado!.getZoom() });
          });

          // COM A LOCALIZAÇÃO JÁ CONCEDIDA, o mapa abre na pessoa, a z15. Só
          // quando já foi dada — perguntar à entrada era um diálogo do sistema
          // antes de se ver o que quer que fosse —, e só se o endereço não
          // pediu outra coisa (um ponto, uma viagem).
          const pedido = new URLSearchParams(window.location.search);
          if (lembrarVista && !['ponto', 'de', 'para'].some((k) => pedido.has(k))) {
            navigator.permissions
              ?.query({ name: 'geolocation' as PermissionName })
              .then((estadoDaPermissao) => {
                if (!vivo || estadoDaPermissao.state !== 'granted') return;
                if (localizacao.trigger()) vistaDecidida.current = true;
              })
              .catch(() => {});
          }

          setEstado('pronto');
        });
      } catch {
        if (vivo) setEstado('falhou');
      }
    })();

    return () => {
      vivo = false;
      criado?.remove();
      mapa.current = null;
      delete (window as unknown as { __mapa?: MapaLibre }).__mapa;
    };
    // De propósito só à entrada: o centro e o zoom mexem-se pelos métodos do
    // mapa, não recriando-o. Recriar um mapa a cada mudança pisca e perde a
    // posição de quem o estava a arrastar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O FILTRO LIGA E DESLIGA CAMADAS, e não refaz a fonte.
  //
  // Tirar os pontos dos dados obrigava o MapLibre a reprocessar 2 552 pontos a
  // cada toque num botão; mudar a visibilidade de uma camada é imediato e não
  // perde a posição de quem estava a arrastar o mapa.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    for (const c of camadasDe(tiposDasCamadas.current)) {
      const id = `pontos-${c.tipo}`;
      if (!m.getLayer(id)) continue;
      m.setLayoutProperty(
        id,
        'visibility',
        !modosVisiveis || modosVisiveis.has(c.tipo) ? 'visible' : 'none',
      );
    }
    // A REDE SEGUE OS MESMOS BOTÕES: desligar «Autocarro» tira as paragens e
    // as linhas, e não deixa um mapa de traços sem paragens. Um modo da rede
    // sem botão (um traçado sem pontos) fica sempre.
    const tipos = new Set(tiposDasCamadas.current);
    const modos = ['autocarro', 'comboio', 'urbano-municipal'].filter((modo) => {
      const tipo = TIPO_DO_MODO[modo] ?? modo;
      return !modosVisiveis || !tipos.has(tipo) || modosVisiveis.has(tipo);
    });
    const dosModos = ['in', ['get', 'modo'], ['literal', modos]];
    for (const camada of camadasDaRede('claro')) {
      if (!m.getLayer(camada.id)) continue;
      const proprio = 'filter' in camada ? camada.filter : undefined;
      m.setFilter(
        camada.id,
        (proprio ? ['all', proprio, dosModos] : dosModos) as Parameters<MapaLibre['setFilter']>[1],
      );
    }
  }, [modosVisiveis, pontos, estado]);

  // A REDE CHEGA DEPOIS DO MAPA: é um ficheiro à parte, e o mapa não espera
  // por ele para se desenhar.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto' || !rotas) return;
    (m.getSource(FONTE_DA_REDE) as GeoJSONSource | undefined)?.setData(rotas);
  }, [rotas, estado]);

  /** As camadas que o sítio acrescenta, com a tinta do tema — para o trocar. */
  const esbatida = !!percurso;
  const camadasNossas = (tema: TemaDoMapa): LayerSpecification[] => [
    ...camadasDaRede(tema, esbatida),
    ...camadasDosNomesDosPontos(tema, 'paragens'),
    // As placas são imagens, e não mudam com o tema: só os círculos.
    ...camadasDe(tiposDasCamadas.current)
      .filter((c) => c.forma !== 'placa')
      .map((c) => camadaDosPontos(c, tema, false)),
  ];
  const nossas = useRef(camadasNossas);
  nossas.current = camadasNossas;

  // COM UMA VIAGEM ESCOLHIDA, A REDE RECUA: fica a 25 %, e a viagem é a única
  // linha que se lê. Sem isto o percurso escolhido era mais um traço azul no
  // meio de cem.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    pintar(m, camadasDaRede(temaDaPagina(), esbatida));
  }, [esbatida, estado]);

  // O TEMA SEGUE O DA PÁGINA COM O MAPA ABERTO: quem escolhe o escuro no
  // menu, ou tem o telemóvel a mudar sozinho ao anoitecer, vê o mapa mudar
  // com a página, e não fica com um retângulo claro no meio dela.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    return ouvirTema(() => {
      const tema = temaDaPagina();
      aplicarTema(m, mosaicos, atribuicao || undefined, tema, nossas.current(tema));
    });
  }, [estado, mosaicos, atribuicao]);

  // Os pontos podem mudar depois de o mapa estar pronto (uma procura, um
  // filtro). Atualiza-se a fonte, não o mapa.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    const fonte = m.getSource('paragens') as GeoJSONSource | undefined;
    // O `zmin` de cada ponto (quem cede o lugar a quem) e o nome que o mapa
    // escreve vão nas propriedades; o toque devolve o ponto original.
    const zmin = zoomDeAparecer(pontos);
    pontoDe.current = new globalThis.Map(pontos.map((p) => [`${p.tipo}|${p.id}`, p]));
    fonte?.setData({
      type: 'FeatureCollection',
      features: pontos.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { ...p, zmin: zmin[i], rotulo: rotuloNoMapa(p) },
      })),
    });
  }, [pontos, estado]);

  // A MARGEM VIVE NO MAPA, E NÃO EM CADA CHAMADA.
  //
  // O MapLibre guarda uma margem na própria transformação, e o `padding` de
  // um `easeTo` ou de um `fitBounds` **SOMA-SE** a essa. Com a margem a ir em
  // cada chamada, cada uma empilhava-se na anterior: a primeira punha 160 em
  // baixo, a seguinte pedia 400 e o mapa calculava com 560, a terceira com
  // 720 — até o `fitBounds` desistir com um aviso na consola (que ninguém lê)
  // e deixar o mapa onde estava. Medido numa viagem entre duas cidades: o
  // mapa ficava a zoom 9,73 onde devia estar a 10,7, e antes disso ficava
  // preso no 15.
  //
  // Agora há um só sítio a dizer quanto do mapa está tapado, e as chamadas
  // que se seguem pedem só o respiro delas.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    // E nunca mais de dois terços da tela (`MARGEM_MAXIMA`): uma margem maior
    // do que o mapa não deixa onde desenhar, e é a segunda maneira de o
    // `fitBounds` desistir.
    // `resize()` ANTES DE MEXER NA MARGEM, e é o que faltava.
    //
    // A tela do MapLibre e a ideia que ele tem do tamanho dela podem
    // divergir: a altura do mapa aqui é posta por medição depois da
    // montagem, e quando divergem ele desenha só o pedaço que julga ter e
    // deixa o resto TRANSPARENTE. O que se via era uma faixa clara entre o
    // cartão de cima e a folha de baixo — o fundo da caixa a espreitar por
    // uma tela meio pintada. Pedir-lhe que se volte a medir é barato e
    // resolve-o na origem.
    m.resize();
    const aplicar = () => {
      const { clientWidth, clientHeight } = m.getContainer();
      m.setPadding(
        margensEfetivas(clientWidth, clientHeight, {
          baixo: margemInferior,
          esquerda: margemEsquerda,
          cima: margemSuperior,
        }),
      );
      // A ÁREA SERVIDA VOLTA A CABER quando as folhas mudam de altura — até
      // alguém decidir a vista (`vistaDecidida`). As folhas medem-se depois
      // de o mapa nascer, e a primeira medida pode não ser a última.
      if (limites && !vistaDecidida.current) {
        m.fitBounds(limites, { padding: RESPIRO, duration: 0, maxZoom: 15 });
      }
    };
    // UMA MARGEM NOVA NÃO INTERROMPE UM MOVIMENTO. O `setPadding` é um
    // `jumpTo`, e um `jumpTo` pára a animação que estiver a meio: o mapa ia
    // a voar para a localização de quem carregou no botão, a folha crescia
    // com as paragens perto («Perto de ti»), e o voo ficava parado onde ia
    // — a z8, com a pessoa fora do ecrã. Espera-se que acabe.
    if (m.isMoving()) m.once('moveend', aplicar);
    else aplicar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margemInferior, margemEsquerda, margemSuperior, estado]);

  // O MAPA VAI ATÉ AO QUE SE ESCOLHEU.
  //
  // Sem isto, escolher na procura abria o cartão e deixava o mapa onde estava
  // — e quem procurou ficava sem saber onde fica o que encontrou. É o
  // movimento que diz «é aqui», e é metade do que faz uma aplicação de mapa
  // parecer uma aplicação de mapa.
  //
  // `easeTo` e não `jumpTo`: o salto desorienta, porque não se vê a relação
  // entre onde se estava e onde se está. Quem tiver o sistema em «menos
  // movimento» recebe um salto, que é o que essa preferência quer dizer.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto' || !foco) return;
    vistaDecidida.current = true;
    m.easeTo({
      center: [foco.lon, foco.lat],
      zoom: Math.max(m.getZoom(), 15),
      duration: semMovimento() ? 0 : 900,
    });
  }, [foco, estado]);

  // O percurso escolhido. Sem isto as direções são uma lista de horas com um
  // mapa ao lado que não sabe do que se está a falar.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    const fonte = m.getSource('percurso') as GeoJSONSource | undefined;
    fonte?.setData(percurso ?? { type: 'FeatureCollection', features: [] });
  }, [percurso, estado]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    const fonte = m.getSource('alternativas') as GeoJSONSource | undefined;
    fonte?.setData(alternativas ?? { type: 'FeatureCollection', features: [] });
  }, [alternativas, estado]);

  // A BOLHA COM O TEMPO, pousada a meio do percurso — «53 min», ali, sem ser
  // preciso olhar para o painel. É o detalhe que faz o mapa responder
  // sozinho, e é um `div` a sério, não um desenho na tela: lê-se, copia-se e
  // aumenta com o tipo de letra do sistema.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    let vivo = true;
    let marca: InstanceType<Biblioteca['Marker']> | null = null;
    if (etiqueta) {
      carregarMapLibre().then(({ Marker }) => {
        if (!vivo) return;
        const el = document.createElement('div');
        el.className = 'bolha-tempo';
        el.textContent = etiqueta.texto;
        // Já está escrito no painel, em HTML a sério: aqui seria a segunda vez.
        el.setAttribute('aria-hidden', 'true');
        marca = new Marker({ element: el }).setLngLat([etiqueta.lon, etiqueta.lat]).addTo(m);
      });
    }
    return () => {
      vivo = false;
      marca?.remove();
    };
  }, [etiqueta, estado]);

  // PERTO DE MIM: a pessoa e as paragens mais perto, numeradas como na lista,
  // e o mapa a enquadrá-las. O mapa não se mexia, e as paragens da lista não
  // se encontravam nele — «a 250 m» de quê, para que lado? Os números não se
  // tocam (`pointer-events: none`): o toque cai na paragem por baixo, que
  // abre o cartão dela, como tocar na lista.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto' || !perto) return;
    let vivo = true;
    const marcas: InstanceType<Biblioteca['Marker']>[] = [];
    carregarMapLibre().then(({ Marker }) => {
      if (!vivo) return;
      if (perto.comPonto) {
        const el = document.createElement('div');
        el.className = 'aqui-no-mapa';
        el.setAttribute('aria-hidden', 'true');
        marcas.push(new Marker({ element: el }).setLngLat([perto.aqui[1], perto.aqui[0]]).addTo(m));
      }
      for (const p of perto.paragens) {
        const el = document.createElement('div');
        el.className = 'numero-no-mapa';
        el.textContent = String(p.n);
        // A lista, em HTML, já diz o número e o nome: aqui seria a segunda vez.
        el.setAttribute('aria-hidden', 'true');
        marcas.push(
          new Marker({ element: el, anchor: 'bottom', offset: [0, -8] })
            .setLngLat([p.lon, p.lat])
            .addTo(m),
        );
      }
    });
    const lons = [perto.aqui[1], ...perto.paragens.map((p) => p.lon)];
    const lats = [perto.aqui[0], ...perto.paragens.map((p) => p.lat)];
    const caixaDePerto: Limites = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    const enquadrarPerto = () => {
      if (!vivo) return;
      vistaDecidida.current = true;
      // O respiro de cima é o do número, que se desenha por cima da paragem —
      // e, num telemóvel, o da procura e da fila das camadas, que flutuam no
      // alto sem tirar margem ao mapa: o número 2 ficava por baixo delas.
      const estreito = m.getContainer().clientWidth < 1024;
      m.fitBounds(caixaDePerto, {
        padding: { top: estreito ? 150 : 56, bottom: 40, left: 40, right: 72 },
        duration: semMovimento() ? 0 : 900,
        maxZoom: 17,
      });
    };
    // Quem carregou no botão do mapa vê-o voar até si: enquadra-se depois.
    if (m.isMoving()) m.once('moveend', enquadrarPerto);
    else enquadrarPerto();
    return () => {
      vivo = false;
      m.off('moveend', enquadrarPerto);
      for (const marca of marcas) marca.remove();
    };
  }, [perto, estado]);

  // E o mapa enquadra-o todo: mostrar o percurso e deixar metade fora do ecrã
  // é pior do que não o mostrar, porque parece que acaba ali.
  //
  // `margemInferior` está nas dependências de propósito — não para a somar
  // outra vez, mas porque quando o painel desce o percurso tem de voltar a
  // enquadrar-se no espaço que ficou.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto' || !enquadrar) return;
    vistaDecidida.current = true;
    m.fitBounds(enquadrar, {
      // Só o respiro. O que está tapado já está na margem do mapa — menos o
      // que o próprio mapa põe por cima de si: a coluna dos botões à direita
      // (aproximar, afastar, a localização) e, em baixo, a escala e a
      // atribuição, que sobem com a folha. Uma ponta do percurso encostada a
      // um desses lados ficava por baixo deles.
      padding: { top: 28, bottom: 52, left: 28, right: 72 },
      duration: semMovimento() ? 0 : 900,
      maxZoom: 15,
    });
  }, [enquadrar, estado, margemInferior, margemEsquerda, margemSuperior]);

  // OS AVISOS FICAM NO QUE SE VÊ DO MAPA (P3-023). O meio da caixa é, num
  // telemóvel, a beira da folha de abertura: «A carregar o mapa…» ficava por
  // baixo dela, a espreitar como um defeito, e o aviso de falha ficava meio
  // tapado. As margens são as que o mapa recebe, com os mesmos tetos, e vão
  // para o CSS como variáveis — com nome próprio: as `--tapado-*` da
  // `AppDoMapa` são outra medida (o que cada canto tem tapado), e herdam-se
  // até aos botões do mapa, que estão aqui dentro.
  const baixo = tamanho ? Math.min(margemInferior, tamanho.h * MARGEM_MAXIMA) : margemInferior;
  const esquerda = tamanho ? Math.min(margemEsquerda, tamanho.w * 0.5) : margemEsquerda;
  const margensDosAvisos = {
    '--aviso-em-baixo': `${Math.round(baixo)}px`,
    '--aviso-a-esquerda': `${Math.round(esquerda)}px`,
  } as CSSProperties;

  return (
    <div className="mapa-caixa" style={margensDosAvisos}>
      {/* A TELA de mosaicos não é legível, e dizer que é com uma etiqueta é
          enganar quem depende dela: esconde-se ela (ver acima), e não a caixa
          inteira, que tem os botões. O caminho sem mapa está na procura e nas
          listas, que são HTML a sério. */}
      <div ref={caixa} className="mapa" />
      {estado === 'a-carregar' && tamanho && margensMedidas && (
        <Esboco
          pontos={pontos}
          {...(({ centro, zoom }) => ({ centro, zoom }))(cameraInicial(tamanho.w, tamanho.h))}
          largura={tamanho.w}
          altura={tamanho.h}
          margemInferior={margemInferior}
          margemEsquerda={margemEsquerda}
        />
      )}
      {estado === 'a-carregar' && margensMedidas && (
        <p className="mapa-aviso a-carregar">A carregar o mapa…</p>
      )}
      {/* O AVISO MANDA PARA ONDE HÁ RESPOSTA. Prometia «a lista de paragens
          em baixo», e não há lista nenhuma por baixo do mapa: quem a ia
          procurar ficava sem caminho no momento em que precisava dele. */}
      {estado === 'falhou' && (
        <p className="mapa-aviso alerta">
          O mapa não carregou. A procura e as direções funcionam na mesma, e a lista de todas as
          paragens está em <a href="/rede/">A rede</a>.
        </p>
      )}
    </div>
  );
}
