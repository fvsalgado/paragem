import { deLch, gama, lab, linear } from './cielab.ts';
import { contraste, MINIMO_DE_UM_TRACO, normalizar } from './cor.ts';

/**
 * O TRAÇO DE UMA LINHA: a cor dela desenhada como fio — a linha escolhida no
 * mapa, o percurso e o esquema na página dela, o fio da viagem no planeador.
 *
 * MÓDULO À PARTE, E PEDIDO SÓ QUANDO É PRECISO, por causa do peso. As contas
 * de cor pequenas (`cor.ts`) vão para o navegador em todas as páginas que
 * mostram um distintivo; esta é maior — o CIELAB e o OKLab — e só se faz no
 * navegador quando há uma linha para acender no mapa ou viagens para pintar
 * (`AppDoMapa`, `planeador.ts`), que a pedem com um `import()`. As páginas
 * da linha fazem-na no servidor. Junta às pequenas, eram mais 1,1 a 1,2 KiB
 * em todas as páginas do sítio, incluindo as que nunca desenham um traço.
 */

/**
 * A COR DE UMA LINHA PARA SE DESENHAR SOBRE O CLARO: a de `tracoDaLinha`, no
 * tema claro. `null` quando não há cor — ou quando é branco, que no GTFS quer
 * dizer «sem cor» (o comboio nacional declara `FFFFFF` em quase todas as
 * linhas).
 *
 * É a cor do fio da linha do tempo, na folha, e do percurso do planeador, no
 * mapa. No escuro o CSS mistura-a com branco (`--mistura-dos-tracos`), e
 * `tracoDaLinha` já a escolheu de modo a essa mistura também se ver.
 */
export function traco(cor?: string | null): string | null {
  return tracoDaLinha(cor)?.claro ?? null;
}

/**
 * OS FUNDOS POR ONDE PASSA O TRAÇO DE UMA LINHA, em cada tema: o branco das
 * folhas e do contorno da linha no mapa, o fundo da página, o fundo suave onde
 * se desenha o esquema dela, e o fundo do mapa (`FUNDO_DO_MAPA`, em
 * `estilo-mapa.ts`). Estão aqui, e não lá, para esta conta não arrastar o
 * estilo do mapa inteiro para cada página que mostra uma linha; um teste
 * confere que são os mesmos do CSS e do mapa (`tests/traco.test.mts`).
 */
export const FUNDOS_DOS_TRACOS = {
  claro: ['#ffffff', '#f5f7f4', '#eef2f0', '#eef0eb'],
  escuro: ['#0f1a20', '#16242c', '#1d2e37', '#172127'],
} as const;

/**
 * Quanto da cor de uma linha fica nos traços dela no tema escuro — o
 * `--mistura-dos-tracos` do CSS, que a mistura com branco em OKLab.
 */
export const MISTURA_DOS_TRACOS_NO_ESCURO = 0.58;

/**
 * A FOLGA DA MISTURA DO ESCURO. A mistura faz-se no CSS, e o navegador
 * arredonda-a à maneira dele: a conta daqui e a dele podem dar um tom de
 * diferença. Uma folga de 0,05 no contraste cobre-o.
 */
const FOLGA_DA_MISTURA = 0.05;

// O OKLab, para a mistura do escuro ser a mesma que a do `color-mix(in oklab)`
// do CSS. As matrizes são as do autor do espaço; as do CSS diferem na quarta
// casa decimal, que a folga acima cobre.
function paraOklab(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => linear(parseInt(c.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(gama(Math.min(1, Math.max(0, v))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** `a` misturada com `b`, com `peso` de `a`, em OKLab — o `color-mix(in oklab, a peso, b)` do CSS. */
export function misturarEmOklab(a: string, b: string, peso: number): string {
  const [x, y] = [paraOklab(a), paraOklab(b)];
  return deOklab([0, 1, 2].map((i) => x[i] * peso + y[i] * (1 - peso)) as [number, number, number]);
}

/** As cores de um traço, uma por tema — a mesma forma que o mapa usa (`CorDaLinha`). */
export type TracoNosDoisTemas = { claro: string; escuro: string };

/**
 * O TRAÇO DE UMA LINHA, NOS DOIS TEMAS, a ≥ 3:1 de todos os fundos por onde
 * passa (WCAG 1.4.11): no mapa, a linha escolhida; na página dela, o percurso
 * e o esquema; no planeador, o fio da viagem. `null` sem cor, ou com branco,
 * que no GTFS quer dizer «sem cor»: aí vale a cor do modo.
 *
 * Era a cor do distintivo, e o distintivo só garante o texto POR CIMA dele: um
 * bege com o número escuro lê-se a 5:1, e o mesmo bege como traço dava 2,1:1
 * sobre o fundo do mapa. Numa região real são trinta linhas assim, e há
 * amarelos piores. O distintivo fica como está; o traço é outra conta.
 *
 * - NO CLARO, A COR ESCURECE MANTENDO O TOM: desce a luminosidade L* do
 *   CIELAB, com o croma na mesma proporção, até passar em todos os fundos. É
 *   a mesma cor à sombra — um amarelo fica mostarda, não fica castanho. O
 *   escurecer de antes multiplicava os três canais, e um bege perdia o tom.
 * - NO ESCURO, É A MESMA COR MISTURADA COM BRANCO, como o CSS faz a todos os
 *   traços da página (`--mistura-dos-tracos`). Uma cor quase preta, misturada,
 *   continuava escura de mais para a folha escura; essa sobe de L* no claro
 *   até a mistura passar — o bastante, e não mais: continua a passar no claro.
 *
 * Uma cor que já passa nos dois temas fica como está.
 */
export function tracoDaLinha(cor?: string | null): TracoNosDoisTemas | null {
  const original = normalizar(cor);
  if (!original || original === '#ffffff') return null;
  const passa = (c: string, tema: keyof typeof FUNDOS_DOS_TRACOS, folga = 0) =>
    FUNDOS_DOS_TRACOS[tema].every((f) => contraste(c, f) >= MINIMO_DE_UM_TRACO + folga);
  const noEscuro = (c: string) => misturarEmOklab(c, '#ffffff', MISTURA_DOS_TRACOS_NO_ESCURO);
  const passaNoEscuro = (c: string) => passa(noEscuro(c), 'escuro', FOLGA_DA_MISTURA);

  const [L, a, b] = lab(original);
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  // Ao escurecer o croma desce com a luz; ao clarear fica — um quase preto
  // não ganha cor que não tinha.
  const com = (l: number) => deLch(l, C * Math.min(1, l / Math.max(L, 1e-6)), h);

  let claro = original;
  for (let l = L; !passa(claro, 'claro') && l > 0; l -= 0.5) claro = com(l - 0.5);
  for (let l = lab(claro)[0]; !passaNoEscuro(claro) && l < 100; l += 0.5) {
    const tentativa = com(l + 0.5);
    // Clarear até deixar de passar no claro seria trocar um defeito pelo
    // outro; não acontece (há folga entre os dois), e se acontecesse
    // ficava a cor que passa no claro.
    if (!passa(tentativa, 'claro')) break;
    claro = tentativa;
  }
  return { claro, escuro: noEscuro(claro) };
}

/**
 * A cor da linha para desenhar o PERCURSO sobre o fundo claro da página.
 *
 * NÃO É A DO DISTINTIVO. O `comContrasteSuficiente` garante o número POR CIMA
 * da cor, e um bege com o número escuro passa sem mudar — mas o mesmo bege
 * como fio, sobre o branco, dava 2,3:1. O traço tem a sua conta
 * (`tracoDaLinha`): 3:1 sobre os fundos claros, e a mistura do escuro também.
 * Sem cor, a da marca.
 */
export function corDoTraco(cor?: string | null): string {
  return traco(cor) ?? 'var(--marca)';
}
