/**
 * O que o painel calcula sem base: o resumo dos módulos e o antes/depois de
 * uma ação.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diferenca, nomeDaAcao } from '../src/lib/painel/auditoria.ts';
import { MODULOS, ehModulo, resumoDosModulos } from '../src/lib/painel/modulos.ts';

test('são os sete modos do produto, pela ordem da grelha', () => {
  assert.deepEqual(
    [...MODULOS],
    ['autocarro', 'a-pedido', 'comboio', 'urbano-municipal', 'bicicleta', 'expresso', 'taxi'],
  );
  assert.equal(ehModulo('comboio'), true);
  assert.equal(ehModulo('teleferico'), false);
});

test('o resumo diz o que o painel desligou, e não conta modos que a região não tem', () => {
  assert.equal(resumoDosModulos([]), 'nenhum desligado');
  assert.equal(resumoDosModulos(['comboio']), 'desligado: comboio');
  assert.equal(resumoDosModulos(['expresso', 'comboio']), 'desligados: comboio e expresso');
  // O que não é módulo não conta — nem rebenta.
  assert.equal(resumoDosModulos(['teleferico']), 'nenhum desligado');
});

test('a diferença só lista o que mudou', () => {
  assert.deepEqual(diferenca({ is_enabled: true }, { is_enabled: false }), [
    { campo: 'is_enabled', antes: 'true', depois: 'false' },
  ]);
  assert.deepEqual(diferenca({ domain: 'a.pt', name: 'X' }, { domain: 'b.pt', name: 'X' }), [
    { campo: 'domain', antes: 'a.pt', depois: 'b.pt' },
  ]);
});

test('sem antes, tudo o que há é novo; sem nada, não há linhas', () => {
  assert.deepEqual(diferenca(null, { domain: 'a.pt' }), [
    { campo: 'domain', antes: null, depois: 'a.pt' },
  ]);
  assert.deepEqual(diferenca(null, null), []);
  assert.deepEqual(diferenca(undefined, undefined), []);
});

test('as ações têm nome de gente', () => {
  assert.equal(nomeDaAcao('module.disable'), 'desligou um modo');
  assert.equal(nomeDaAcao('qualquer.coisa'), 'qualquer.coisa');
});
