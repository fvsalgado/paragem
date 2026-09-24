/**
 * O que uma ligação partilhada leva consigo: o cartão, e para onde ele aponta.
 *
 * Um `og:image` errado não dá erro em lado nenhum — dá uma ligação sem
 * imagem no WhatsApp, e ninguém sabe porquê. Por isso cada endereço se
 * afirma aqui: absoluto, com a origem da região, pelo caminho PÚBLICO (nunca
 * com o segmento interno), e nenhum quando não se sabe a origem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTAO,
  CARTAO_DA_REGIAO,
  CARTAO_DO_PRODUTO,
  cartaoDaParagem,
  origemAbsoluta,
  partilha,
} from '../src/lib/partilha.ts';
import { FICHEIROS_DE_RAIZ, decidir, type Mapa } from '../src/lib/regiao-host.ts';

const MAPA: Mapa = {
  dominios: { 'prova.exemplo.pt': 'prova' },
  redirecionamentos: {},
  origens: { prova: 'prova.exemplo.pt' },
};

test('o cartão aponta para a origem da região, pelo caminho público', () => {
  const m = partilha('https://prova.exemplo.pt', CARTAO_DA_REGIAO, 'a região');
  const imagens = m.openGraph?.images as { url: string; width: number; height: number }[];
  assert.equal(imagens[0].url, 'https://prova.exemplo.pt/cartao.png');
  assert.equal(imagens[0].width, CARTAO.largura);
  assert.equal(imagens[0].height, CARTAO.altura);
  assert.deepEqual(m.twitter, { card: 'summary_large_image' });
  // Sem título nem descrição: o Next usa os da página, e o cartão de uma
  // linha partilhada diz o nome da linha e não o da região.
  assert.equal((m.openGraph as { title?: string }).title, undefined);
});

test('sem origem absoluta não se promete imagem nenhuma', () => {
  for (const origem of [null, undefined, '', '/', 'prova.exemplo.pt']) {
    const m = partilha(origem, CARTAO_DA_REGIAO, 'a região');
    assert.equal((m.openGraph as { images?: unknown }).images, undefined, String(origem));
    assert.deepEqual(m.twitter, { card: 'summary' });
  }
  assert.equal(origemAbsoluta('http://127.0.0.1:4321/'), 'http://127.0.0.1:4321');
});

test('o cartão de uma paragem vai pelo mesmo identificador seguro da página', () => {
  // Há identificadores com vírgulas e pontos; o endereço não os pode ter.
  assert.equal(cartaoDaParagem('p_1'), '/cartao/paragens/p_1.png');
  assert.equal(cartaoDaParagem('1.2,3 x'), '/cartao/paragens/1-2-3-x.png');
});

test('o cartão da região vai para dentro dela; o da montra passa em qualquer anfitrião', () => {
  assert.deepEqual(decidir('prova.exemplo.pt', CARTAO_DA_REGIAO, MAPA), {
    tipo: 'reescrever',
    para: '/prova/cartao.png',
  });
  assert.deepEqual(decidir('prova.exemplo.pt', cartaoDaParagem('p_1'), MAPA), {
    tipo: 'reescrever',
    para: '/prova/cartao/paragens/p_1.png',
  });
  // A lista fechada do middleware repete o endereço à letra: se um mudar e o
  // outro não, o cartão da montra passa a 404.
  assert.ok(
    (FICHEIROS_DE_RAIZ as readonly string[]).includes(CARTAO_DO_PRODUTO),
    'o cartão da montra não está na lista fechada do middleware',
  );
  for (const host of ['prova.exemplo.pt', 'paragem.pt', null]) {
    assert.deepEqual(decidir(host, CARTAO_DO_PRODUTO, MAPA), { tipo: 'passar' });
  }
});
