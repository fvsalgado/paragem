/**
 * «Horários planeados · dados de 3/9/2026» — e nenhuma data quando não se sabe.
 *
 * A data é a que as fontes trazem (`sitio.py`, `datas_dos_horarios`), por
 * modo. Estes testes fixam as duas metades da regra do §4.4: dizer de quando
 * são os dados quando se sabe, e não inventar uma data quando não se sabe.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dataDosHorarios, fraseDosHorarios } from '../src/lib/formato.ts';

const REGIAO = {
  modos: ['autocarro', 'comboio', 'expresso'],
  dados_de: { autocarro: '2026-09-03', comboio: '2026-10-05', expresso: null },
};

test('a data de um modo escreve-se como se lê: dia, mês e ano, sem zeros à esquerda', () => {
  assert.equal(dataDosHorarios(REGIAO, ['autocarro']), '3/9/2026');
  assert.equal(
    fraseDosHorarios('3/9/2026'),
    'Horários planeados · dados de 3/9/2026, não em tempo real.',
  );
});

test('vários modos na mesma página: vale o mais antigo', () => {
  assert.equal(dataDosHorarios(REGIAO, ['comboio', 'autocarro']), '3/9/2026');
});

test('um modo sem data deixa a página sem data — não herda a de outro', () => {
  assert.equal(dataDosHorarios(REGIAO, ['expresso']), null);
  assert.equal(dataDosHorarios(REGIAO, ['autocarro', 'expresso']), null);
  assert.equal(dataDosHorarios(REGIAO), null, 'o planeador mistura-os todos, e um não tem data');
  assert.equal(dataDosHorarios(REGIAO, ['bicicleta']), null, 'um modo de que nada se sabe');
});

test('sem modos pedidos, contam só os que a região tem ligados', () => {
  const comUmDesligado = { ...REGIAO, modos: ['autocarro', 'comboio'] };
  assert.equal(dataDosHorarios(comUmDesligado), '3/9/2026');
});

test('dados de antes disto, ou uma data que não é data, não dão data nenhuma', () => {
  assert.equal(dataDosHorarios({ modos: ['autocarro'] }), null);
  assert.equal(dataDosHorarios(null), null);
  assert.equal(
    dataDosHorarios({ modos: ['autocarro'], dados_de: { autocarro: 'ontem' } }, ['autocarro']),
    null,
  );
  assert.equal(fraseDosHorarios(null), 'Horários planeados, não em tempo real.');
});
