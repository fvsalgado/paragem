/**
 * A regra de frescura da disponibilidade, medida.
 *
 * É a decisão que mais pesa nesta parte da página: um número velho apresentado
 * como certo é pior do que número nenhum. Aqui prova-se que envelhece quando
 * deve e que se lê em português.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaFresco, haQuanto, JANELA_FRESCURA_MS } from '../src/lib/disponibilidade.ts';

test('uma leitura recente é fresca; uma velha não', () => {
  const agora = 1_000_000_000_000;
  assert.equal(estaFresco(agora - 30_000, agora), true);
  assert.equal(estaFresco(agora - (JANELA_FRESCURA_MS - 1), agora), true);
  assert.equal(estaFresco(agora - JANELA_FRESCURA_MS, agora), false);
  assert.equal(estaFresco(agora - 60 * 60 * 1000, agora), false);
});

test('uma leitura do futuro não é fresca — é relógio trocado', () => {
  // Melhor não mostrar do que mostrar um número «de daqui a cinco minutos».
  const agora = 1_000_000_000_000;
  assert.equal(estaFresco(agora + 10_000, agora), false);
});

test('«há quanto» lê-se em português, sem falsa precisão', () => {
  assert.equal(haQuanto(0), 'há 0 s');
  assert.equal(haQuanto(40), 'há 40 s');
  assert.equal(haQuanto(59), 'há 59 s');
  assert.equal(haQuanto(60), 'há 1 min');
  assert.equal(haQuanto(200), 'há 3 min');
});
