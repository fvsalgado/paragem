/**
 * A pré-visualização, frase a frase: quando é que o sítio se diz em
 * pré-visualização, e que endereço de produção representa cada endereço com a
 * marca. As regras do Host com a marca estão em `regiao-host.test.mts`, ao
 * lado das outras.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emPreVisualizacao, semAMarcaDePre } from '../src/lib/pre-visualizacao.ts';

test('a pré-visualização é o que a plataforma diz, ou o que se liga à mão', () => {
  assert.equal(emPreVisualizacao('preview', undefined), true);
  assert.equal(emPreVisualizacao(undefined, '1'), true);
  assert.equal(emPreVisualizacao('production', undefined), false);
  assert.equal(emPreVisualizacao('development', undefined), false);
  assert.equal(emPreVisualizacao(undefined, undefined), false);
  // Só «1» liga à mão: um «0» ou um «sim» esquecidos não ligam nada.
  assert.equal(emPreVisualizacao(undefined, '0'), false);
  assert.equal(emPreVisualizacao(undefined, 'sim'), false);
});

test('a marca tira-se onde estiver, e só ela', () => {
  assert.equal(semAMarcaDePre('pre.exemplo.pt'), 'exemplo.pt');
  assert.equal(semAMarcaDePre('prova.pre.exemplo.pt'), 'prova.exemplo.pt');
  assert.equal(semAMarcaDePre('www.prova.pre.exemplo.pt'), 'www.prova.exemplo.pt');
});

test('sem a marca como rótulo inteiro, não há marca', () => {
  assert.equal(semAMarcaDePre('prova.exemplo.pt'), null);
  assert.equal(semAMarcaDePre('prev.exemplo.pt'), null);
  assert.equal(semAMarcaDePre('pre-prova.exemplo.pt'), null);
  assert.equal(semAMarcaDePre('prepre.exemplo.pt'), null);
});

test('a marca precisa de um domínio inteiro à direita', () => {
  assert.equal(semAMarcaDePre('pre.pt'), null);
  assert.equal(semAMarcaDePre('prova.pre'), null);
  assert.equal(semAMarcaDePre('pre'), null);
});
