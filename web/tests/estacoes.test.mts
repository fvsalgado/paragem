/**
 * As paragens perto de uma estação contam-se uma por nome, na lista e na
 * página da estação — com a mesma regra (auditoria de 1/11/2026, #85).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragensPertoPorNome } from '../src/lib/formato.ts';

test('os dois lados da estrada são uma paragem, com a distância da mais perto', () => {
  const g = paragensPertoPorNome([
    { id: 'a', nome: 'Terra (Estação)', metros: 125 },
    { id: 'b', nome: 'Terra (Estação)', metros: 90 },
    { id: 'c', nome: 'Terra (Largo)', metros: 280 },
  ]);
  assert.deepEqual(g, [
    { nome: 'Terra (Estação)', ids: ['a', 'b'], metros: 90 },
    { nome: 'Terra (Largo)', ids: ['c'], metros: 280 },
  ]);
});

test('sem paragens perto, nenhuma', () => {
  assert.deepEqual(paragensPertoPorNome([]), []);
});
