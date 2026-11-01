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
 * A COR DE UMA LINHA PARA SE DESENHAR SOBRE O BRANCO: a mesma, escurecida até
 * ter os 3:1 de um traço. `null` quando não há cor — ou quando é branco, que
 * no GTFS quer dizer «sem cor» (o comboio nacional declara `FFFFFF` em quase
 * todas as linhas).
 *
 * O traço do percurso no mapa vai sobre um contorno branco, e o fio da linha
 * do tempo sobre o branco da folha. Um `route_color` claro (há linhas a
 * `#CA9E67`, que dá 2,27:1) desaparecia nos dois; escurecido, continua a ser
 * a cor da linha.
 */
export function traco(cor?: string | null, fundo = '#ffffff'): string | null {
  const original = normalizar(cor);
  if (!original || original === '#ffffff') return null;
  const rgb = [1, 3, 5].map((i) => parseInt(original.slice(i, i + 2), 16));
  for (let fator = 1; fator >= 0; fator -= 0.05) {
    const tentativa =
      '#' +
      rgb
        .map((v) =>
          Math.round(v * fator)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    if (contraste(tentativa, fundo) >= MINIMO_DE_UM_TRACO) return tentativa;
  }
  return '#000000';
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
