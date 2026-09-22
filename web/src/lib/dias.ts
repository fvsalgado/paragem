/**
 * QUE SERVIÇOS ANDAM HOJE — e, por isso, que partidas se mostram.
 *
 * Um horário não é uma lista de horas: é uma lista de horas COM um dia. A
 * mesma carreira tem a partida das 19:30 nos dias úteis, aos sábados e aos
 * domingos, e no ficheiro isso são três registos com o mesmo aspeto. Mostrar
 * os três é dizer a quem está na paragem numa terça-feira que passam ali três
 * autocarros às 19:30. Passa um.
 *
 * Medido no terminal de uma cidade a 21/09, e foi assim que se descobriu:
 * três partidas às 19:30 na mesma linha — `V5-U`, `V5-S` e `V5-DF` — uma por
 * cima da outra, duas delas para o mesmo destino.
 *
 * **O ficheiro é o mesmo que o planeador usa.** Não é uma segunda cópia da
 * verdade: se a paragem e o planeador tivessem tabelas diferentes, podiam
 * discordar sobre o mesmo autocarro, e quem lê não teria como saber qual
 * estava certa.
 */
import { enderecoDosDados } from './dados-do-navegador.ts';

type Servicos = { servicos: string[]; datas: Record<string, number[]> };

const cache = new Map<string, Promise<Servicos | null>>();

function carregar(regiao: string): Promise<Servicos | null> {
  let p = cache.get(regiao);
  if (!p) {
    p = fetch(enderecoDosDados(regiao, 'servicos.json'))
      .then((r) => (r.ok ? (r.json() as Promise<Servicos>) : null))
      .catch(() => null);
    cache.set(regiao, p);
  }
  return p;
}

/** `AAAAMMDD` no fuso de quem lê. É a chave que a tabela usa. */
export function chaveDoDia(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`
  );
}

/**
 * Os serviços que correm num dia, ou `null` quando não se sabe.
 *
 * **`null` não é «nenhum».** Sem a tabela — ficheiro em falta, rede em baixo,
 * região sem grelha — quem chama tem de mostrar TUDO e não nada: uma folha
 * vazia por causa de um ficheiro que não chegou é pior do que uma folha com
 * três horas a mais. É a diferença entre não saber e saber que não há.
 */
export async function servicosDe(regiao: string, dia: Date): Promise<Set<string> | null> {
  const s = await carregar(regiao);
  if (!s?.datas || !s?.servicos) return null;
  const idx = s.datas[chaveDoDia(dia)];
  if (!idx) return null;
  return new Set(idx.map((i) => s.servicos[i]).filter(Boolean));
}

/**
 * As partidas que interessam a quem está ali AGORA.
 *
 * Três cortes, por esta ordem, e cada um responde a uma pergunta diferente:
 *
 * 1. **anda hoje?** — pelo serviço. Uma partida sem `servico_id` passa: é o
 *    caso dos feeds que não declaram calendário, e recusá-la era escondê-la
 *    para sempre;
 * 2. **ainda não passou?** — pela hora. Se já passaram todas, mostram-se as
 *    do princípio do dia, que é o que responde a «e amanhã de manhã?»;
 * 3. **quantas?** — cinco, que é o que cabe na folha sem a fazer rolar.
 *
 * **E DIZ QUANDO DEU A VOLTA.** O corte 2 mostra as da manhã seguinte e não
 * tinha como o dizer: às 20:46, no cais mais servido da região, lia-se
 * «06:45» sem mais nada — nem «amanhã», nem «faltam 10 h», porque a conta da
 * espera dava negativa e desaparecia. Uma hora sozinha, à noite, lê-se como
 * «daqui a pouco». O `amanha` é o que faltava para a folha poder dizê-lo.
 */
export type Proxima<T> = { partida: T; amanha: boolean };

export function proximas<T extends { hora: string; servico_id?: string }>(
  partidas: T[],
  agora: string,
  activos: Set<string> | null,
  quantas = 5,
): Proxima<T>[] {
  const hoje = activos
    ? partidas.filter((p) => !p.servico_id || activos.has(p.servico_id))
    : partidas;
  const base = hoje.length ? hoje : partidas;
  const aSeguir = base.filter((p) => p.hora >= agora);
  const deuAVolta = aSeguir.length === 0;
  return (deuAVolta ? base : aSeguir)
    .slice(0, quantas)
    .map((partida) => ({ partida, amanha: deuAVolta }));
}
