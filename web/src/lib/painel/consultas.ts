import 'server-only';
import { ler } from './base';

/**
 * As leituras do painel, todas pela chave de serviço e todas frescas.
 *
 * Nenhuma devolve `[]` por causa de um erro: uma leitura que não corre
 * rebenta e cai na rede do `app/admin/error.tsx`. Um painel que diz «não há
 * nada» quando o que aconteceu foi «não consegui ler» é um painel em que não
 * se pode acreditar quando diz «não há nada».
 */

export interface RegiaoNaBase {
  id: string;
  name: string;
  article: string;
  domain: string;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AliasNaBase {
  domain: string;
  region_id: string;
  created_at: string;
}

export interface ModuloNaBase {
  region_id: string;
  id: string;
  is_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface LicencaNaBase {
  id: string;
  region_id: string;
  starts_on: string;
  ends_on: string | null;
  kind: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface AcaoNaBase {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

/** Todas — as desligadas também. O público só vê as ligadas; o painel vê tudo. */
export async function listarRegioes(): Promise<RegiaoNaBase[]> {
  return ler<RegiaoNaBase>('regions', 'select=*&order=sort_order.asc,id.asc');
}

export async function listarAliases(): Promise<AliasNaBase[]> {
  return ler<AliasNaBase>('region_domain_aliases', 'select=*&order=domain.asc');
}

/** Só as linhas que existem: sem linha, o módulo está ligado. */
export async function listarModulos(): Promise<ModuloNaBase[]> {
  return ler<ModuloNaBase>('modulos', 'select=*&order=region_id.asc,id.asc');
}

/** Todas, histórico incluído, da mais recente para a mais antiga. */
export async function listarLicencas(): Promise<LicencaNaBase[]> {
  return ler<LicencaNaBase>('region_licenses', 'select=*&order=starts_on.desc,created_at.desc');
}

export interface RecorteDaAuditoria {
  actor?: string;
  action?: string;
  entityType?: string;
  /** `AAAA-MM` */
  mes?: string;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** O primeiro dia do mês seguinte, para o intervalo ser meio-aberto. */
function mesSeguinte(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number);
  return numero === 12
    ? `${(ano ?? 0) + 1}-01-01`
    : `${ano}-${String((numero ?? 0) + 1).padStart(2, '0')}-01`;
}

export async function listarAcoes(
  pagina: number,
  porPagina: number,
  recorte: RecorteDaAuditoria = {},
): Promise<AcaoNaBase[]> {
  const partes = ['select=*', 'order=id.desc', `limit=${porPagina}`];
  partes.push(`offset=${Math.max(0, pagina - 1) * porPagina}`);
  if (recorte.actor) partes.push(`actor=eq.${encodeURIComponent(recorte.actor)}`);
  if (recorte.action) partes.push(`action=eq.${encodeURIComponent(recorte.action)}`);
  if (recorte.entityType) partes.push(`entity_type=eq.${encodeURIComponent(recorte.entityType)}`);
  if (recorte.mes && MES.test(recorte.mes)) {
    partes.push(`created_at=gte.${recorte.mes}-01`);
    partes.push(`created_at=lt.${mesSeguinte(recorte.mes)}`);
  }
  return ler<AcaoNaBase>('admin_actions', partes.join('&'));
}

/** As últimas ações sobre uma região — a própria e os módulos dela. */
export async function acoesDaRegiao(regiao: string, quantas: number): Promise<AcaoNaBase[]> {
  const id = encodeURIComponent(regiao);
  return ler<AcaoNaBase>(
    'admin_actions',
    `select=*&or=(entity_id.eq.${id},entity_id.like.${id}/*)&order=id.desc&limit=${quantas}`,
  );
}

export interface OpcoesDaAuditoria {
  actors: string[];
  actions: string[];
  entityTypes: string[];
}

/**
 * As opções dos recortes, lidas do que a base tem mesmo. O PostgREST não faz
 * `distinct`; lê-se o que há (as três colunas das últimas mil linhas) e
 * conta-se aqui — a tabela é pequena por natureza.
 */
export async function opcoesDaAuditoria(): Promise<OpcoesDaAuditoria> {
  const linhas = await ler<Pick<AcaoNaBase, 'actor' | 'action' | 'entity_type'>>(
    'admin_actions',
    'select=actor,action,entity_type&order=id.desc&limit=1000',
  );
  const unicos = (chave: 'actor' | 'action' | 'entity_type') =>
    [...new Set(linhas.map((l) => l[chave]))].sort((a, b) => a.localeCompare(b, 'pt'));
  return { actors: unicos('actor'), actions: unicos('action'), entityTypes: unicos('entity_type') };
}
