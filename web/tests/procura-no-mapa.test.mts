/**
 * A procura da caixa do mapa devolve a cidade e a estação de comboio, e não só
 * as paragens.
 *
 * Numa região real partiu-se de duas maneiras, e nenhuma se via nos dados de
 * prova, que são pequenos de mais:
 *
 * 1. o nome de uma cidade enchia os primeiros 80 resultados com as paragens
 *    que começam por ele, a procura parava aí, e o sítio da cidade — que vem
 *    no fim do universo, depois das paragens — nunca era visto;
 * 2. a estação de comboio de outra cidade sumia, porque havia uma paragem com
 *    o mesmo nome a 125 m, e as repetidas juntavam-se fosse qual fosse o tipo.
 *
 * Os dados aqui são inventados, com a forma desses dois casos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Ponto } from '../src/lib/formato.ts';
import { procurarPontos, semRepetir } from '../src/lib/procura-no-mapa.ts';

const ponto = (nome: string, tipo: string, lat: number, lon: number, extra = {}): Ponto => ({
  nome,
  tipo,
  lat,
  lon,
  id: `${tipo}-${nome}-${lat}`,
  concelho: 'c1',
  ...extra,
});

/** A 125 m para norte de um ponto, à latitude de Portugal. */
const a125m = 125 / 111_320;

test('o nome de uma cidade devolve a cidade, mesmo com cem paragens que começam por ele', () => {
  const paragens = Array.from({ length: 120 }, (_, i) =>
    ponto(`Vale Serrado (Rua ${i + 1})`, 'paragem', 39.5 + i * 0.001, -8.2, { partidas: 10 }),
  );
  const cidade = ponto('Vale Serrado', 'sitio', 39.45, -8.25, {
    classe: 'place=town',
    descricao: 'Cidade',
  });
  const { resultados } = procurarPontos({
    texto: 'Vale Serrado',
    pontos: paragens,
    sitios: [
      ponto('Pastelaria Vale Serrado', 'sitio', 39.4, -8.3, { classe: 'shop=bakery' }),
      cidade,
    ],
  });
  assert.equal(resultados.length, 12);
  assert.equal(resultados[0], cidade, 'o nome exato vem primeiro');
});

test('a estação de comboio não se junta à paragem com o mesmo nome ao lado', () => {
  const paragem = ponto('Ponte Alta', 'paragem', 39.3, -8.4, { partidas: 30 });
  const estacao = ponto('Ponte Alta', 'estacao', 39.3 + a125m, -8.4);
  const { resultados } = procurarPontos({
    texto: 'ponte alta',
    pontos: [paragem, estacao],
    sitios: [],
  });
  assert.deepEqual(resultados, [paragem, estacao]);
});

test('a cidade não se junta à paragem com o nome dela no largo do centro', () => {
  const paragem = ponto('Vale Serrado', 'paragem', 39.45, -8.25, { partidas: 30 });
  const cidade = ponto('Vale Serrado', 'sitio', 39.45 + a125m / 2, -8.25, {
    classe: 'place=town',
  });
  const { resultados } = procurarPontos({
    texto: 'vale serrado',
    pontos: [paragem],
    sitios: [cidade],
  });
  assert.deepEqual(resultados, [paragem, cidade]);
});

test('o cais dos expressos e a paragem no mesmo passeio continuam a ser um só', () => {
  const paragem = ponto('Terminal', 'paragem', 39.2, -8.1, { partidas: 50 });
  const cais = ponto('Terminal', 'expresso', 39.2 + 19 / 111_320, -8.1);
  assert.deepEqual(semRepetir([paragem, cais]), [paragem]);
  // Duas paragens do mesmo nome em freguesias diferentes são duas respostas.
  const longe = ponto('Terminal', 'paragem', 39.5, -8.1);
  assert.deepEqual(semRepetir([paragem, longe]), [paragem, longe]);
});
