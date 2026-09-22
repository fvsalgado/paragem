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

/** «os 7 ligados», ou «5 de 7 ligados — sem comboio e expresso». */
export function resumoDosModulos(desligados: readonly string[]): string {
  const total = MODULOS.length;
  const fora = MODULOS.filter((m) => desligados.includes(m));
  if (fora.length === 0) return `os ${total} ligados`;
  const nomes = fora.map((m) => nomeDoModulo(m).toLowerCase());
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${total - fora.length} de ${total} ligados — sem ${lista}`;
}
