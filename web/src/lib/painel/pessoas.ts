import 'server-only';
import { ehEsquemaPorAplicar, ler } from './base';
import { ehPapel, type Papel } from './papeis';

/**
 * As pessoas do painel, lidas da base (migração 0009) pela chave de serviço.
 *
 * ANTES DE A MIGRAÇÃO CHEGAR, ISTO NÃO REBENTA. O sítio novo vai para o ar
 * antes de a 0009 ser aplicada à base de produção, e nesse intervalo as
 * tabelas não existem: uma pessoa procurada pelo email «não existe», e a lista
 * das pessoas diz que a migração está por aplicar. O dono entra na mesma —
 * a porta dele não passa por aqui —, e é por isso que ninguém fica trancado
 * fora no dia em que isto entra em produção.
 *
 * Qualquer OUTRA falha rebenta, como nas outras leituras do painel
 * (`consultas.ts`): «não consegui ler» não se disfarça de «não há ninguém».
 */

export interface Pessoa {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
  ativada_em: string | null;
  desativada_em: string | null;
  criada_em: string;
  criada_por: string;
  ultimo_acesso: string | null;
}

export interface PapelNaBase {
  pessoa_id: string;
  region_id: string;
  papel: string;
}

export interface ConviteNaBase {
  pessoa_id: string;
  criado_em: string;
  expira_em: string;
  usado_em: string | null;
}

/** «Nome · email» — o que a auditoria escreve, e o cabeçalho do painel mostra. */
export function actorDe(p: Pick<Pessoa, 'nome' | 'email'>): string {
  return `${p.nome} · ${p.email}`;
}

async function oDaBase<T>(ler_: () => Promise<T>, seFaltar: T): Promise<T> {
  try {
    return await ler_();
  } catch (erro) {
    if (ehEsquemaPorAplicar(erro)) return seFaltar;
    throw erro;
  }
}

/** A pessoa com este email, ou `null` — também quando as tabelas ainda não existem. */
export async function pessoaPorEmail(email: string): Promise<Pessoa | null> {
  const linhas = await oDaBase(
    () =>
      ler<Pessoa>(
        'admin_pessoas',
        `select=*&email=eq.${encodeURIComponent(email.trim().toLowerCase())}&limit=1`,
      ),
    [] as Pessoa[],
  );
  return linhas[0] ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function pessoaPorId(id: string): Promise<Pessoa | null> {
  if (!UUID.test(id)) return null;
  const linhas = await oDaBase(
    () => ler<Pessoa>('admin_pessoas', `select=*&id=eq.${id}&limit=1`),
    [] as Pessoa[],
  );
  return linhas[0] ?? null;
}

/** Os papéis de uma pessoa: região → papel. */
export async function papeisDe(id: string): Promise<Record<string, Papel>> {
  if (!UUID.test(id)) return {};
  const linhas = await oDaBase(
    () => ler<PapelNaBase>('admin_papeis', `select=*&pessoa_id=eq.${id}`),
    [] as PapelNaBase[],
  );
  const papeis: Record<string, Papel> = {};
  for (const l of linhas) if (ehPapel(l.papel)) papeis[l.region_id] = l.papel;
  return papeis;
}

export type EstadoDaPessoa = 'convidada' | 'ativa' | 'desativada';

export function estadoDe(p: Pick<Pessoa, 'desativada_em' | 'senha_hash'>): EstadoDaPessoa {
  if (p.desativada_em) return 'desativada';
  return p.senha_hash ? 'ativa' : 'convidada';
}

export interface PessoaNaLista extends Omit<Pessoa, 'senha_hash'> {
  estado: EstadoDaPessoa;
  papeis: Record<string, Papel>;
  /** Até quando vale a ligação por usar, se houver uma. */
  ligacaoAte: string | null;
}

/**
 * Todas as pessoas, com os papéis e a ligação por usar — `null` quando a
 * migração 0009 ainda não está na base.
 *
 * O hash da palavra-passe NÃO sai daqui: a lista não precisa dele, e o que a
 * página não tem não pode mostrar por engano.
 */
export async function listarPessoas(): Promise<PessoaNaLista[] | null> {
  try {
    const [pessoas, papeis, convites] = await Promise.all([
      ler<Pessoa>('admin_pessoas', 'select=*&order=desativada_em.desc.nullsfirst,nome.asc'),
      ler<PapelNaBase>('admin_papeis', 'select=*'),
      ler<ConviteNaBase>(
        'admin_convites',
        `select=pessoa_id,criado_em,expira_em,usado_em&usado_em=is.null&expira_em=gt.${encodeURIComponent(new Date().toISOString())}`,
      ),
    ]);
    return pessoas.map(({ senha_hash, ...p }) => ({
      ...p,
      estado: estadoDe({ desativada_em: p.desativada_em, senha_hash }),
      papeis: Object.fromEntries(
        papeis
          .filter((x) => x.pessoa_id === p.id && ehPapel(x.papel))
          .map((x) => [x.region_id, x.papel as Papel]),
      ),
      ligacaoAte: convites.find((c) => c.pessoa_id === p.id)?.expira_em ?? null,
    }));
  } catch (erro) {
    if (ehEsquemaPorAplicar(erro)) return null;
    throw erro;
  }
}

/** As pessoas com papel numa região — para a ficha dela. `[]` sem a 0009. */
export async function pessoasDaRegiao(
  regiao: string,
): Promise<{ id: string; nome: string; email: string; papel: Papel; ativa: boolean }[]> {
  const todas = await listarPessoas();
  if (!todas) return [];
  return todas
    .filter((p) => p.papeis[regiao])
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      papel: p.papeis[regiao] as Papel,
      ativa: p.estado !== 'desativada',
    }));
}

export type LeituraDaLigacao =
  | { estado: 'valida'; nome: string; email: string; ate: string; jaAtivada: boolean }
  | { estado: 'invalida' | 'usada' | 'expirada' | 'desativada' | 'por-aplicar' };

/**
 * O que uma ligação de ativação vale, ANTES de a pessoa escrever a
 * palavra-passe: escrever duas vezes uma palavra-passe de doze caracteres
 * para depois saber que a ligação expirou é a maneira mais irritante de o
 * saber. A decisão final é da base, ao ativar (`ativar_com_convite`).
 */
export async function lerLigacao(tokenHash: string): Promise<LeituraDaLigacao> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return { estado: 'invalida' };
  try {
    const [convite] = await ler<ConviteNaBase>(
      'admin_convites',
      `select=pessoa_id,criado_em,expira_em,usado_em&token_hash=eq.${tokenHash}&limit=1`,
    );
    if (!convite) return { estado: 'invalida' };
    if (convite.usado_em) return { estado: 'usada' };
    if (Date.parse(convite.expira_em) < Date.now()) return { estado: 'expirada' };
    const pessoa = await pessoaPorId(convite.pessoa_id);
    if (!pessoa) return { estado: 'invalida' };
    if (pessoa.desativada_em) return { estado: 'desativada' };
    return {
      estado: 'valida',
      nome: pessoa.nome,
      email: pessoa.email,
      ate: convite.expira_em,
      jaAtivada: Boolean(pessoa.ativada_em),
    };
  } catch (erro) {
    if (ehEsquemaPorAplicar(erro)) return { estado: 'por-aplicar' };
    throw erro;
  }
}
