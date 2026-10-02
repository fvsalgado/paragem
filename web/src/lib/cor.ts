/**
 * As contas de cor da WCAG 2.1, num sítio só — as do distintivo de cada linha
 * e as da faixa da marca de cada região (`marca.ts`). São as mesmas contas que
 * o pipeline faz ao validar a cor de uma região (`pipeline/src/paragem/marca.py`):
 * o sítio refá-las para não pintar texto ilegível com um `regiao.json` velho ou
 * estragado.
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
