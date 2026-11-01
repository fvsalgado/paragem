/**
 * O que a página de um modo decide antes de desenhar — funções puras, que se
 * testam sem dados nem servidor (`tests/pagina-do-modo.test.mts`).
 */
import type { HorarioDeModo, PercursoDeModo } from './formato.ts';
import { simples } from './letras.ts';

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
