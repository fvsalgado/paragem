/**
 * A pé: quanto se demora, para o planeador e para o «Perto de mim» dizerem o
 * mesmo.
 *
 * Num ficheiro à parte e pequeno de propósito: o «Perto de mim» está no ecrã
 * de abertura, e ir buscar isto ao planeador (`viagens.ts`) era levar o
 * planeador inteiro para o telemóvel de quem só abriu o mapa.
 */

/** A velocidade a pé do OTP. Mudá-la aqui muda as estimativas, não os transbordos. */
export const METROS_POR_SEGUNDO = 1.33;

/**
 * Quanto se anda a mais do que em linha reta, quando a região não o mediu nas
 * ruas (`transbordos.json` traz o dela). As ruas não vão a direito, e uma
 * paragem «a 250 m» do outro lado de um rio não está a três minutos.
 */
export const DESVIO_POR_OMISSAO = 1.4;

/** Os minutos a pé até um ponto a esta distância em linha reta. Nunca menos de um. */
export function minutosAPe(metrosEmLinhaReta: number, desvio = DESVIO_POR_OMISSAO): number {
  return Math.max(1, Math.round((metrosEmLinhaReta * desvio) / METROS_POR_SEGUNDO / 60));
}
