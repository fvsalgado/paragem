/**
 * Quem pode fazer o quê no painel — puro, para se testar frase a frase.
 *
 * TRÊS PAPÉIS, e são os do Coreto (o mesmo desenho nos dois painéis da casa):
 *
 *   · o DONO — quem tem a palavra-passe do ambiente — pode tudo: regiões,
 *     domínios e alias, licenças, pessoas, a auditoria inteira;
 *   · o GESTOR de uma região tem a ficha dela: os módulos, os avisos, os
 *     contactos que a declaração de acessibilidade e a privacidade mostram, o
 *     relatório da procura e o rasto da região;
 *   · o EDITOR de uma região escreve, publica e retira os avisos dela, e mais
 *     nada.
 *
 * Domínios, alias, licenças, criar e desligar regiões e gerir pessoas ficam
 * com o dono: são decisões comerciais e de infraestrutura, e uma pessoa de uma
 * autoridade de transportes não tem de as poder tomar sobre o sítio de outra.
 *
 * A REGRA QUE ISTO GUARDA: uma pessoa vê e mexe SÓ nas regiões onde tem papel.
 * As páginas filtram as listas por aqui, e cada ação volta a perguntar antes
 * de escrever — a página não é a guarda, porque uma ação de servidor recebe o
 * que lhe mandarem.
 */

export type Papel = 'gestor' | 'editor';

export const PAPEIS: readonly Papel[] = ['gestor', 'editor'];

export function ehPapel(x: unknown): x is Papel {
  return x === 'gestor' || x === 'editor';
}

/** O que o painel sabe de quem está dentro, para decidir. */
export interface Acesso {
  dono: boolean;
  /** região → papel. Vazio para o dono, que não precisa de nenhum. */
  papeis: Readonly<Record<string, Papel>>;
}

/** Quanto vale cada papel: o gestor faz tudo o que o editor faz. */
const PESO: Record<Papel, number> = { editor: 1, gestor: 2 };

/** Se quem está dentro tem, nesta região, pelo menos este papel. */
export function pode(acesso: Acesso, regiao: string, minimo: Papel): boolean {
  if (acesso.dono) return true;
  const papel = acesso.papeis[regiao];
  return papel !== undefined && PESO[papel] >= PESO[minimo];
}

/**
 * As regiões que esta pessoa vê, filtradas de uma lista; o dono vê todas.
 * Com `minimo`, só as em que tem pelo menos esse papel.
 */
export function regioesVisiveis<T extends { id: string }>(
  acesso: Acesso,
  regioes: readonly T[],
  minimo: Papel = 'editor',
): T[] {
  return regioes.filter((r) => pode(acesso, r.id, minimo));
}

/** O nome do papel numa frase: «gestor», «editor». */
export function nomeDoPapel(papel: Papel): string {
  return papel === 'gestor' ? 'gestor' : 'editor';
}

/** O que o papel deixa fazer, dito a quem o vai atribuir. */
export function oQueOPapelFaz(papel: Papel): string {
  return papel === 'gestor'
    ? 'a ficha da região: modos, avisos, contactos e o relatório das procuras'
    : 'os avisos da região — escrever, publicar e retirar';
}

/**
 * Para onde vai quem entra, conforme o que tem.
 *
 * O dono, para a lista das regiões. Uma pessoa com UMA região vai direta ao
 * que lá faz — a ficha, se é gestora; os avisos, se é editora: a lista de uma
 * região só era um clique a mais, todos os dias. Com várias, a lista delas.
 */
export function inicioDe(acesso: Acesso): string {
  if (acesso.dono) return '/admin/';
  const regioes = Object.keys(acesso.papeis);
  if (regioes.length !== 1) return '/admin/';
  const [regiao] = regioes as [string];
  const base = `/admin/regioes/${encodeURIComponent(regiao)}/`;
  return acesso.papeis[regiao] === 'gestor' ? base : `${base}avisos/`;
}
