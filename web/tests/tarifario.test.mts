/**
 * «Que título me serve?» — com o que o tarifário declara, e só isso
 * (`lib/tarifario.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajudaParaEscolher, porPeriodo } from '../src/lib/tarifario.ts';
import type { Titulo } from '../src/lib/formato.ts';

const t = (
  id: string,
  rede: string,
  valor: number | null,
  extra: Partial<Titulo> = {},
): Titulo => ({
  id,
  rede,
  nome: id,
  valor,
  confirmado: true,
  ...extra,
});

test('arruma pelo que cada título é: a cada uso, por um período, ou sem pagar', () => {
  const [a] = ajudaParaEscolher([
    t('simples', 'Rede', 1.5),
    t('reduzido', 'Rede', 0.75),
    t('passe', 'Rede', 40, { periodo: 'mes' }),
    t('senior', 'Rede', 0, { nota: 'Para quem tem 65 anos ou mais.' }),
  ]);
  assert.deepEqual(
    a.aCadaUso.map((x) => x.id),
    ['simples', 'reduzido'],
  );
  assert.deepEqual(
    a.porPeriodo.map((x) => x.id),
    ['passe'],
  );
  assert.deepEqual(
    a.semPagar.map((x) => x.id),
    ['senior'],
  );
});

test('a única conta é a dos preços: quantos do título inteiro se compram pelo do período', () => {
  const [a] = ajudaParaEscolher([
    t('simples', 'Rede', 1.5),
    t('reduzido', 'Rede', 0.75),
    t('passe', 'Rede', 40, { periodo: 'mes' }),
  ]);
  // A referência é o título de cada uso MAIS CARO — o preço inteiro, e não o
  // desconto que nem toda a gente tem: 40 / 1,50 = 26,7 → 26.
  assert.equal(a.porPeriodo[0].equivale?.vezes, 26);
  assert.equal(a.porPeriodo[0].equivale?.de.id, 'simples');
});

test('sem título de cada uso na rede, não há conta a fazer — e as redes não se misturam', () => {
  const r = ajudaParaEscolher([
    t('passe', 'A', 20, { periodo: 'mes' }),
    t('simples', 'B', 1),
    t('sem-preco', 'B', null),
  ]);
  assert.deepEqual(
    r.map((x) => x.rede),
    ['A', 'B'],
  );
  assert.equal(r[0].porPeriodo[0].equivale, undefined);
  assert.equal(r[1].aCadaUso.length, 1, 'um título sem preço não entra em grupo nenhum');
});

test('o período diz-se por extenso, e um que a página não conhece não se adivinha', () => {
  assert.equal(porPeriodo('mes'), 'por mês');
  assert.equal(porPeriodo('ano'), 'por ano');
  assert.equal(porPeriodo('quinzena'), '');
  assert.equal(porPeriodo(undefined), '');
});
