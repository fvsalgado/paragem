/**
 * Um só conjunto de números, cada um com o que conta (`numeros.json`).
 *
 * As listas do sítio têm as paragens e as linhas da rede e as dos outros
 * operadores que param na região; o número sozinho era maior do que o da rede,
 * e quem a conhece lia-o como um erro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDasParagens, fraseDosOperadores } from '../src/lib/prosa.ts';
import type { Numeros } from '../src/lib/formato.ts';

const n = (o: Record<string, number>): Numeros =>
  Object.fromEntries(Object.entries(o).map(([k, valor]) => [k, { valor, conta: '' }]));

test('diz quantas paragens e linhas são da rede, quando há outros operadores', () => {
  const f = fraseDosOperadores(
    n({ paragens: 3046, paragens_da_rede: 1927, linhas: 145, linhas_da_rede: 122 }),
  );
  assert.equal(
    f,
    'Das paragens e linhas, 1 927 paragens e 122 linhas são da rede da região; ' +
      'as outras são de operadores que param nela.',
  );
});

test('quando são todas da rede, ou sem números, não diz nada', () => {
  assert.equal(
    fraseDosOperadores(n({ paragens: 40, paragens_da_rede: 40, linhas: 3, linhas_da_rede: 3 })),
    null,
  );
  assert.equal(fraseDosOperadores(null), null);
  assert.equal(fraseDosOperadores(n({ paragens: 40 })), null);
});

test('a lista de paragens desdobra-se: da rede, de fora, e nos concelhos', () => {
  const f = fraseDasParagens(
    n({ paragens: 3046, paragens_da_rede: 1927, paragens_nos_concelhos: 1945 }),
  );
  assert.equal(
    f,
    '1 927 são da rede da região e 1 119 de outros operadores que param nela; ' +
      '1 945 ficam nos concelhos da região.',
  );
  assert.equal(
    fraseDasParagens(n({ paragens: 40, paragens_da_rede: 40, paragens_nos_concelhos: 40 })),
    null,
  );
});
