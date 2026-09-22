/**
 * O antes e o depois de uma ação, campo a campo.
 *
 * A base guarda `before` e `after` como JSON (`admin_actions`); isto reduz os
 * dois a linhas «campo: antes → depois», só com o que mudou. Puro, para se
 * testar sem base.
 */

export interface Mudanca {
  campo: string;
  antes: string | null;
  depois: string | null;
}

function comoTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor;
  return JSON.stringify(valor);
}

function comoObjeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

export function diferenca(before: unknown, after: unknown): Mudanca[] {
  const antes = comoObjeto(before);
  const depois = comoObjeto(after);
  if (!antes && !depois) {
    const a = comoTexto(before);
    const d = comoTexto(after);
    return a === d ? [] : [{ campo: 'valor', antes: a, depois: d }];
  }
  const campos = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])].sort();
  const linhas: Mudanca[] = [];
  for (const campo of campos) {
    const a = comoTexto(antes?.[campo]);
    const d = comoTexto(depois?.[campo]);
    if (a !== d) linhas.push({ campo, antes: a, depois: d });
  }
  return linhas;
}

/** O que cada ação quer dizer, para quem lê a auditoria sem saber os nomes. */
export const NOME_DAS_ACOES: Record<string, string> = {
  'region.create': 'criou a região',
  'region.enable': 'ligou a região',
  'region.disable': 'desligou a região',
  'region.domain': 'mudou o domínio',
  'region.alias_add': 'acrescentou um alias',
  'region.alias_remove': 'retirou um alias',
  'region.license_add': 'registou uma licença',
  'module.enable': 'ligou um módulo',
  'module.disable': 'desligou um módulo',
};

export function nomeDaAcao(action: string): string {
  return NOME_DAS_ACOES[action] ?? action;
}
