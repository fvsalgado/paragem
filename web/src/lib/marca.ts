/**
 * A MARCA DA REGIÃO, como o sítio a mostra: a faixa do cabeçalho, a
 * assinatura da folha do mapa e a do menu.
 *
 * O sítio de uma autoridade de transportes é dela, e não do fornecedor
 * (P4-008): a primeira coisa do cabeçalho passa a ser a rede — o logótipo,
 * quando a região o declara, e o nome —, e «Paragem.pt» vai para o rodapé,
 * discreto. A cor e o logótipo são dados da região (`cor:` e `logotipo:` no
 * `regiao.yaml`), validados no pipeline (`pipeline/src/paragem/marca.py`).
 *
 * AQUI MEDE-SE OUTRA VEZ, e não se confia no que veio escrito: um
 * `regiao.json` de antes disto não traz marca nenhuma, e um estragado podia
 * trazer uma tinta ilegível. Nos dois casos fica a do §6 — o azul da marca do
 * produto com branco por cima —, que é o que uma região sem marca declarada
 * mostra de qualquer maneira.
 */
import { contraste, MINIMO, normalizar } from './cor.ts';
import type { Regiao } from './formato';

/** A cor da marca do §6 — a de quem não declara a sua. */
export const COR_DO_PRODUTO = '#0a5c7a';
/** As duas tintas possíveis por cima da faixa: o branco, e o texto do §6. */
const TINTAS = ['#ffffff', '#102c3f'];

export type Marca = {
  cor: string;
  tinta: string;
  /** O caminho do logótipo no armazém da região (`marca/logotipo-….svg`), ou `null`. */
  logotipo: string | null;
  /** Largura sobre altura do logótipo, para lhe guardar o lugar antes de ele chegar. */
  logotipoProporcao: number | null;
  /** Se a cor é da região, ou a do produto por omissão. */
  propria: boolean;
};

/** A tinta que se lê por cima desta cor — a que contrasta mais —, ou `null` se nenhuma chegar. */
export function tintaPara(cor: string): string | null {
  const [melhor] = TINTAS.map((t) => ({ t, c: contraste(cor, t) })).sort((a, b) => b.c - a.c);
  return melhor.c >= MINIMO ? melhor.t : null;
}

/** Só um caminho do armazém da própria região, com o nome que o pipeline lhe dá. */
const LOGOTIPO = /^marca\/logotipo-[0-9a-f]+\.(svg|png|webp)$/;

export function marcaDaRegiao(r: Pick<Regiao, 'marca'>): Marca {
  const m = r.marca;
  const logotipo = typeof m?.logotipo === 'string' && LOGOTIPO.test(m.logotipo) ? m.logotipo : null;
  const p = m?.logotipo_proporcao;
  const logotipoProporcao = typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  const cor = normalizar(m?.cor);
  const tinta = cor ? tintaPara(cor) : null;
  if (!cor || !tinta) {
    return { cor: COR_DO_PRODUTO, tinta: '#ffffff', logotipo, logotipoProporcao, propria: false };
  }
  return { cor, tinta, logotipo, logotipoProporcao, propria: m?.propria === true };
}

/**
 * Os dois nomes da assinatura: a REDE, que é a marca que quem viaja conhece
 * («Rede Ameno»), e por baixo dela o que é («Transportes das Terras do
 * Ameno»). Uma região que não declare rede assina só com a segunda.
 */
export function nomesDaAssinatura(r: Pick<Regiao, 'rede' | 'de'>): {
  principal: string;
  secundario: string | null;
} {
  const transportes = `Transportes ${r.de}`;
  const rede = r.rede?.nome?.trim();
  return rede
    ? { principal: rede, secundario: transportes }
    : { principal: transportes, secundario: null };
}
