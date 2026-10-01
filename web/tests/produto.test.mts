/**
 * O que é do produto: o contacto, a morada, e o mapa do sítio.
 *
 * Cada teste é uma promessa que a página do produto faz a quem decide: o
 * endereço para onde se escreve existe e é o publicado, e o mapa do sítio de
 * uma região só lista as páginas que ela tem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTACTO_PUBLICADO,
  contactoDoProduto,
  correioPara,
  origemDoProduto,
} from '../src/lib/produto.ts';
import { caminhosDaRegiao, mapaDoSitio } from '../src/lib/mapa-do-sitio.ts';

test('a omissão do contacto é a que o repositório já publica', () => {
  // O AUTORIA.md é o sítio canónico da autoria, e o SECURITY.md manda para lá
  // as vulnerabilidades. Se um deles mudar de endereço e este não, a página
  // passa a mandar escrever para uma caixa que já ninguém lê.
  for (const ficheiro of ['../AUTORIA.md', '../SECURITY.md']) {
    const texto = readFileSync(new URL(ficheiro, new URL('..', import.meta.url)), 'utf8');
    assert.ok(texto.includes(CONTACTO_PUBLICADO), `${ficheiro} publica ${CONTACTO_PUBLICADO}`);
  }
});

test('o contacto vem do ambiente, e uma variável que não é um endereço não chega à página', () => {
  assert.equal(contactoDoProduto('  ola@exemplo.pt '), 'ola@exemplo.pt');
  assert.equal(contactoDoProduto(undefined), CONTACTO_PUBLICADO);
  assert.equal(contactoDoProduto(''), CONTACTO_PUBLICADO);
  for (const mal of [
    'mailto:ola@exemplo.pt',
    'Ana <ola@exemplo.pt>',
    'ola@exemplo',
    'ola exemplo.pt',
  ]) {
    assert.equal(contactoDoProduto(mal), CONTACTO_PUBLICADO, mal);
  }
});

test('o mailto leva o assunto com espaços de verdade, e não com «+»', () => {
  assert.equal(
    correioPara('Pedido de proposta do Paragem.pt', 'ola@exemplo.pt'),
    'mailto:ola@exemplo.pt?subject=Pedido%20de%20proposta%20do%20Paragem.pt',
  );
  // Os acentos vão codificados: há clientes de correio que estragam o assunto cru.
  assert.match(correioPara('Marcar uma demonstração', 'a@b.pt'), /demonstra%C3%A7%C3%A3o$/);
});

test('a morada do produto só vale inteira e em http(s)', () => {
  assert.equal(origemDoProduto('https://www.exemplo.pt/')?.origin, 'https://www.exemplo.pt');
  assert.equal(origemDoProduto('http://127.0.0.1:4321')?.host, '127.0.0.1:4321');
  for (const mal of [undefined, '', '/', 'www.exemplo.pt', 'ftp://exemplo.pt']) {
    assert.equal(origemDoProduto(mal), null, String(mal));
  }
});

const INDICES = {
  modos: ['autocarro', 'bicicleta'],
  paragens: [
    { id: 'pa_mercado', nome: 'Pedra Alta (Mercado)' },
    { id: 'rc:ponte', nome: 'Ribeira do Corvo (Ponte)' },
    { id: 'n1', nome: '1.º de Maio' },
  ],
  linhas: [{ id: 'RA1' }],
  concelhos: [{ id: 'pa' }],
  estacoes: [{ id: 'nao-entra' }],
  aPedido: null,
  paginasDeModo: ['bicicleta'],
};

test('o mapa do sítio de uma região lista as páginas que ela tem, e só essas', () => {
  const c = caminhosDaRegiao(INDICES);
  for (const esperado of [
    '/',
    '/viagem/',
    '/rede/',
    '/rede/paragens/',
    '/rede/paragens/letra/p/',
    '/rede/paragens/letra/numero/',
    '/rede/paragens/pa_mercado/',
    // O identificador vai como a página o procura: pelo `seguro()`.
    '/rede/paragens/rc-ponte/',
    '/rede/linhas/RA1/',
    '/rede/concelhos/pa/',
    '/rede/tarifario/',
    '/modos/bicicleta/',
    '/avisos/',
    '/dados-abertos/',
    '/acessibilidade/',
    '/privacidade/',
  ]) {
    assert.ok(c.includes(esperado), `falta ${esperado}`);
  }
  // Sem comboio não há estações, e sem transporte a pedido não há a página dele:
  // um mapa do sítio com um 404 lá dentro ensina o motor de busca a não confiar.
  assert.ok(!c.some((x) => x.startsWith('/rede/estacoes/')), 'estações sem comboio');
  assert.ok(!c.some((x) => x.startsWith('/a-pedido/')), 'a pedido sem a pedido');
  assert.equal(new Set(c).size, c.length, 'sem repetidos');
});

test('sem autocarros, nem paragens nem linhas; com comboio e a pedido, as páginas deles', () => {
  const c = caminhosDaRegiao({
    ...INDICES,
    modos: ['comboio', 'a-pedido'],
    aPedido: [{ id: 'grupo-1' }],
    paginasDeModo: [],
  });
  assert.ok(!c.some((x) => x.startsWith('/rede/paragens/') || x.startsWith('/rede/linhas/')));
  assert.ok(c.includes('/rede/estacoes/nao-entra/'));
  assert.ok(c.includes('/a-pedido/') && c.includes('/a-pedido/grupo-1/'));
});

test('o XML leva moradas inteiras, codificadas e escapadas', () => {
  const xml = mapaDoSitio('https://regiao.exemplo.pt/', ['/', '/rede/linhas/A&B/', '/rede/ç/']);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns=/);
  assert.match(xml, /<loc>https:\/\/regiao\.exemplo\.pt\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/regiao\.exemplo\.pt\/rede\/linhas\/A&amp;B\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/regiao\.exemplo\.pt\/rede\/%C3%A7\/<\/loc>/);
});
