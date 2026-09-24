'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapaLibre, GeoJSONSource } from 'maplibre-gl';
// A FOLHA DE ESTILO DA BIBLIOTECA, que faltava — e que se notava em tudo
// menos no mapa. Sem ela os controlos ficam sem tamanho nem ícone e apanham
// o `button` global deste sítio: apareciam três bolas azuis no canto. A tela
// desenha-se à mesma porque o MapLibre a posiciona por estilos em linha, e
// foi por isso que isto passou despercebido tanto tempo.
//
// É um `import` de CSS, não de código: o Next extrai-o na construção e não
// traz um byte de JavaScript atrás — o MapLibre continua a entrar só dentro
// do `useEffect`.
import 'maplibre-gl/dist/maplibre-gl.css';
import { estiloDoMapa } from '@/lib/estilo-mapa';
import { camadasDe } from '@/lib/pontos-no-mapa';
import type { Ponto } from '@/lib/formato';
import type { PercursoGeo } from '@/lib/otp';

/**
 * O mapa. Não é um componente numa página — é a página.
 *
 * **O MapLibre entra por importação dinâmica, dentro do `useEffect`.** O sítio
 * é exportação estática: mesmo um componente `'use client'` é renderizado em
 * Node na construção, e a biblioteca toca no `window` ao ser importada. Um
 * `import` no topo deste ficheiro parte a construção inteira.
 *
 * **E os mosaicos são nossos.** `pmtiles://` é um protocolo que o MapLibre
 * aprende em execução: o ficheiro está no nosso servidor e o navegador pede-lhe
 * pedaços por intervalos de bytes. Não há servidor de mosaicos, não há chave
 * de API e não há terceiro a ver quem consultou que paragem (§7).
 *
 * ACESSIBILIDADE, e é o ponto que decide se isto é legal ou não. Uma tela de
 * mosaicos não é legível por um leitor de ecrã, e fingir que é com
 * `role="application"` e uma etiqueta é pior do que assumir. Aqui o mapa está
 * `aria-hidden`, e **tudo o que se faz nele faz-se também na lista ao lado** —
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

/** Quem liga «menos movimento» no sistema está a pedir que nada deslize. */
const semMovimento = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Mapa({
  centro,
  zoom = 12,
  pontos,
  aoEscolher,
  mosaicos,
  foco,
  percurso,
  alternativas,
  etiqueta,
  enquadrar,
  margemInferior = 260,
  modosVisiveis,
}: {
  centro: [number, number];
  zoom?: number;
  pontos: Marca[];
  aoEscolher?: (p: Marca) => void;
  mosaicos: string;
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
   * Os tipos de ponto a mostrar. `undefined` mostra tudo — é o que serve a
   * página de direções, que não tem filtro nenhum por cima.
   */
  modosVisiveis?: Set<string>;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const escolher = useRef(aoEscolher);
  escolher.current = aoEscolher;

  const [estado, setEstado] = useState<'a-carregar' | 'pronto' | 'falhou'>('a-carregar');

  useEffect(() => {
    let vivo = true;
    let criado: MapaLibre | null = null;

    (async () => {
      try {
        const [{ Map, NavigationControl, GeolocateControl, ScaleControl, addProtocol }, pm] =
          await Promise.all([import('maplibre-gl'), import('pmtiles')]);
        if (!vivo || !caixa.current) return;

        // O protocolo `pmtiles://` ensina-se ao MapLibre uma vez por página.
        const protocolo = new pm.Protocol();
        addProtocol('pmtiles', protocolo.tile);

        criado = new Map({
          container: caixa.current,
          style: estiloDoMapa(mosaicos),
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
        criado.addControl(
          new GeolocateControl({
            positionOptions: { enableHighAccuracy: false },
            trackUserLocation: true,
            showAccuracyCircle: true,
          }),
          'bottom-right',
        );
        criado.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

        // O erro vai para a consola: um mapa que falha em silêncio é uma
        // caixa cinzenta que ninguém consegue diagnosticar.
        criado.on('error', (e) => {
          console.error('mapa:', e.error?.message ?? e);
          setEstado('falhou');
        });
        criado.on('load', () => {
          if (!vivo) return;
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
          criado!.addLayer({
            id: 'alternativas-linha',
            type: 'line',
            source: 'alternativas',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#9aa9a2', 'line-width': 4, 'line-opacity': 0.7 },
          });

          criado!.addSource('percurso', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          // Duas camadas: um contorno branco por baixo e a cor do modo por
          // cima. Sem o contorno, uma linha azul-escura sobre uma estrada
          // cinzenta some-se — e o percurso é a resposta à pergunta.
          criado!.addLayer({
            id: 'percurso-contorno',
            type: 'line',
            source: 'percurso',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
          });
          criado!.addLayer({
            id: 'percurso-linha',
            type: 'line',
            source: 'percurso',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['get', 'cor'],
              'line-width': 5,
              // A pé vai a tracejado, como em qualquer mapa de transportes:
              // é a diferença entre «o autocarro leva-te» e «isto andas tu».
              'line-dasharray': [
                'case',
                ['==', ['get', 'modo'], 'WALK'],
                ['literal', [0.5, 1.6]],
                ['literal', [1, 0]],
              ],
            },
          });

          criado!.addSource('paragens', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          // UMA CAMADA POR MODO, e não um círculo azul para tudo.
          //
          // A cor, o zoom a que aparece e o tamanho vêm de `pontos-no-mapa.ts`
          // e derivam do que EXISTE nos dados: uma região sem bicicletas não
          // ganha camada de bicicletas, e um modo que nunca vimos ganha uma
          // camada neutra sem se tocar em código.
          for (const c of camadasDe(pontos.map((p) => p.tipo))) {
            criado!.addLayer({
              id: `pontos-${c.tipo}`,
              type: 'circle',
              source: 'paragens',
              minzoom: c.minzoom,
              // DE LONGE NÃO SE MOSTRAM AS 2 392.
              //
              // Vistas de cima, são uma nuvem que tapa as estradas, os rios e
              // o próprio percurso — e não respondem a pergunta nenhuma,
              // porque a esse zoom não se distingue uma da outra. Entre o
              // `minzoom` e 13 ficam só as que têm serviço a sério, que é o
              // que desenha a espinha da rede. Os outros modos são poucos e
              // aparecem todos. O catálogo em `/rede/` tem-nas todas, sempre.
              filter: c.desbastar
                ? [
                    'all',
                    ['==', ['get', 'tipo'], c.tipo],
                    ['any', ['>=', ['zoom'], 13], ['>', ['coalesce', ['get', 'partidas'], 0], 40]],
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
                // A aparecer, aparece a desvanecer: pontos que saltam para o
                // ecrã a meio de um zoom parecem um erro de desenho.
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
            });

            criado!.on('click', `pontos-${c.tipo}`, (e) => {
              const f = e.features?.[0];
              if (f && escolher.current) escolher.current(f.properties as unknown as Marca);
            });
            criado!.on('mouseenter', `pontos-${c.tipo}`, () => {
              criado!.getCanvas().style.cursor = 'pointer';
            });
            criado!.on('mouseleave', `pontos-${c.tipo}`, () => {
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
    for (const c of camadasDe(pontos.map((x) => x.tipo))) {
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
    // E nunca mais de metade da tela: uma margem maior do que o mapa não
    // deixa onde desenhar, e é a segunda maneira de o `fitBounds` desistir.
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
    const baixo = Math.min(margemInferior, m.getContainer().clientHeight * 0.45);
    m.setPadding({ top: 0, right: 0, bottom: baixo, left: 0 });
  }, [margemInferior, estado]);

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
    let marca: import('maplibre-gl').Marker | null = null;
    if (etiqueta) {
      import('maplibre-gl').then(({ Marker }) => {
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
      // Só o respiro. O que está tapado já está na margem do mapa.
      padding: 28,
      duration: semMovimento() ? 0 : 900,
      maxZoom: 15,
    });
  }, [enquadrar, estado, margemInferior]);

  return (
    <div className="mapa-caixa">
      {/* `aria-hidden`: uma tela de mosaicos não é legível, e dizer que é com
          uma etiqueta é enganar quem depende dela. O caminho sem mapa está na
          lista, que é HTML a sério. */}
      <div ref={caixa} className="mapa" aria-hidden="true" />
      {estado === 'a-carregar' && <p className="mapa-aviso">A carregar o mapa…</p>}
      {estado === 'falhou' && (
        <p className="mapa-aviso alerta">
          O mapa não carregou. A lista de paragens em baixo funciona à mesma.
        </p>
      )}
    </div>
  );
}
