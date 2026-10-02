/**
 * A marca da região como o sítio a lê (`lib/marca.ts`): a tinta medida outra
 * vez, e a do §6 quando os dados não trazem marca ou trazem uma estragada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COR_DO_PRODUTO, marcaDaRegiao, nomesDaAssinatura, tintaPara } from '../src/lib/marca.ts';

test('a tinta é a que se lê melhor, e nenhuma quando nenhuma chega', () => {
  assert.equal(tintaPara('#0a5c7a'), '#ffffff');
  assert.equal(tintaPara('#f2a541'), '#102c3f');
  // Um laranja médio não dá 4,5:1 nem com branco nem com o azul-escuro.
  assert.equal(tintaPara('#d9643a'), null);
});

test('sem marca nos dados, a faixa é a do produto, sem logótipo', () => {
  const m = marcaDaRegiao({});
  assert.deepEqual(m, {
    cor: COR_DO_PRODUTO,
    tinta: '#ffffff',
    logotipo: null,
    logotipoProporcao: null,
    propria: false,
  });
});

test('uma marca estragada não pinta texto ilegível: fica a do produto', () => {
  // A tinta que veio escrita não conta — mede-se outra vez.
  const m = marcaDaRegiao({ marca: { cor: '#d9643a', tinta: '#ffffff', propria: true } });
  assert.equal(m.cor, COR_DO_PRODUTO);
  assert.equal(m.tinta, '#ffffff');
  assert.equal(m.propria, false);
});

test('o logótipo só vale se for um caminho do armazém da região', () => {
  const bom = marcaDaRegiao({
    marca: { cor: '#f2a541', logotipo: 'marca/logotipo-bfcf94e878.svg', logotipo_proporcao: 2 },
  });
  assert.equal(bom.logotipo, 'marca/logotipo-bfcf94e878.svg');
  assert.equal(bom.logotipoProporcao, 2);
  for (const mau of ['https://exemplo.org/a.svg', '../segredo.svg', 'marca/a.svg?x=1']) {
    assert.equal(marcaDaRegiao({ marca: { logotipo: mau } }).logotipo, null, mau);
  }
});

test('a assinatura é a rede e o que ela é — ou só o que ela é', () => {
  assert.deepEqual(nomesDaAssinatura({ rede: { nome: 'Rede Serena' }, de: 'da Vila Serena' }), {
    principal: 'Rede Serena',
    secundario: 'Transportes da Vila Serena',
  });
  assert.deepEqual(nomesDaAssinatura({ rede: {}, de: 'do Vale Serena' }), {
    principal: 'Transportes do Vale Serena',
    secundario: null,
  });
});
