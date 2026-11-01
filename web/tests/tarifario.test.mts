/**
 * «Que título me serve?» — com o que o tarifário declara, e só isso
 * (`lib/tarifario.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ajudaParaEscolher,
  compensaAPartirDe,
  escolhasDoTarifario,
  porMes,
  porPeriodo,
} from '../src/lib/tarifario.ts';
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

test('um passe compensa à viagem em que o preço dele fica abaixo de pagar cada uma', () => {
  // 30 € por mês contra 1,40 € a viagem: com 21 viagens são 29,40 €, com 22
  // são 30,80 € — é à 22.ª que o passe passa a sair mais barato.
  assert.equal(compensaAPartirDe(30, 1.4), 22);
  // Num empate não compensa ainda: 20 × 1,50 € = 30 €.
  assert.equal(compensaAPartirDe(30, 1.5), 21);
  assert.equal(compensaAPartirDe(30, 0), null, 'sem preço por viagem não há conta');
});

test('um passe anual conta-se ao mês, e um período que não se converte fica de fora', () => {
  assert.equal(porMes({ valor: 120, periodo: 'ano' }), 10);
  assert.equal(porMes({ valor: 12, periodo: 'mes' }), 12);
  assert.equal(porMes({ valor: 2, periodo: 'dia' }), null);
  assert.equal(porMes({ valor: null, periodo: 'mes' }), null);
});

test('só entram no escolhedor as redes com um bilhete e um passe, e o bilhete inteiro vem primeiro', () => {
  const e = escolhasDoTarifario([
    t('reduzido', 'Rede', 0.75),
    t('simples', 'Rede', 1.5),
    t('passe', 'Rede', 40, { periodo: 'mes' }),
    t('jovem', 'Rede', 0, { periodo: 'mes', nota: 'Até aos 23 anos.' }),
    t('so-passe', 'Comboio', 20, { periodo: 'mes' }),
  ]);
  assert.deepEqual(
    e.map((x) => x.rede),
    ['Rede'],
  );
  assert.deepEqual(
    e[0].bilhetes.map((x) => x.id),
    ['simples', 'reduzido'],
  );
  assert.deepEqual(
    e[0].semPagar.map((x) => x.id),
    ['jovem'],
  );
});

test('uma tabela de bicicletas não entra na conta das viagens', () => {
  // A calculadora perguntava «Em que rede viaja?» e oferecia o sistema de
  // bicicletas ao lado do autocarro — onde não se fazem «40 viagens por mês»:
  // paga-se o acesso por um período e os minutos a mais. Só se sabe que uma
  // tabela é de bicicletas quando a região o diz.
  const titulos = [
    t('simples', 'Rede', 1.5),
    t('passe', 'Rede', 40, { periodo: 'mes' }),
    t('acesso-72h', 'Bicis', 2),
    t('acesso-mensal', 'Bicis', 6, { periodo: 'mes' }),
  ];
  assert.deepEqual(
    escolhasDoTarifario(titulos).map((e) => e.rede),
    ['Rede', 'Bicis'],
    'sem a região dizer o modo, a conta não adivinha pelo nome',
  );
  assert.deepEqual(
    escolhasDoTarifario(titulos, { Bicis: { modo: 'bicicleta' }, Rede: { modo: 'autocarro' } }).map(
      (e) => e.rede,
    ),
    ['Rede'],
  );
});
