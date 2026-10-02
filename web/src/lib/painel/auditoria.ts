import { doCampoLocal } from '../fuso.ts';

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
  'aviso.create': 'escreveu um aviso',
  'aviso.update': 'corrigiu um aviso',
  // Publicar e retirar têm nome próprio de propósito: quem pergunta «porque é
  // que este aviso esteve no ar entre as 7h e as 9h» precisa de os distinguir
  // de uma correção de gralha.
  'aviso.publish': 'publicou um aviso',
  'aviso.unpublish': 'retirou um aviso',
  'aviso.delete': 'apagou um aviso',
  // As pessoas do painel (0009). A ativação e a palavra-passe nova ficam em
  // nome da própria pessoa: foi ela que abriu a ligação.
  'pessoa.create': 'convidou uma pessoa',
  'pessoa.papel': 'mudou o papel de uma pessoa',
  'pessoa.disable': 'desativou uma pessoa',
  'pessoa.enable': 'voltou a ativar uma pessoa',
  'pessoa.convite': 'gerou uma ligação de ativação',
  'pessoa.activate': 'ativou a conta',
  'pessoa.password': 'escolheu uma palavra-passe nova',
  'pessoa.acesso': 'entrou no painel',
};

export function nomeDaAcao(action: string): string {
  return NOME_DAS_ACOES[action] ?? action;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** O primeiro dia do mês seguinte, para o intervalo ser meio-aberto. */
function mesSeguinte(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number);
  return numero === 12
    ? `${(ano ?? 0) + 1}-01-01`
    : `${ano}-${String((numero ?? 0) + 1).padStart(2, '0')}-01`;
}

/**
 * O mês NA HORA DE PORTUGAL, e não em UTC (P4-020). «Outubro» começa à
 * meia-noite de Lisboa do dia 1 — que no verão é às 23h de 30 de setembro em
 * UTC. Contado em UTC, o que se fez na primeira hora de cada mês ia parar ao
 * mês anterior, e o recorte que se manda a alguém dizia uma coisa e mostrava
 * outra.
 */
export function limitesDoMes(mes: string): { desde: string; ate: string } | null {
  if (!MES.test(mes)) return null;
  const desde = doCampoLocal(`${mes}-01T00:00`);
  const ate = doCampoLocal(`${mesSeguinte(mes)}T00:00`);
  return desde && ate ? { desde, ate } : null;
}
