/**
 * O HORÁRIO PARA AFIXAR NA PARAGEM: as partidas em grelha, uma fila por hora e
 * os minutos à frente, como o horário que se cola no abrigo.
 *
 * A lista da página («07:42 · 1095 · Tomar») serve quem procura uma partida no
 * telemóvel; numa folha em papel, de pé, à espera, lê-se a grelha: «às 8 há
 * às 02, às 22 e às 42». É o desenho de qualquer horário impresso, e não se
 * inventa outro.
 *
 * Funções puras, para se testarem sem servidor (`tests/horario-afixavel.test.mts`).
 */

/** O que a grelha precisa de saber de cada partida. */
export type PartidaDaFolha = {
  hora: string;
  linha: string;
  linha_id: string;
  destino: string;
  servico_nome: string;
  estimada: boolean;
  circular?: boolean;
};

/** Um minuto na grelha: «42», a linha, e o que se sabe da hora. */
export type MinutoDaFolha = {
  minuto: string;
  linha: string;
  linha_id: string;
  /** A letra do destino, quando a paragem tem mais do que um — ver `destinos`. */
  destino: string;
  estimada: boolean;
};

/** Uma fila da grelha: a hora («07») e os minutos dela, pela ordem. */
export type HoraDaFolha = {
  hora: string;
  /** `true` para as horas depois da meia-noite de uma viagem do dia anterior (24:10 → 00). */
  diaSeguinte: boolean;
  minutos: MinutoDaFolha[];
};

/** Um quadro: um tipo de dia («Todo o ano · Dias úteis») e a grelha dele. */
export type QuadroDaFolha = {
  nome: string;
  horas: HoraDaFolha[];
  partidas: number;
};

/**
 * As partidas de uma paragem em quadros, um por tipo de dia, pela ordem em que
 * chegam (o pipeline já as manda pela do horário impresso: o ano inteiro antes
 * do escolar, os dias úteis antes dos sábados). Dentro de cada quadro, uma fila
 * por hora, e os minutos pela ordem.
 *
 * Uma hora depois da meia-noite («24:10», a viagem que começou na véspera)
 * fica na fila «00», no fim, e diz-se que é do dia seguinte: pô-la à cabeça,
 * antes das 06, era dizer que há um autocarro às 00:10 do próprio dia.
 */
export function quadrosDaFolha(partidas: readonly PartidaDaFolha[]): QuadroDaFolha[] {
  const porServico = new Map<string, PartidaDaFolha[]>();
  for (const p of partidas) {
    const lista = porServico.get(p.servico_nome) ?? [];
    lista.push(p);
    porServico.set(p.servico_nome, lista);
  }

  return [...porServico.entries()].map(([nome, lista]) => {
    const porHora = new Map<number, MinutoDaFolha[]>();
    for (const p of lista) {
      const [h, m] = p.hora.split(':');
      const hora = Number(h);
      if (!Number.isFinite(hora) || !m) continue;
      const minutos = porHora.get(hora) ?? [];
      minutos.push({
        minuto: m.slice(0, 2),
        linha: p.linha,
        linha_id: p.linha_id,
        destino: p.destino,
        estimada: p.estimada,
      });
      porHora.set(hora, minutos);
    }
    const horas = [...porHora.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hora, minutos]) => ({
        hora: String(hora % 24).padStart(2, '0'),
        diaSeguinte: hora >= 24,
        minutos: minutos.sort((a, b) => a.minuto.localeCompare(b.minuto)),
      }));
    return { nome, horas, partidas: lista.length };
  });
}

/**
 * Os destinos da folha, com uma letra cada — só quando há mais do que um.
 *
 * Numa paragem servida por uma linha só, para um sítio só, a letra não diz
 * nada e só suja a grelha. Com mais, cada minuto leva a letra do destino, e a
 * legenda diz qual é qual: «A — Tomar (Terminal)». Os mais servidos ficam com
 * as primeiras letras.
 */
export function destinosDaFolha(partidas: readonly PartidaDaFolha[]): Map<string, string> {
  const conta = new Map<string, number>();
  for (const p of partidas) conta.set(p.destino, (conta.get(p.destino) ?? 0) + 1);
  if (conta.size < 2) return new Map();
  const ordem = [...conta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt'))
    .map(([d]) => d);
  return new Map(ordem.map((d, i) => [d, letraDe(i)]));
}

/** A, B, …, Z, AA, AB… — a 27.ª letra não pode ser outra vez «A». */
function letraDe(i: number): string {
  let n = i;
  let letra = '';
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}
