/**
 * ONDE FICA UM PONTO, em palavras de quem anda na rua.
 *
 * Oito das nove praças de táxi da região não têm nome no OpenStreetMap, e a
 * página listava oito vezes «Sem nome no mapa» — uma lista em que todos os
 * itens dizem o mesmo não ajuda ninguém a encontrar um táxi. O que os dados
 * TÊM é onde a praça está; e o sítio tem as paragens, com nomes que quem lá
 * mora reconhece. «Junto à paragem do Mercado, a 40 m» não se inventa: é a
 * paragem da rede mais perto, à distância medida.
 */
import { metros } from './viagens';
import type { Paragem } from './formato';

/** Até onde uma paragem ainda serve para dizer onde um ponto está. */
export const PERTO_M = 400;

export function paragemMaisPerto(
  p: { lat: number; lon: number },
  paragens: Pick<Paragem, 'nome' | 'lat' | 'lon'>[],
  raio = PERTO_M,
): { nome: string; metros: number } | null {
  let melhor: { nome: string; metros: number } | null = null;
  for (const q of paragens) {
    // Um corte barato antes da conta: 0,01° são uns 1 100 m.
    if (Math.abs(q.lat - p.lat) > 0.01 || Math.abs(q.lon - p.lon) > 0.01) continue;
    const m = metros([p.lat, p.lon], [q.lat, q.lon]);
    if (m <= raio && (!melhor || m < melhor.metros)) melhor = { nome: q.nome, metros: m };
  }
  return melhor ? { nome: melhor.nome, metros: Math.round(melhor.metros / 10) * 10 } : null;
}
