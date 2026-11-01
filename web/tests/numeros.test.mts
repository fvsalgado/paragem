/**
 * Um só conjunto de números, cada um com o que conta (`numeros.json`).
 *
 * As listas do sítio têm as paragens e as linhas da rede e as dos outros
 * operadores que param na região; o número sozinho era maior do que o da rede,
 * e quem a conhece lia-o como um erro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDoIndiceDasParagens, fraseDosOperadores } from '../src/lib/prosa.ts';
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

test('o índice das paragens diz quantas ficam nos concelhos e quantas fora, e mais nada', () => {
  // Eram quatro números numa frase, e 1 928 (da rede) e 1 946 (nos concelhos)
  // pareciam o mesmo número com um erro (auditoria de 1/11/2026, #105).
  // Os milhares separam-se com um espaço inquebrável; compara-se o texto.
  const f = fraseDoIndiceDasParagens(
    n({ paragens: 3047, paragens_da_rede: 1928, paragens_nos_concelhos: 1946 }),
    13,
    3047,
  ).replace(/\s/g, ' ');
  assert.equal(
    f,
    '1 946 paragens nos 13 concelhos da região. A lista inclui também 1 101 paragens ' +
      'fora deles, nas linhas que entram na região ou saem dela.',
  );
  assert.ok(!f.includes('1 928'), 'a divisão por operador não é para esta frase');
});

test('com um concelho só, diz a região; sem paragens de fora, ou sem números, só o total', () => {
  assert.equal(
    fraseDoIndiceDasParagens(n({ paragens: 50, paragens_nos_concelhos: 40 }), 1, 50),
    '40 paragens na região. A lista inclui também 10 paragens fora dela, nas linhas que ' +
      'entram na região ou saem dela.',
  );
  assert.equal(
    fraseDoIndiceDasParagens(n({ paragens: 40, paragens_nos_concelhos: 40 }), 3, 40),
    '40 paragens.',
  );
  assert.equal(fraseDoIndiceDasParagens(null, 3, 12), '12 paragens.');
});
