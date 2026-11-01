/**
 * A folha do mapa diz quanto custa andar na rede (auditoria de 1/11/2026, #90),
 * e o que o sítio junta, numa frase (#173).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precosDaAbertura } from '../src/lib/tarifario.ts';
import type { Titulo } from '../src/lib/formato.ts';

const t = (o: Partial<Titulo>): Titulo => ({
  id: o.nome ?? 'x',
  rede: 'Alta',
  nome: 'x',
  valor: 1,
  confirmado: true,
  ...o,
});

const TITULOS = [
  t({ nome: 'Bilhete simples', valor: 1.5 }),
  t({ nome: 'Meio bilhete', valor: 0.75 }),
  t({ nome: 'Assinatura de linha', valor: 5, periodo: 'mes' }),
  t({ nome: 'Passe de rede', valor: 40, periodo: 'mes' }),
  t({ nome: 'Passe por confirmar', valor: 90, periodo: 'mes', confirmado: false }),
  t({ rede: 'Outra', nome: 'Bilhete', valor: 9 }),
];

test('o bilhete inteiro e o passe mais largo da rede da região, só confirmados', () => {
  assert.deepEqual(precosDaAbertura(TITULOS, 'Alta'), [
    { nome: 'Bilhete simples', valor: 1.5 },
    { nome: 'Passe de rede', valor: 40, periodo: 'mes' },
  ]);
});

test('sem a rede declarada, a primeira do tarifário; sem títulos, nada', () => {
  assert.equal(precosDaAbertura(TITULOS, null).length, 2);
  assert.deepEqual(precosDaAbertura([], 'Alta'), []);
});

test('a frase do que o sítio junta diz os modos da região, e só com dois ou mais', async () => {
  const { fraseDoQueJunta } = await import('../src/lib/prosa.ts');
  assert.equal(
    fraseDoQueJunta({ rede: { nome: 'Alta' } }, ['autocarro', 'comboio', 'a-pedido', 'taxi']),
    'Autocarros da rede Alta, comboios, transporte a pedido e táxis — tudo num só sítio.',
  );
  assert.equal(fraseDoQueJunta({ rede: { nome: 'Alta' } }, ['autocarro']), null);
});
