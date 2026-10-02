'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Map as MapaLibre, GeoJSONSource } from 'maplibre-gl';
import { ATRIBUICAO_OSM, estiloDoMapa } from '@/lib/estilo-mapa';
import { camadasDe, type CamadaDePontos } from '@/lib/pontos-no-mapa';
import { DENSIDADE, imagemDaPlaca } from '@/lib/icones-do-mapa';
import type { Ponto } from '@/lib/formato';
import type { PercursoGeo } from '@/lib/otp';

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
  const visiveis = pontos.flatMap((p) => {
    const c = regra.get(p.tipo);
    if (!c || zoom < c.minzoom) return [];
    if (c.desbastar && zoom < 13 && (p.partidas ?? 0) <= 40) return [];
    const [x, y] = projetar(p.lat, p.lon, zoom);
    const px = x - cx + meioX;
    const py = y - cy + meioY;
    if (px < -10 || py < -10 || px > largura + 10 || py > altura + 10) return [];
    return [{ px, py, c }];
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
      {visiveis.map(({ px, py, c }, i) => (
        <circle
          key={i}
          cx={px}
          cy={py}
          r={c.raio[0] + 1}
          fill={c.anel ? '#ffffff' : c.forma === 'placa' ? c.fundo : c.cor}
          stroke={c.anel || c.fundo === '#ffffff' ? c.cor : '#ffffff'}
          strokeWidth={c.anel ? 2.5 : 1.5}
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
  modosVisiveis,
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
   * Os tipos de ponto a mostrar. `undefined` mostra tudo — é o que serve a
   * página de direções, que não tem filtro nenhum por cima.
   */
  modosVisiveis?: Set<string>;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const tiposDasCamadas = useRef<string[]>([]);
  tiposDasCamadas.current = tipos ?? pontos.map((p) => p.tipo);
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;
  const localizar = useRef(aoLocalizar);
  localizar.current = aoLocalizar;
  /** O tamanho da caixa, para o esboço que se mostra enquanto o mapa chega. */
  const [tamanho, setTamanho] = useState<{ w: number; h: number } | null>(null);

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

        criado = new Map({
          container: caixa.current,
          style: estiloDoMapa(mosaicos, atribuicao || undefined),
          center: [centro[1], centro[0]],
          zoom,
          attributionControl: { compact: false },
          // OS NOMES DOS CONTROLOS EM PORTUGUÊS. O MapLibre traz os seus em
          // inglês: quem parava o rato no botão da localização lia «Find my
          // location», numa página que é toda em português.
          locale: NOMES_DOS_CONTROLOS,
          // O tipo de letra do sistema para as etiquetas — sem servidor de
          // glifos de terceiro. Ver `estilo-mapa.ts`.
          localIdeographFontFamily: "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif",
        });
        mapa.current = criado;

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
        const localizacao = new GeolocateControl({
          positionOptions: { enableHighAccuracy: false },
          trackUserLocation: true,
          showAccuracyCircle: true,
        });
        // O PONTO AZUL PASSA A RESPONDER. Quem carrega neste botão quer saber o
        // que passa ali perto, e até aqui o mapa só se mexia (P2-016): a folha
        // de baixo recebe a posição e diz quais são as paragens mais perto.
        localizacao.on('geolocate', (pos) =>
          localizar.current?.(pos.coords.latitude, pos.coords.longitude),
        );
        criado.addControl(localizacao, 'bottom-right');
        criado.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

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
          const antesDosNomes = criado!.getLayer('nomes-de-sitios') ? 'nomes-de-sitios' : undefined;
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
            criado!.addLayer(
              placa
                ? {
                    id,
                    type: 'symbol',
                    source: 'paragens',
                    minzoom: c.minzoom,
                    filter: ['==', ['get', 'tipo'], c.tipo],
                    // A PLACA NÃO EMPURRA OS NOMES. Por baixo deles na ordem
                    // de desenho, e fora da deteção de colisões: um nome de
                    // terra não desaparece por haver uma estação ao lado.
                    metadata: { cor: c.cor, forma: c.forma },
                    layout: {
                      'icon-image': `placa-${c.tipo}`,
                      'icon-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        c.minzoom,
                        (c.raio[0] * 2) / (44 / DENSIDADE),
                        16,
                        (c.raio[1] * 2) / (44 / DENSIDADE),
                      ],
                      'icon-allow-overlap': true,
                      'icon-ignore-placement': true,
                    },
                    paint: {
                      'icon-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        c.minzoom,
                        0,
                        c.minzoom + 1,
                        1,
                      ],
                    },
                  }
                : {
                    id,
                    type: 'circle',
                    source: 'paragens',
                    minzoom: c.minzoom,
                    metadata: { cor: c.cor, forma: c.forma },
                    // DE LONGE NÃO SE MOSTRAM AS 2 392.
                    //
                    // Vistas de cima, são uma nuvem que tapa as estradas, os
                    // rios e o próprio percurso — e não respondem a pergunta
                    // nenhuma, porque a esse zoom não se distingue uma da
                    // outra. Entre o `minzoom` e 13 ficam só as que têm serviço
                    // a sério, que é o que desenha a espinha da rede. Os outros
                    // modos são poucos e aparecem todos. O catálogo em
                    // `/rede/` tem-nas todas, sempre.
                    filter: c.desbastar
                      ? [
                          'all',
                          ['==', ['get', 'tipo'], c.tipo],
                          [
                            'any',
                            ['>=', ['zoom'], 13],
                            ['>', ['coalesce', ['get', 'partidas'], 0], 40],
                          ],
                        ]
                      : ['==', ['get', 'tipo'], c.tipo],
                    paint: {
                      'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        c.minzoom,
                        c.raio[0],
                        16,
                        c.raio[1],
                      ],
                      // O ANEL troca os papéis: o branco vai para dentro e a cor
                      // para o contorno. Ver `anel` em `pontos-no-mapa.ts`.
                      'circle-color': c.anel ? '#ffffff' : c.cor,
                      'circle-stroke-color': c.anel ? c.cor : '#ffffff',
                      'circle-stroke-width': c.anel ? 3 : 1.5,
                      // A aparecer, aparece a desvanecer: pontos que saltam para
                      // o ecrã a meio de um zoom parecem um erro de desenho.
                      'circle-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        c.minzoom,
                        0,
                        c.minzoom + 1,
                        1,
                      ],
                      'circle-stroke-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        c.minzoom,
                        0,
                        c.minzoom + 1,
                        1,
                      ],
                    },
                  },
              antesDosNomes,
            );

            criado!.on('click', id, (e) => {
              const f = e.features?.[0];
              if (f && escolher.current) escolher.current(f.properties as unknown as Marca);
            });
            criado!.on('mouseenter', id, () => {
              criado!.getCanvas().style.cursor = 'pointer';
            });
            criado!.on('mouseleave', id, () => {
              criado!.getCanvas().style.cursor = '';
            });
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
  }, [modosVisiveis, pontos, estado]);

  // Os pontos podem mudar depois de o mapa estar pronto (uma procura, um
  // filtro). Atualiza-se a fonte, não o mapa.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto') return;
    const fonte = m.getSource('paragens') as GeoJSONSource | undefined;
    fonte?.setData({
      type: 'FeatureCollection',
      features: pontos.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: { ...p },
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
    const alto = m.getContainer().clientHeight;
    const baixo = Math.min(margemInferior, alto * MARGEM_MAXIMA);
    // Em cima e em baixo juntos nunca passam de quatro quintos da tela: é
    // preciso sobrar onde desenhar, senão o `fitBounds` desiste.
    const cima = Math.max(0, Math.min(margemSuperior, alto * 0.8 - baixo));
    const esquerda = Math.min(margemEsquerda, m.getContainer().clientWidth * 0.5);
    m.setPadding({ top: cima, right: 0, bottom: baixo, left: esquerda });
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

  // E o mapa enquadra-o todo: mostrar o percurso e deixar metade fora do ecrã
  // é pior do que não o mostrar, porque parece que acaba ali.
  //
  // `margemInferior` está nas dependências de propósito — não para a somar
  // outra vez, mas porque quando o painel desce o percurso tem de voltar a
  // enquadrar-se no espaço que ficou.
  useEffect(() => {
    const m = mapa.current;
    if (!m || estado !== 'pronto' || !enquadrar) return;
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
      {estado === 'a-carregar' && tamanho && (
        <Esboco
          pontos={pontos}
          centro={centro}
          zoom={zoom}
          largura={tamanho.w}
          altura={tamanho.h}
          margemInferior={margemInferior}
          margemEsquerda={margemEsquerda}
        />
      )}
      {estado === 'a-carregar' && <p className="mapa-aviso a-carregar">A carregar o mapa…</p>}
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
