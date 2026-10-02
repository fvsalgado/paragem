import { CAUSAS, EFEITOS, GRAVIDADES } from '../avisos.ts';
import { doCampoLocal, porExtenso } from '../fuso.ts';
import { NOME_DOS_MODOS } from '../formato.ts';

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

// --- a auditoria em palavras de gente (P4-020) --------------------------------
//
// Mostrava `is_enabled: true → false`, «aviso 9b549a4c-b769-…», «region prova» e
// um recorte «module / region / aviso», metade em inglês. Quem tem de responder
// a uma reclamação — «porque esteve este aviso no ar entre as 7h e as 9h?» —
// procura pelo título do aviso e pela hora de Portugal, e não por um UUID.

/** Os campos, como quem lê os chama. Os que não estão aqui mostram-se como vêm. */
const CAMPOS: Record<string, string> = {
  is_enabled: 'ligado',
  domain: 'endereço',
  old_domain_kept_as_alias: 'o antigo fica a levar ao novo',
  name: 'nome',
  article: 'artigo',
  sort_order: 'posição na lista',
  license_id: 'licença',
  starts_on: 'início',
  ends_on: 'fim',
  kind: 'tipo',
  titulo: 'título',
  texto: 'texto',
  gravidade: 'gravidade',
  causa: 'causa',
  efeito: 'o que se passa',
  inicio: 'começa',
  fim: 'acaba',
  linhas: 'linhas',
  paragens: 'paragens',
  modos: 'modos',
  url: 'mais informação',
  publicado: 'publicado',
  email: 'email',
  nome: 'nome',
  papel: 'papel',
  ativa: 'pode entrar',
  ativada: 'conta ativada',
  expira_em: 'a ligação vale até',
};

/**
 * O que não se mostra numa diferença: o identificador, as horas de gravação e
 * quem gravou — que são a própria linha da auditoria a repetir-se — e a região
 * de um aviso, que está na coluna «Sobre».
 */
const ESCONDIDOS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'region_id']);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Um valor como se lê: «sim», «não», a hora de Portugal, o nome do efeito. */
function legivel(campo: string, valor: string | null): string | null {
  if (valor === null) return null;
  if (valor === 'true') return 'sim';
  if (valor === 'false') return 'não';
  if (campo === 'gravidade') return GRAVIDADES[valor as keyof typeof GRAVIDADES] ?? valor;
  if (campo === 'causa') return CAUSAS[valor as keyof typeof CAUSAS] ?? valor;
  if (campo === 'efeito') return EFEITOS[valor as keyof typeof EFEITOS] ?? valor;
  if (ISO.test(valor)) return porExtenso(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/');
  if (valor.startsWith('[')) {
    try {
      const lista = JSON.parse(valor) as unknown[];
      if (campo === 'modos')
        return lista.map((m) => NOME_DOS_MODOS[String(m)] ?? String(m)).join(', ') || 'nenhum';
      return lista.map(String).join(', ') || 'nenhuma';
    } catch {
      return valor;
    }
  }
  return valor;
}

/** A diferença, já em palavras: só o que interessa, com os nomes e os valores de gente. */
export function diferencaLegivel(before: unknown, after: unknown): Mudanca[] {
  return diferenca(before, after)
    .filter((m) => !ESCONDIDOS.has(m.campo))
    .map((m) => ({
      campo: CAMPOS[m.campo] ?? m.campo,
      antes: legivel(m.campo, m.antes),
      depois: legivel(m.campo, m.depois),
    }));
}

/**
 * Quem fez, como se diz. As pessoas já vêm por extenso («Ana Silva ·
 * ana@…»); o resto são autores que não são pessoas.
 */
export function quemFez(actor: string): string {
  if (actor === 'gestor') return 'a palavra-passe única (antes das contas por pessoa)';
  if (actor === 'dono') return 'o dono';
  if (actor.startsWith('dono · ')) return `o dono (${actor.slice('dono · '.length)})`;
  if (actor.startsWith('migracao-')) return 'a instalação';
  return actor;
}

/** Os tipos de coisa de que a auditoria fala, como se diz. */
export const NOME_DOS_TIPOS: Record<string, string> = {
  region: 'Regiões',
  module: 'Modos de transporte',
  aviso: 'Avisos',
  pessoa: 'Pessoas',
};

/** O que se sabe para dar nome às coisas de que a auditoria fala. */
export interface Nomes {
  regioes: ReadonlyMap<string, string>;
  pessoas: ReadonlyMap<string, string>;
}

/**
 * «Sobre» o quê, por extenso: o nome da região, «Táxi (Serra da Pedra Alta)»,
 * o título do aviso, o nome da pessoa — e o identificador só quando não há
 * outra coisa a dizer.
 */
export function sobreQue(
  acao: { entity_type: string; entity_id: string; before: unknown; after: unknown },
  nomes: Nomes,
): { texto: string; regiao: string | null } {
  const regiao = (id: string) => nomes.regioes.get(id) ?? id;
  switch (acao.entity_type) {
    case 'region':
      return { texto: regiao(acao.entity_id), regiao: acao.entity_id };
    case 'module': {
      const [r = '', m = ''] = acao.entity_id.split('/');
      return { texto: `${NOME_DOS_MODOS[m] ?? m} (${regiao(r)})`, regiao: r };
    }
    case 'aviso': {
      const linha = comoObjeto(acao.after) ?? comoObjeto(acao.before);
      const titulo = typeof linha?.titulo === 'string' ? linha.titulo : null;
      const r = typeof linha?.region_id === 'string' ? linha.region_id : null;
      return {
        texto: titulo ? `o aviso «${titulo}»${r ? ` (${regiao(r)})` : ''}` : 'um aviso',
        regiao: r,
      };
    }
    case 'pessoa':
      if (acao.entity_id === 'dono') return { texto: 'o dono', regiao: null };
      return { texto: nomes.pessoas.get(acao.entity_id) ?? 'uma pessoa', regiao: null };
    default:
      return { texto: acao.entity_id, regiao: null };
  }
}

/** O que cada ação quer dizer, para quem lê a auditoria sem saber os nomes. */
export const NOME_DAS_ACOES: Record<string, string> = {
  'region.create': 'criou a região',
  'region.enable': 'ligou a região',
  'region.disable': 'desligou a região',
  'region.domain': 'mudou o endereço principal',
  'region.alias_add': 'acrescentou um endereço que leva ao principal',
  'region.alias_remove': 'retirou um endereço que levava ao principal',
  'region.license_add': 'registou uma licença',
  'region.contactos': 'mudou os contactos da declaração e da privacidade',
  'module.enable': 'ligou um modo',
  'module.disable': 'desligou um modo',
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
