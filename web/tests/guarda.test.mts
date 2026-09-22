/**
 * O que as barreiras do painel prometem, frase a frase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMINHO_DA_ENTRADA,
  barreiraDoLayout,
  caminhoDaEntrada,
  destinoSeguro,
  ehAEntrada,
  ehDoPainel,
} from '../src/lib/painel/guarda.ts';

test('o painel é /admin e o que está debaixo — não /administracao nem uma região', () => {
  assert.equal(ehDoPainel('/admin'), true);
  assert.equal(ehDoPainel('/admin/'), true);
  assert.equal(ehDoPainel('/admin/auditoria/'), true);
  assert.equal(ehDoPainel('/administracao/'), false);
  assert.equal(ehDoPainel('/prova/admin/'), false);
  assert.equal(ehDoPainel('/'), false);
});

test('a entrada é a mesma com e sem barra no fim', () => {
  assert.equal(ehAEntrada('/admin/entrar'), true);
  assert.equal(ehAEntrada('/admin/entrar/'), true);
  assert.equal(ehAEntrada('/admin/'), false);
});

test('guarda o caminho a que a pessoa ia', () => {
  assert.equal(
    caminhoDaEntrada('/admin/auditoria/'),
    '/admin/entrar/?destino=%2Fadmin%2Fauditoria%2F',
  );
  assert.equal(
    caminhoDaEntrada('/admin/auditoria'),
    '/admin/entrar/?destino=%2Fadmin%2Fauditoria%2F',
  );
});

// O painel é para onde a entrada vai dar; repeti-lo no destino não acrescenta nada.
test('não guarda destino para a raiz do painel', () => {
  assert.equal(caminhoDaEntrada('/admin'), CAMINHO_DA_ENTRADA);
  assert.equal(caminhoDaEntrada('/admin/'), CAMINHO_DA_ENTRADA);
});

test('não manda a entrada para si própria', () => {
  assert.equal(caminhoDaEntrada(CAMINHO_DA_ENTRADA), CAMINHO_DA_ENTRADA);
});

test('só se volta para dentro do painel — um destino para fora era um redirecionador aberto', () => {
  assert.equal(destinoSeguro('/admin/auditoria/'), '/admin/auditoria/');
  assert.equal(destinoSeguro('/prova/'), '/admin/');
  assert.equal(destinoSeguro('//outro.exemplo.pt/admin/'), '/admin/');
  assert.equal(destinoSeguro('https://outro.exemplo.pt/'), '/admin/');
  assert.equal(destinoSeguro(undefined), '/admin/');
});

test('o layout deixa passar quem tem sessão', () => {
  assert.equal(barreiraDoLayout(true, '/admin/auditoria/'), null);
});

test('o layout barra uma leitura sem sessão, e leva o destino consigo', () => {
  assert.equal(
    barreiraDoLayout(false, '/admin/auditoria/'),
    '/admin/entrar/?destino=%2Fadmin%2Fauditoria%2F',
  );
});

// O erro que esta função existe para não se cometer: o layout envolve também
// a página de entrada, e barrá-la mandava-a para si própria.
test('o layout nunca barra a própria página de entrada', () => {
  assert.equal(barreiraDoLayout(false, '/admin/entrar/'), null);
  assert.equal(barreiraDoLayout(false, '/admin/entrar'), null);
});

// Sem cabeçalho o layout não sabe onde está. Barrar às cegas era arriscar o
// ciclo; nesse cenário quem barra é o middleware.
test('o layout não barra quando o middleware não disse nada', () => {
  assert.equal(barreiraDoLayout(false, null), null);
});
