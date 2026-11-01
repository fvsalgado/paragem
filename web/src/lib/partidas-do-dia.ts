/**
 * AS PARTIDAS DE UM DIA NUMA PARAGEM, numa lista só, pela hora.
 *
 * O horário da paragem vinha num quadro por tipo de dia — catorze no terminal
 * mais servido —, e para saber o que passa numa segunda-feira era preciso
 * abrir três e juntá-los de cabeça (auditoria de 1/11/2026, #14). Isto junta
 * os que valem nesse dia, com a MESMA tabela dos dias do «A seguir» e dos
 * quadros (`dias.ts`): as três respostas não se podem desencontrar.
 *
 * Nada aqui é novo: são as partidas dos quadros, filtradas pelo dia.
 */
import type { Calendario } from './dias.ts';
import { servicosNoDia } from './dias.ts';

/**
 * As partidas que andam num dia, pela hora — ou `null` quando o dia está fora
 * do período que os horários carregados cobrem: aí não se sabe, e «não há»
 * seria mentir.
 *
 * Uma partida sem `servico_id` anda todos os dias: é o caso dos feeds que não
 * declaram calendário, e recusá-la era escondê-la para sempre (a mesma regra
 * do `proximas`).
 */
export function partidasDoDia<T extends { hora: string; servico_id?: string }>(
  partidas: readonly T[],
  cal: Calendario,
  chave: string,
): T[] | null {
  const ativos = servicosNoDia(cal, chave);
  if (!ativos) return null;
  return partidasComServicos(partidas, ativos);
}

/** O mesmo, com os serviços do dia já sabidos — os do servidor, na primeira pintura. */
export function partidasComServicos<T extends { hora: string; servico_id?: string }>(
  partidas: readonly T[],
  ativos: ReadonlySet<string>,
): T[] {
  return partidas
    .filter((p) => !p.servico_id || ativos.has(p.servico_id))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

/**
 * O período de um serviço, pelo nome que o pipeline lhe dá: «Em tempo de
 * aulas · Dias úteis» → «Em tempo de aulas». Um nome sem as duas partes fica
 * inteiro.
 */
export function periodoDoServico(nome: string): string {
  const partes = nome.split(' · ');
  return partes.length > 1 ? partes[0] : nome;
}

/**
 * QUE PARTIDAS LEVAM UMA NOTA DO PERÍODO — «em tempo de aulas», «verão» —
 * na lista de um dia.
 *
 * A nota diz a quem lê que aquela partida depende do calendário escolar ou da
 * época, e que noutro dia da mesma semana pode não estar lá. Na lista de uma
 * segunda-feira, setenta partidas de «todo o ano» com a nota ao lado eram
 * ruído: o período mais comum DESSE dia não leva nota, e os outros levam. Não
 * se decide pelo nome — que é da região, e muda de uma para a outra —, mas
 * pela conta.
 *
 * Devolve, por serviço, o texto da nota (ou nada).
 */
export function notasDosPeriodos(
  doDia: readonly { servico_id?: string }[],
  nomes: Readonly<Record<string, string>>,
): Map<string, string> {
  const porPeriodo = new Map<string, number>();
  for (const p of doDia) {
    const nome = p.servico_id ? nomes[p.servico_id] : undefined;
    if (!nome) continue;
    const per = periodoDoServico(nome);
    porPeriodo.set(per, (porPeriodo.get(per) ?? 0) + 1);
  }
  const notas = new Map<string, string>();
  if (porPeriodo.size < 2) return notas;
  const [maisComum] = [...porPeriodo.entries()].sort((a, b) => b[1] - a[1])[0];
  for (const p of doDia) {
    const nome = p.servico_id ? nomes[p.servico_id] : undefined;
    if (!nome || !p.servico_id) continue;
    const per = periodoDoServico(nome);
    if (per !== maisComum) notas.set(p.servico_id, per);
  }
  return notas;
}
