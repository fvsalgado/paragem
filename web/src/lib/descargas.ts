import type { Descarga } from './formato.ts';

/**
 * O endereço de uma descarga NO DOMÍNIO DA REGIÃO: `/dados-abertos/<caminho>`
 * (P4-025). É o que a página de dados abertos liga, e o que se copia para um
 * portal de dados; a rota redireciona para o armazém, que serve os bytes.
 */
export const enderecoDaDescarga = (d: Pick<Descarga, 'caminho' | 'ficheiro'>): string =>
  `/dados-abertos/${(d.caminho ?? d.ficheiro)
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')}`;

/**
 * A descarga que um caminho pede — só se estiver no catálogo e existir.
 * Puro: os segmentos chegam como a rota os dá.
 */
export function ficheiroDaDescarga(
  catalogo: readonly Descarga[],
  segmentos: readonly string[],
): Descarga | null {
  if (segmentos.some((s) => s === '..' || s === '.' || s === '')) return null;
  const caminho = segmentos.map((s) => decodeURIComponent(s)).join('/');
  return catalogo.find((d) => (d.caminho ?? d.ficheiro) === caminho && d.existe !== false) ?? null;
}
