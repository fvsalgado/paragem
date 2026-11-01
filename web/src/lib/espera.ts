/**
 * A ESPERA ATÉ À PRIMEIRA LIGAÇÃO, À VISTA (auditoria de 1/11/2026, #119).
 *
 * Pedia-se uma viagem para as 9h00 e o primeiro cartão era das 12:35, sem uma
 * palavra: quem via pensava que o planeador tinha ignorado a hora. O resumo
 * que dizia «A recomendada parte às 12:35» só existia para leitores de ecrã.
 *
 * Só quando a espera passa de uma hora — abaixo disso, a hora do cartão fala
 * por si.
 */

/** «45 min», «3 h 35 min», «2 h». */
export function duracaoEmMinutos(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * A frase, ou vazio. `pedida` é o instante perguntado e `parte` o da primeira
 * ligação, ambos em milissegundos; `horaPedida` e `horaDaPartida` em `HH:MM`
 * no relógio da região; `dia` é «amanhã», «no sábado» ou vazio, como os
 * cartões o escrevem.
 */
export function fraseDaEspera(o: {
  pedida: number;
  parte: number;
  agora: boolean;
  horaPedida: string;
  horaDaPartida: string;
  dia?: string;
}): string {
  if (!Number.isFinite(o.pedida) || !Number.isFinite(o.parte)) return '';
  const min = Math.round((o.parte - o.pedida) / 60_000);
  if (min <= 60) return '';
  const as = `${o.dia ? `${o.dia}, ` : ''}às ${o.horaDaPartida}`;
  return o.agora
    ? `A próxima ligação é ${as}: daqui a ${duracaoEmMinutos(min)}.`
    : `Depois das ${o.horaPedida}, a primeira ligação é ${as}: ${duracaoEmMinutos(min)} de espera.`;
}
