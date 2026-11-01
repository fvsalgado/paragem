/**
 * A espera até à primeira ligação diz-se à vista quando passa de uma hora
 * (auditoria de 1/11/2026, #119).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duracaoEmMinutos, fraseDaEspera } from '../src/lib/espera.ts';

const H = 3_600_000;
const base = { pedida: 9 * H, horaPedida: '09:00', agora: false };

test('pedida às 9h, a primeira às 12:35: diz-se a espera', () => {
  assert.equal(
    fraseDaEspera({ ...base, parte: 12 * H + 35 * 60_000, horaDaPartida: '12:35' }),
    'Depois das 09:00, a primeira ligação é às 12:35: 3 h 35 min de espera.',
  );
});

test('com «partir agora», diz-se daqui a quanto', () => {
  assert.equal(
    fraseDaEspera({ ...base, agora: true, parte: 11 * H, horaDaPartida: '11:00', dia: '' }),
    'A próxima ligação é às 11:00: daqui a 2 h.',
  );
});

test('até uma hora não se diz nada: a hora do cartão fala por si', () => {
  assert.equal(fraseDaEspera({ ...base, parte: 10 * H, horaDaPartida: '10:00' }), '');
  assert.equal(
    fraseDaEspera({ ...base, pedida: Number.NaN, parte: 12 * H, horaDaPartida: '12:00' }),
    '',
  );
});

test('a duração por extenso', () => {
  assert.equal(duracaoEmMinutos(45), '45 min');
  assert.equal(duracaoEmMinutos(215), '3 h 35 min');
  assert.equal(duracaoEmMinutos(120), '2 h');
});
