/**
 * O cliente da disponibilidade de bicicletas, do lado do navegador.
 *
 * O sítio é estático: não há servidor nosso entre o navegador e o serviço de
 * disponibilidade. O endereço vem do ambiente e NÃO está cravado no código — é
 * a mesma regra do domínio e do motor de viagens (CLAUDE.md §4.7), e é o que
 * permite a mesma construção servir uma região aqui e outra ali.
 *
 * **Quando não está configurado, não se inventa.** A página das bicicletas
 * mostra as estações na mesma, apenas sem contagens — como funciona com o OTP
 * em baixo. Prometer «3 bicicletas» sem serviço que o diga era mandar alguém a
 * uma estação vazia.
 */

/** Uma estação no GBFS `station_status`. Os campos que faltam, faltam. */
export type EstadoDaEstacao = {
  station_id: string;
  num_bikes_available?: number;
  num_docks_available?: number;
  last_reported?: number;
};

export type StationStatus = {
  last_updated: number;
  ttl?: number;
  data: { stations: EstadoDaEstacao[] };
};

/**
 * QUANTO TEMPO UM NÚMERO AINDA VALE A PENA MOSTRAR.
 *
 * As bicicletas mexem-se depressa, e o serviço só lê a página de minuto a
 * minuto: um número de há cinco minutos ainda diz alguma coisa, um de há meia
 * hora já engana. Passado este tempo sem leitura nova, a contagem desaparece e
 * fica «sem dados recentes» — que é honesto, e a decisão que se tomou para
 * esta página: mostrar a hora e deixar cair o número quando envelhece.
 */
export const JANELA_FRESCURA_MS = 5 * 60 * 1000;

/** Está a leitura suficientemente fresca para se mostrar o número? */
export function estaFresco(
  geradoEmMs: number,
  agoraMs: number,
  janelaMs = JANELA_FRESCURA_MS,
): boolean {
  const idade = agoraMs - geradoEmMs;
  return idade >= 0 && idade < janelaMs;
}

/**
 * «há 40 s», «há 3 min». Em português, e sem falsa precisão: ao minuto a
 * partir de um minuto, ao segundo abaixo disso.
 */
export function haQuanto(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `há ${s} s`;
  const min = Math.round(s / 60);
  return `há ${min} min`;
}
