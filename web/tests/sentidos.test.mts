/**
 * Os sentidos de uma linha, em palavras (auditoria de 1/11/2026, #92 e #93).
 *
 * O caso é o da linha medida, em pequeno e com nomes inventados: a maior
 * parte das viagens faz Ponte – Cruzeiro, e há as que vêm da Fonte e as que
 * vão ao Mosteiro. O regresso só tem os pontos de horário.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pontasDaLinha, soPontosDeHorario, tituloDoSentido } from '../src/lib/sentidos.ts';
import type { Sentido } from '../src/lib/formato.ts';

const p = (id: string, nome = id) => ({ id, nome });
const v = (horas: string[], destino: string) => ({
  servico_id: 'x',
  servico_nome: 'Todo o ano · Dias úteis',
  destino,
  horas,
  estimadas: [],
});

// Ida: Fonte, Ponte, Cruzeiro, Mosteiro (pontos de horário), com intermédias.
const IDA: Sentido = {
  sentido: '0',
  variantes: 2,
  viagens: 4,
  viagens_deste_percurso: 2,
  paragens: [p('T', 'Ponte'), p('i1'), p('i2'), p('F', 'Cruzeiro')],
  origens: [
    { nome: 'Ponte', viagens: 3 },
    { nome: 'Fonte', viagens: 1 },
  ],
  destinos: [
    { nome: 'Cruzeiro', viagens: 3 },
    { nome: 'Mosteiro', viagens: 1 },
  ],
  quadro: {
    paragens: [p('A', 'Fonte'), p('T', 'Ponte'), p('F', 'Cruzeiro'), p('B', 'Mosteiro')],
    viagens: [
      v(['', '07:00', '07:50', ''], 'Cruzeiro'),
      v(['', '12:00', '12:50', ''], 'Cruzeiro'),
      v(['06:00', '07:00', '', ''], 'Cruzeiro'),
      v(['', '', '13:00', '13:30'], 'Mosteiro'),
    ],
  },
};
// Volta: só os pontos de horário.
const VOLTA: Sentido = {
  sentido: '1',
  variantes: 1,
  viagens: 3,
  viagens_deste_percurso: 3,
  paragens: [p('F', 'Cruzeiro'), p('T', 'Ponte')],
  origens: [{ nome: 'Cruzeiro', viagens: 3 }],
  destinos: [
    { nome: 'Ponte', viagens: 2 },
    { nome: 'Fonte', viagens: 1 },
  ],
  quadro: {
    paragens: [p('F', 'Cruzeiro'), p('T', 'Ponte'), p('A', 'Fonte')],
    viagens: [
      v(['08:00', '08:50', ''], 'Ponte'),
      v(['18:00', '18:50', ''], 'Ponte'),
      v(['15:00', '15:50', '16:30'], 'Fonte'),
    ],
  },
};

test('o sentido diz o destino mais comum e o mais longe', () => {
  assert.equal(tituloDoSentido(IDA), 'Para Cruzeiro e Mosteiro');
  assert.equal(tituloDoSentido(VOLTA), 'Para Ponte e Fonte');
});

test('quando o mais comum é o mais longe, diz-se um só', () => {
  assert.equal(
    tituloDoSentido({ ...VOLTA, destinos: [{ nome: 'Fonte', viagens: 3 }] }),
    'Para Fonte',
  );
});

test('as pontas da linha vêm pela ordem do caminho, com a viagem mais comum', () => {
  const r = pontasDaLinha([IDA, VOLTA])!;
  assert.deepEqual(r.pontas, ['Fonte', 'Ponte', 'Cruzeiro', 'Mosteiro']);
  // Ponte – Cruzeiro: duas na ida, duas na volta; sete viagens ao todo.
  assert.deepEqual(r.maisComum, { de: 'Ponte', a: 'Cruzeiro', viagens: 4, de_total: 7 });
});

test('uma linha de duas pontas não precisa da frase', () => {
  const simples: Sentido = {
    ...VOLTA,
    destinos: [{ nome: 'Ponte', viagens: 3 }],
  };
  assert.equal(pontasDaLinha([simples]), null);
});

test('o percurso só de pontos de horário diz-se, quando o outro sentido tem as do caminho', () => {
  assert.equal(soPontosDeHorario(VOLTA, [IDA, VOLTA]), true);
  assert.equal(soPontosDeHorario(IDA, [IDA, VOLTA]), false);
  // Se nenhum sentido tem intermédias, é uma linha com todas marcadas: nada a dizer.
  assert.equal(soPontosDeHorario(VOLTA, [VOLTA]), false);
});
