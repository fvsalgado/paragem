/**
 * O prazo de reserva do transporte a pedido, calculado para o dia escolhido
 * (auditoria de 1/11/2026, #121): num domingo à noite, para segunda-feira, o
 * prazo tinha fechado na sexta às 15h — e o planeador convidava a ligar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDoPrazo, horaDoPrazo, prazoDaReserva } from '../src/lib/prazo-da-reserva.ts';
import { instanteNaRegiao } from '../src/lib/fuso.ts';

const REGRAS = [{ por_omissao: true, ultimo_dia: 1, ultima_hora: '15:00' }];
const FRASE = 'Até às 15h do dia útil anterior';
// Domingo, 1/11/2026, às 20h, na região.
const DOMINGO = new Date(instanteNaRegiao('2026-11-01', '20:00'));

test('para segunda, o prazo é sexta às 15h — e de domingo já fechou', () => {
  const p = prazoDaReserva('2026-11-02', REGRAS, FRASE, DOMINGO)!;
  assert.deepEqual(p, { dia: '20261102', fecho: '20261030', hora: '15:00', fechou: true });
  assert.equal(
    fraseDoPrazo(p, '20261101'),
    'Para segunda-feira, 2/11, a reserva já fechou: o prazo era sexta-feira, 30/10, às 15h.',
  );
});

test('para quinta, ainda dá: até quarta às 15h, e diz-se o cuidado com os feriados', () => {
  const p = prazoDaReserva('2026-11-05', REGRAS, FRASE, DOMINGO)!;
  assert.equal(p.fecho, '20261104');
  assert.equal(p.fechou, false);
  assert.match(
    fraseDoPrazo(p, '20261101'),
    /^Para quinta-feira, 5\/11, reserve até quarta-feira, 4\/11, às 15h — ou antes/,
  );
});

test('no próprio dia do prazo, fecha à hora', () => {
  const antes = new Date(instanteNaRegiao('2026-11-04', '14:59'));
  const depois = new Date(instanteNaRegiao('2026-11-04', '15:00'));
  assert.equal(prazoDaReserva('2026-11-05', REGRAS, FRASE, antes)!.fechou, false);
  assert.equal(prazoDaReserva('2026-11-05', REGRAS, FRASE, depois)!.fechou, true);
});

test('sem regra, sem hora, ou numa regra que não é de dias úteis, não se calcula', () => {
  assert.equal(prazoDaReserva('2026-11-02', undefined, FRASE, DOMINGO), null);
  assert.equal(prazoDaReserva('2026-11-02', [{ ultimo_dia: 1 }], FRASE, DOMINGO), null);
  assert.equal(
    prazoDaReserva('2026-11-02', REGRAS, 'Até às 15h da véspera', DOMINGO),
    null,
    'dias de calendário contados como úteis davam um prazo errado',
  );
});

test('a hora escreve-se como se diz', () => {
  assert.equal(horaDoPrazo('15:00'), '15h');
  assert.equal(horaDoPrazo('17:30'), '17h30');
});
