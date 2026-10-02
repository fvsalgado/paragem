/**
 * A procura perdoa uma letra — e só uma.
 *
 * É o erro de quem escreve com o polegar. Mais do que uma começa a acertar em
 * nomes que não têm nada a ver, e a procura deixa de ser de confiança.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aUmaLetra, simples } from '../src/lib/letras.ts';

test('uma letra a menos, a mais ou trocada', () => {
  assert.ok(aUmaLetra(simples('Ribeora'), simples('Ribeira')), 'trocada');
  assert.ok(aUmaLetra(simples('Ribera'), simples('Ribeira')), 'a menos');
  assert.ok(aUmaLetra(simples('Ribeirra'), simples('Ribeira')), 'a mais');
  assert.ok(aUmaLetra('serra', 'serra'), 'igual');
});

test('duas letras já não', () => {
  assert.equal(aUmaLetra('corvlnho', 'corvalinho'), false);
  assert.equal(aUmaLetra('serra', 'terre'), false);
  assert.equal(aUmaLetra('a', 'abc'), false);
});

test('sem acentos nem maiúsculas, antes de comparar', () => {
  assert.equal(simples('Sável'), 'savel');
  assert.ok(aUmaLetra(simples('savell'), simples('Sável')));
});
