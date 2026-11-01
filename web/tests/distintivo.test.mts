/**
 * O distintivo de uma linha não pode desaparecer no tema escuro.
 *
 * Uma linha da região real é `#1D1D1B`, e a página escura é `#0F1A20`: 1,0:1. O número ficava a
 * flutuar sem pastilha nenhuma à volta (auditoria de 1/11/2026, #96).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contraste, somemNoEscuro } from '../src/lib/cor.ts';

test('uma cor quase preta some no escuro, e leva o aro', () => {
  assert.ok(contraste('#1d1d1b', '#0f1a20') < 1.5);
  assert.equal(somemNoEscuro('#1d1d1b'), true);
});

test('conta também o fundo dos cartões, onde estão o «A seguir» e o planeador', () => {
  // Contra a página passa; contra o cartão não.
  assert.ok(contraste('#cf1417', '#0f1a20') >= 3);
  assert.ok(contraste('#cf1417', '#16242c') < 3);
  assert.equal(somemNoEscuro('#cf1417'), true);
});

test('uma cor clara ou viva não leva nada', () => {
  assert.equal(somemNoEscuro('#ffd401'), false);
  assert.equal(somemNoEscuro('#1c9bd8'), false);
});
