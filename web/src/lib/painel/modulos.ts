import { NOME_DOS_MODOS } from '../formato.ts';

/**
 * Os módulos que o painel liga e desliga: os sete modos do produto, pela
 * ordem da grelha (CLAUDE.md §3). QUE MÓDULOS EXISTEM É DO CÓDIGO — esta
 * lista e a restrição da tabela `modulos` dizem os mesmos sete; se estão
 * ligados é da base; que modos cada região TEM é o `modos:` do `regiao.yaml`
 * dela, que o painel lê do armazém para não oferecer o interruptor de um modo
 * que a região nem declara.
 */
export const MODULOS = [
  'autocarro',
  'a-pedido',
  'comboio',
  'urbano-municipal',
  'bicicleta',
  'expresso',
  'taxi',
] as const;

export type Modulo = (typeof MODULOS)[number];

export function ehModulo(x: string): x is Modulo {
  return (MODULOS as readonly string[]).includes(x);
}

export function nomeDoModulo(id: string): string {
  return NOME_DOS_MODOS[id] ?? id;
}

/**
 * «nenhum desligado», ou «desligados: comboio e expresso».
 *
 * Dizia «os 7 ligados» — numa região com três modos, que nunca teve os
 * outros quatro para ligar (P4-022). Sem ler a declaração de cada região, a
 * lista das regiões só sabe o que o painel DESLIGOU, e é isso que diz.
 */
export function resumoDosModulos(desligados: readonly string[]): string {
  const fora = MODULOS.filter((m) => desligados.includes(m));
  if (fora.length === 0) return 'nenhum desligado';
  const nomes = fora.map((m) => nomeDoModulo(m).toLowerCase());
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${fora.length === 1 ? 'desligado' : 'desligados'}: ${lista}`;
}
