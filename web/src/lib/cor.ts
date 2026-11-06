/**
 * As contas de cor, num sítio só: as da WCAG 2.1 — as do distintivo de cada
 * linha, e as que conferem os tons de cada região (`marca.ts`) — e as do
 * CIELAB, com que esses tons se tiram da cor dela.
 */

/** O mínimo da WCAG 2.1 AA para texto normal. */
export const MINIMO = 4.5;

/** `#rrggbb` em minúsculas, ou `null` se não for uma cor — `#4cc` também serve. */
export function normalizar(cor?: string | null): string | null {
  if (!cor) return null;
  let limpa = cor.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(limpa)) limpa = [...limpa].map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(limpa) ? `#${limpa}` : null;
}

/** Luminância relativa, como a WCAG a define. */
export function luminancia(hex: string): number {
  const c = hex.replace('#', '');
  const canais = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** O mínimo da WCAG 2.1 AA para o que não é texto: um traço, um ícone (1.4.11). */
export const MINIMO_DE_UM_TRACO = 3;

/**
 * OS FUNDOS DO TEMA ESCURO: o da página e o dos cartões (`global.css`). Estão
 * aqui porque a conta se faz no servidor, e o CSS só decide quando a aplica.
 */
const FUNDOS_ESCUROS = ['#0f1a20', '#16242c'] as const;

/**
 * UM DISTINTIVO QUE DESAPARECE NO TEMA ESCURO: a cor dele não chega aos 3:1 de
 * um objeto (WCAG 1.4.11) contra algum dos fundos escuros. Era uma linha
 * a `#1D1D1B` sobre a página `#0F1A20` — 1,0:1: o contorno sumia e ficava só o
 * número a flutuar, no título da linha, no planeador e no «A seguir». O CSS
 * dá-lhe um aro na cor da borda dos campos, só no tema escuro; no claro, a
 * mesma cor escura contrasta de sobra e não leva nada.
 */
export function somemNoEscuro(fundo: string): boolean {
  return FUNDOS_ESCUROS.some((f) => contraste(fundo, f) < MINIMO_DE_UM_TRACO);
}

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

// --- a luminosidade que o olho lê (CIELAB) --------------------------------------
//
// A luminância da WCAG diz se um texto se lê; não diz se duas cores se
// distinguem uma da outra em cinzento. Para isso conta a luminosidade L* do
// CIELAB, que sobe em degraus que o olho vê iguais. É com ela que se tiram os
// três tons do feixe de cada região (`marca.ts`), com os degraus do do produto.

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gama = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
const fInv = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
// O branco de referência D65.
const XN = 0.95047;
const ZN = 1.08883;

/** A cor em CIELAB: `[L*, a*, b*]`. */
export function lab(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => linear(parseInt(c.slice(i, i + 2), 16) / 255));
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = f(x / XN);
  const fy = f(y);
  const fz = f(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * A cor de luminosidade `L`, croma `C` e tom `h` (em radianos), em `#rrggbb`.
 * O croma baixa até a cor caber no sRGB: um tom claro e muito saturado não
 * existe num ecrã, e cortar os canais um a um mudava-lhe o tom.
 */
export function deLch(L: number, C: number, h: number): string {
  let croma = C;
  for (let i = 0; i < 80; i++) {
    const fy = (L + 16) / 116;
    const fx = fy + (croma * Math.cos(h)) / 500;
    const fz = fy - (croma * Math.sin(h)) / 200;
    const x = XN * fInv(fx);
    const y = fInv(fy);
    const z = ZN * fInv(fz);
    const rgb = [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.969266 * x + 1.8760108 * y + 0.041556 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4) || croma < 0.5) {
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
    croma *= 0.95;
  }
  return deLch(L, 0, h);
}

// --- o traço de uma linha, nos dois temas -----------------------------------

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
