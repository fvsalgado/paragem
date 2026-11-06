/**
 * As contas de cor da WCAG 2.1: as do distintivo de cada linha, e as que
 * conferem os tons de cada região (`marca.ts`).
 *
 * AS CONTAS MAIORES TÊM MÓDULO SEU, por causa do peso: este vai para o
 * navegador em todas as páginas que mostram um distintivo. O CIELAB, com que
 * se tiram os tons de cada região e se escurece um traço, está em `cielab.ts`;
 * o traço de uma linha, que só o mapa e o planeador desenham no navegador, em
 * `traco.ts`.
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
