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

/** O que uma letra da folha quer dizer: uma linha, para um destino. */
export type ChamadaDaFolha = { letra: string; linha: string; linha_id: string; destino: string };

/** A chave de uma combinação linha × destino. */
export const chaveDaChamada = (linha_id: string, destino: string) => `${linha_id}\u0000${destino}`;

/**
 * As letras da folha: uma por LINHA E DESTINO — só quando há mais do que uma
 * combinação.
 *
 * Cada minuto da grelha leva a cor da sua linha, e a cor sozinha não chega:
 * há quem não a veja, e há linhas com cores vizinhas. A letra diz o resto —
 * «A — 1095 para Tomar (Terminal)» —, e é pela letra que a legenda se lê.
 * Numa paragem com uma linha só para um sítio só, a letra não diz nada e só
 * sujava a grelha. As combinações mais servidas ficam com as primeiras letras.
 */
export function chamadasDaFolha(partidas: readonly PartidaDaFolha[]): Map<string, ChamadaDaFolha> {
  const conta = new Map<string, { n: number; p: PartidaDaFolha }>();
  for (const p of partidas) {
    const chave = chaveDaChamada(p.linha_id, p.destino);
    const atual = conta.get(chave);
    conta.set(chave, { n: (atual?.n ?? 0) + 1, p });
  }
  if (conta.size < 2) return new Map();
  const ordem = [...conta.entries()].sort(
    ([, a], [, b]) =>
      b.n - a.n ||
      a.p.linha.localeCompare(b.p.linha, 'pt', { numeric: true }) ||
      a.p.destino.localeCompare(b.p.destino, 'pt'),
  );
  return new Map(
    ordem.map(([chave, { p }], i) => [
      chave,
      { letra: letraDe(i), linha: p.linha, linha_id: p.linha_id, destino: p.destino },
    ]),
  );
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
