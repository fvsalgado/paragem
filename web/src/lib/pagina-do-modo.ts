/**
 * O que a página de um modo decide antes de desenhar — funções puras, que se
 * testam sem dados nem servidor (`tests/pagina-do-modo.test.mts`).
 */
import type { ConteudoDe, HorarioDeModo, ModoDetalhe, PercursoDeModo } from './formato.ts';
import { simples } from './letras.ts';
import { metrosEntre } from './lista-de-paragens.ts';

/**
 * OS PERCURSOS QUE AINDA NÃO TÊM HORÁRIO NA PÁGINA.
 *
 * «As linhas que se conhecem» listava o traçado do OpenStreetMap das linhas
 * que já tinham, mais acima, secção inteira com o horário do cartaz — e com o
 * nome colado à rede («Linha VerdeTV»). Uma linha com horário já está na
 * página; o percurso dela não acrescenta nada a quem lê (auditoria de
 * 1/11/2026). É a mesma linha quando o horário se chama como o percurso, com
 * ou sem a rede à frente («TV — Linha Verde» e «Linha Verde», da rede TV).
 */
export function percursosSemHorario<
  P extends Pick<PercursoDeModo, 'nome'> & { rede?: string | null },
>(percursos: P[], horarios: Pick<HorarioDeModo, 'nome'>[]): P[] {
  const comHorario = new Set(horarios.map((h) => simples(h.nome)));
  return percursos.filter(
    (p) =>
      !comHorario.has(simples(p.nome)) &&
      !(p.rede && comHorario.has(simples(`${p.rede} — ${p.nome}`))),
  );
}

/**
 * AS REGRAS DE UM CARTAZ, separadas das NOTAS NUMERADAS.
 *
 * «(1) Realiza-se apenas no período escolar» é a legenda de uma marca que o
 * cartaz põe em algumas viagens — e a marca não passou para a tabela. Solta,
 * no meio das regras, lia-se como se valesse para a linha toda. A página diz
 * o que são antes de as mostrar.
 */
export function regrasENotas(regras: string[]): { regras: string[]; notas: string[] } {
  const nota = (r: string) => /^\(\d+\)/.test(r.trim());
  return { regras: regras.filter((r) => !nota(r)), notas: regras.filter(nota) };
}

/**
 * QUEM GERE, PELO TAMANHO DO QUE GERE (#159). A ordem era a dos dados, e a
 * frase abria com o sistema de uma câmara de dez estações e acabava na
 * autoridade que gere sessenta e sete. Conta-se o que cada um gere na página
 * — estações, linhas com horário, pontos —, o maior à frente; em empate, a
 * ordem de antes.
 */
export function quemGerePorOrdem(
  m: Pick<ModoDetalhe, 'gerido_por' | 'sistemas' | 'horarios' | 'pontos'>,
): string[] {
  const peso = new Map<string, number>();
  const somar = (quem: string | null | undefined, n: number) => {
    if (quem) peso.set(quem, (peso.get(quem) ?? 0) + n);
  };
  for (const s of m.sistemas ?? []) somar(s.operador, s.estacoes.length);
  for (const h of m.horarios ?? []) somar(h.operador, 1);
  for (const p of m.pontos ?? []) somar(p.operador, 1);
  return m.gerido_por
    .map((quem, i) => ({ quem, i }))
    .sort((a, b) => (peso.get(b.quem) ?? 0) - (peso.get(a.quem) ?? 0) || a.i - b.i)
    .map((x) => x.quem);
}

/** Duas praças a menos disto uma da outra são a mesma, mapeada duas vezes. */
export const RAIO_DA_MESMA_PRACA = 50;

/**
 * UM NOME QUE SÓ DIZ O QUE É não é um nome (#189): «Táxis», «Praça de Táxis»,
 * «Praça Táxis». Lia-se como o nome de uma praça ao lado das outras, que se
 * chamam «Praça de táxis» porque não têm nenhum — e eram a mesma coisa.
 */
export function nomeQueSoDizOQueE(nome: string | null | undefined): boolean {
  if (!nome) return true;
  return /^(praca( de)? )?taxis?$/.test(simples(nome).replace(/\s+/g, ' ').trim());
}

/**
 * OS PONTOS DE UM MODO, sem os repetidos (#189). No mapa de onde vêm, a mesma
 * praça de táxis pode estar duas vezes, a dez metros uma da outra: a lista
 * dizia duas praças junto à mesma paragem, a 70 e a 60 m, e era uma. Junta-se
 * o que fica a menos de `raio` metros, e fica o primeiro — com o nome e o
 * telefone de qualquer um deles, se algum os tiver. Um nome que só diz o que
 * é sai, e a página diz o que é.
 */
export function juntarPontos<
  T extends {
    lat: number;
    lon: number;
    nome: string | null;
    telefone?: string | null;
    operador?: string | null;
  },
>(pontos: T[], raio = RAIO_DA_MESMA_PRACA): T[] {
  const saida: T[] = [];
  for (const p of pontos) {
    const proprio = nomeQueSoDizOQueE(p.nome) ? null : p.nome;
    const igual = saida.find((q) => metrosEntre(p, q) <= raio);
    if (!igual) {
      saida.push({ ...p, nome: proprio });
      continue;
    }
    if (!igual.nome && proprio) igual.nome = proprio;
    if (!igual.telefone && p.telefone) igual.telefone = p.telefone;
    if (!igual.operador && p.operador) igual.operador = p.operador;
  }
  return saida;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * QUANDO UM CARTAZ PEDE AVISO À CABEÇA (#191): quando diz que vale desde há
 * mais de `meses`, ou quando não diz desde quando vale. Um horário de 2021
 * mostrado como os outros, com a data em letra pequena no fim, lia-se como o
 * de hoje — e pode já não ser. Devolve o mês e o ano por extenso («fevereiro
 * de 2021»), `null` no `desde` quando o cartaz não tem data nenhuma, e `null`
 * quando não há aviso a dar: o cartaz é recente, ou diz de quando é por
 * palavras (essas vão por baixo, como sempre).
 */
export function avisoDoCartaz(
  c: ConteudoDe | null | undefined,
  hoje: Date,
  meses = 12,
): { desde: string | null } | null {
  if (!c) return null;
  const d = c.em_vigor_desde;
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [ano, mes] = d.split('-').map(Number);
    const passados = (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes);
    return passados > meses ? { desde: `${MESES[mes - 1]} de ${ano}` } : null;
  }
  if (c.texto) return null;
  return { desde: null };
}

/**
 * A regra do cartaz que diz o mesmo que o aviso da data: «horários em vigor a
 * partir de …». Com o aviso à cabeça, repeti-la nas regras era dizer a data
 * duas vezes.
 */
export const regraDaData = (regra: string): boolean =>
  /^hor[aá]rios? em vigor\b/i.test(regra.trim());
