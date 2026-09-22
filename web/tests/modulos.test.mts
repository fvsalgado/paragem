/**
 * O interruptor dos módulos, do lado de quem o aplica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  modoDoTipo,
  modosLigados,
  modulosDesligadosDoAmbiente,
  semModulosDesligados,
} from '../src/lib/modulos.ts';

test('as paragens são autocarro e as estações são comboio; o resto é o que diz', () => {
  assert.equal(modoDoTipo('paragem'), 'autocarro');
  assert.equal(modoDoTipo('estacao'), 'comboio');
  assert.equal(modoDoTipo('bicicleta'), 'bicicleta');
  assert.equal(modoDoTipo('sitio'), 'sitio');
});

test('o ambiente declara por região, com os módulos separados por +', () => {
  assert.deepEqual(modulosDesligadosDoAmbiente('prova=taxi+bicicleta, prova-municipio=comboio'), {
    prova: ['taxi', 'bicicleta'],
    'prova-municipio': ['comboio'],
  });
  // Uma entrada mal escrita ignora-se; não se adivinha.
  assert.deepEqual(modulosDesligadosDoAmbiente('Prova=taxi,=comboio,prova,prova=Táxi'), {});
  assert.deepEqual(modulosDesligadosDoAmbiente(''), {});
});

test('sem variável no ambiente, nada se desliga', () => {
  // ISTO ESTAVA A TESTAR O AMBIENTE DE QUEM CORRE, e não a função.
  //
  // Era `modulosDesligadosDoAmbiente(undefined)`, e o parâmetro tem por
  // omissão `process.env.PARAGEM_MODULOS_DESLIGADOS`: passar `undefined` não
  // diz «sem variável», cai na omissão e LÊ O AMBIENTE. Passava por a variável
  // nunca estar definida no processo dos testes — e no dia em que passou a
  // estar, o teste reprovou a dizer que a função estava mal.
  //
  // A pergunta que ele quer fazer só se responde tirando a variável.
  const antes = process.env.PARAGEM_MODULOS_DESLIGADOS;
  delete process.env.PARAGEM_MODULOS_DESLIGADOS;
  try {
    assert.deepEqual(modulosDesligadosDoAmbiente(), {});
  } finally {
    if (antes !== undefined) process.env.PARAGEM_MODULOS_DESLIGADOS = antes;
  }
});

test('o mesmo identificador duas vezes soma, sem repetir', () => {
  assert.deepEqual(modulosDesligadosDoAmbiente('prova=taxi,prova=taxi+expresso'), {
    prova: ['taxi', 'expresso'],
  });
});

test('os modos ligados são os declarados menos os desligados, pela ordem da região', () => {
  assert.deepEqual(modosLigados(['autocarro', 'bicicleta', 'taxi'], ['taxi']), [
    'autocarro',
    'bicicleta',
  ]);
  // Desligar o que a região não declara não acrescenta nada.
  assert.deepEqual(modosLigados(['autocarro'], ['comboio']), ['autocarro']);
});

test('os pontos de um módulo desligado saem do mapa; os sítios ficam sempre', () => {
  const pontos = [
    { tipo: 'paragem', nome: 'a' },
    { tipo: 'estacao', nome: 'b' },
    { tipo: 'taxi', nome: 'c' },
    { tipo: 'sitio', nome: 'd' },
  ];
  assert.deepEqual(
    semModulosDesligados(pontos, ['comboio', 'taxi']).map((p) => p.nome),
    ['a', 'd'],
  );
  assert.deepEqual(
    semModulosDesligados(pontos, ['sitio']).map((p) => p.nome),
    ['a', 'b', 'c', 'd'],
  );
  assert.deepEqual(semModulosDesligados(pontos, []).length, 4);
});
