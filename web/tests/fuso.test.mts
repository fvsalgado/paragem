/**
 * As horas de parede, e a mudança da hora.
 *
 * Isto existe por causa de um engano que não dá erro nenhum: o painel corre
 * num servidor em UTC, o campo do formulário não leva fuso, e sem estas
 * funções um aviso das 8h ficava guardado como 8h UTC — certo no inverno e
 * uma hora adiantado no verão. Ninguém veria, até alguém perder o autocarro.
 *
 * As datas são de Portugal continental (`Europe/Lisbon`), que é WET no
 * inverno (UTC+0) e WEST no verão (UTC+1). As duas madrugadas em que o
 * relógio muda estão aqui de propósito: são o único sítio onde uma
 * implementação ingénua se parte.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doCampoLocal, paraCampoLocal, porExtenso } from '../src/lib/fuso.ts';

const LX = 'Europe/Lisbon';

test('no inverno, a hora de parede é a hora UTC', () => {
  assert.equal(doCampoLocal('2026-01-15T08:00', LX), '2026-01-15T08:00:00.000Z');
});

test('no verão, a hora de parede está uma hora à frente de UTC', () => {
  // Se isto falhar com 08:00Z, o que está a acontecer é o engano inteiro:
  // o aviso das 8h aparece às 9h.
  assert.equal(doCampoLocal('2026-07-15T08:00', LX), '2026-07-15T07:00:00.000Z');
});

test('ida e volta não perde nada, nas duas estações', () => {
  for (const parede of ['2026-01-15T08:00', '2026-07-15T08:00', '2026-12-31T23:59']) {
    const instante = doCampoLocal(parede, LX);
    assert.equal(paraCampoLocal(instante, LX), parede, parede);
  }
});

test('a madrugada em que o relógio salta para a frente não dá NaN', () => {
  // 29/03/2026, às 01:00 passa a ser 02:00: a 01:30 NÃO EXISTE em Lisboa.
  // Não há resposta certa; há respostas aceitáveis. O que não é aceitável é
  // uma data inválida a entrar na base.
  const instante = doCampoLocal('2026-03-29T01:30', LX);
  assert.ok(instante, 'devia haver instante');
  assert.ok(!Number.isNaN(Date.parse(instante!)), 'e devia ser uma data legível');
});

test('a madrugada em que o relógio recua dá uma das duas horas possíveis', () => {
  // 25/10/2026, às 02:00 volta a ser 01:00: a 01:30 ACONTECE DUAS VEZES.
  // Qualquer das duas é defensável; inventar uma terceira não.
  const instante = doCampoLocal('2026-10-25T01:30', LX);
  assert.ok(
    instante === '2026-10-25T00:30:00.000Z' || instante === '2026-10-25T01:30:00.000Z',
    `hora ambígua resolvida para ${instante}`,
  );
});

test('em branco é null, e não a época', () => {
  // `new Date('')` dá Invalid Date e `new Date(0)` dá 1970. Um aviso sem
  // prazo tem de chegar à base como `null` — é o que o GTFS-RT quer dizer
  // com «não se sabe quando acaba».
  assert.equal(doCampoLocal('', LX), null);
  assert.equal(doCampoLocal('   ', LX), null);
  assert.equal(paraCampoLocal(null, LX), '');
  assert.equal(paraCampoLocal(undefined, LX), '');
});

test('o que não se lê rebenta, em vez de virar uma data qualquer', () => {
  assert.throws(() => doCampoLocal('amanhã de manhã', LX), /não se lê/);
  assert.throws(() => doCampoLocal('2026-13-45T99:99', LX), /não se lê/);
});

test('por extenso é português, no fuso da região', () => {
  const texto = porExtenso('2026-07-15T07:00:00.000Z', LX);
  assert.match(texto, /15 de julho de 2026/);
  assert.match(texto, /08:00/);
});

test('um fuso diferente dá uma hora diferente, que é o ponto de ser declarado', () => {
  // Se isto passasse a dar o mesmo que Lisboa, o fuso teria deixado de ser
  // lido e estaria cravado algures.
  assert.equal(doCampoLocal('2026-07-15T08:00', 'Atlantic/Azores'), '2026-07-15T08:00:00.000Z');
  assert.equal(doCampoLocal('2026-07-15T08:00', 'Europe/Madrid'), '2026-07-15T06:00:00.000Z');
});
