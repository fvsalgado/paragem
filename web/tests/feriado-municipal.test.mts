/**
 * O feriado municipal na página da paragem e do concelho (`formato.ts`).
 *
 * Enquanto a região não souber o que muda num feriado municipal, os horários
 * desse dia saem como os de um dia normal — e a página tem de o dizer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feriadoEmBreve, fraseDoFeriadoMunicipal } from '../src/lib/formato.ts';
import type { FeriadoMunicipal } from '../src/lib/formato.ts';

const feriado = (o: Partial<FeriadoMunicipal> = {}): FeriadoMunicipal => ({
  data: '2026-11-24',
  nome: 'Elevação a vila',
  data_confirmada: true,
  nos_horarios: 'por-confirmar',
  ...o,
});

test('diz o dia e o dia da semana, sem nomear o concelho', () => {
  const f = fraseDoFeriadoMunicipal(feriado());
  assert.ok(f);
  assert.equal(f.titulo, '24 de novembro, terça-feira, é feriado municipal neste concelho.');
});

test('por confirmar: os horários desse dia são os de um dia normal, e diz-se', () => {
  const f = fraseDoFeriadoMunicipal(feriado());
  assert.match(f!.texto, /ainda não se sabe/);
  assert.match(f!.texto, /dia normal/);
});

test('com a regra declarada, diz que o horário já conta com o feriado', () => {
  const f = fraseDoFeriadoMunicipal(feriado({ nos_horarios: 'como-feriado' }));
  assert.match(f!.texto, /já contam com o feriado/);
  assert.doesNotMatch(f!.texto, /não se sabe/);
});

test('«nada muda» não desenha nota nenhuma, e nem a falta de feriado', () => {
  assert.equal(fraseDoFeriadoMunicipal(feriado({ nos_horarios: 'nada-muda' })), null);
  assert.equal(fraseDoFeriadoMunicipal(null), null);
  assert.equal(fraseDoFeriadoMunicipal(undefined), null);
});

test('uma data que não vem da câmara diz que falta a confirmação', () => {
  assert.match(fraseDoFeriadoMunicipal(feriado({ data_confirmada: false }))!.texto, /câmara/);
  assert.doesNotMatch(fraseDoFeriadoMunicipal(feriado())!.texto, /câmara/);
});

test('o dia da semana não escorrega com o fuso: é o do calendário', () => {
  // Uma segunda-feira de Páscoa e uma quinta-feira da Ascensão.
  assert.match(fraseDoFeriadoMunicipal(feriado({ data: '2027-03-29' }))!.titulo, /segunda-feira/);
  assert.match(fraseDoFeriadoMunicipal(feriado({ data: '2027-05-06' }))!.titulo, /quinta-feira/);
});

test('«em breve» é do próprio dia até ao prazo, e nunca depois', () => {
  const f = feriado();
  assert.equal(feriadoEmBreve(f, '2026-11-24'), true);
  assert.equal(feriadoEmBreve(f, '2026-11-03'), true);
  assert.equal(feriadoEmBreve(f, '2026-11-02'), false);
  assert.equal(feriadoEmBreve(f, '2026-11-25'), false);
  assert.equal(feriadoEmBreve(null, '2026-11-24'), false);
});
