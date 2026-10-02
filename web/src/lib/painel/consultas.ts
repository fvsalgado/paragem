import 'server-only';
import { limitesDoMes } from './auditoria';
import { chamar, ehEsquemaPorAplicar, ler } from './base';

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

/**
 * O rasto, uma página de cada vez.
 *
 * O DONO LÊ TUDO. Quem gere regiões lê o rasto delas e mais nada — pela função
 * `acoes_das_regioes` (0009), que sabe de que região é cada aviso mesmo nas
 * linhas que não o dizem (publicar, retirar), e que deixa de fora as licenças e
 * as pessoas, que são do dono. `regioes` nulo é o dono.
 */
export async function listarAcoes(
  pagina: number,
  porPagina: number,
  recorte: RecorteDaAuditoria = {},
  regioes: string[] | null = null,
): Promise<AcaoNaBase[]> {
  const mes = recorte.mes ? limitesDoMes(recorte.mes) : null;
  if (regioes !== null) {
    if (regioes.length === 0) return [];
    return chamar<AcaoNaBase[]>('acoes_das_regioes', {
      p_regioes: regioes,
      p_limite: porPagina,
      p_desvio: Math.max(0, pagina - 1) * porPagina,
      p_actor: recorte.actor ?? null,
      p_action: recorte.action ?? null,
      p_entity_type: recorte.entityType ?? null,
      p_desde: mes?.desde ?? null,
      p_ate: mes?.ate ?? null,
    });
  }
  const partes = ['select=*', 'order=id.desc', `limit=${porPagina}`];
  partes.push(`offset=${Math.max(0, pagina - 1) * porPagina}`);
  if (recorte.actor) partes.push(`actor=eq.${encodeURIComponent(recorte.actor)}`);
  if (recorte.action) partes.push(`action=eq.${encodeURIComponent(recorte.action)}`);
  if (recorte.entityType) partes.push(`entity_type=eq.${encodeURIComponent(recorte.entityType)}`);
  if (mes) {
    partes.push(`created_at=gte.${encodeURIComponent(mes.desde)}`);
    partes.push(`created_at=lt.${encodeURIComponent(mes.ate)}`);
  }
  return ler<AcaoNaBase>('admin_actions', partes.join('&'));
}

/**
 * As últimas ações sobre uma região — a própria, os módulos e os avisos dela.
 *
 * Pela função da 0009, que traz também os avisos; antes de ela chegar à base,
 * pelo filtro de antes, que só via a região e os módulos. As licenças só no
 * rasto que o dono vê.
 */
export async function acoesDaRegiao(
  regiao: string,
  quantas: number,
  comLicencas = false,
): Promise<AcaoNaBase[]> {
  try {
    return await chamar<AcaoNaBase[]>('acoes_das_regioes', {
      p_regioes: [regiao],
      p_limite: quantas,
      p_com_licencas: comLicencas,
    });
  } catch (erro) {
    if (!ehEsquemaPorAplicar(erro)) throw erro;
  }
  const id = encodeURIComponent(regiao);
  const linhas = await ler<AcaoNaBase>(
    'admin_actions',
    `select=*&or=(entity_id.eq.${id},entity_id.like.${id}/*)&order=id.desc&limit=${quantas}`,
  );
  return comLicencas ? linhas : linhas.filter((l) => l.action !== 'region.license_add');
}

export interface OpcoesDaAuditoria {
  actors: string[];
  actions: string[];
  entityTypes: string[];
}

/**
 * As opções dos recortes, lidas do que a base tem mesmo. O PostgREST não faz
 * `distinct`; lê-se o que há (as três colunas das últimas mil linhas) e
 * conta-se aqui — a tabela é pequena por natureza. Quem gere regiões só vê
 * as opções do rasto delas: a lista de «quem» não lhe mostra quem mexeu
 * noutros clientes.
 */
export async function opcoesDaAuditoria(
  regioes: string[] | null = null,
): Promise<OpcoesDaAuditoria> {
  const linhas =
    regioes === null
      ? await ler<Pick<AcaoNaBase, 'actor' | 'action' | 'entity_type'>>(
          'admin_actions',
          'select=actor,action,entity_type&order=id.desc&limit=1000',
        )
      : regioes.length === 0
        ? []
        : await chamar<AcaoNaBase[]>('acoes_das_regioes', {
            p_regioes: regioes,
            p_limite: 500,
          });
  const unicos = (chave: 'actor' | 'action' | 'entity_type') =>
    [...new Set(linhas.map((l) => l[chave]))].sort((a, b) => a.localeCompare(b, 'pt'));
  return { actors: unicos('actor'), actions: unicos('action'), entityTypes: unicos('entity_type') };
}
