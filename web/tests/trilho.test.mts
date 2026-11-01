/**
 * O trilho das páginas da rede: os níveis de cima, e só esses.
 *
 * Nas páginas fundas não havia caminho de volta senão o botão do navegador
 * (auditoria de 1/11/2026, #84 e #102).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degrausDoTrilho } from '../src/lib/trilho.ts';

const nomes = (s: string[]) => degrausDoTrilho(s).map((d) => `${d.nome} ${d.caminho}`);

test('na própria rede não há trilho', () => {
  assert.deepEqual(degrausDoTrilho([]), []);
});

test('numa lista, o nível de cima é a rede', () => {
  assert.deepEqual(nomes(['paragens']), ['A rede /rede/']);
  assert.deepEqual(nomes(['tarifario']), ['A rede /rede/']);
});

test('numa ficha, a rede e a lista dela — a página em que se está é o título', () => {
  assert.deepEqual(nomes(['paragens', 'g19-407']), ['A rede /rede/', 'Paragens /rede/paragens/']);
  assert.deepEqual(nomes(['linhas', '42']), ['A rede /rede/', 'Linhas /rede/linhas/']);
  assert.deepEqual(nomes(['estacoes', 'x']), ['A rede /rede/', 'Estações /rede/estacoes/']);
  assert.deepEqual(nomes(['concelhos', 'serra']), ['A rede /rede/', 'Concelhos /rede/concelhos/']);
});

test('as páginas de uma inicial voltam à lista das paragens', () => {
  assert.deepEqual(nomes(['paragens', 'letra', 'a']), [
    'A rede /rede/',
    'Paragens /rede/paragens/',
  ]);
});

test('os segmentos que não são caminho não contam', () => {
  assert.deepEqual(nomes(['(grupo)', 'linhas', '__PAGE__']), ['A rede /rede/']);
});
