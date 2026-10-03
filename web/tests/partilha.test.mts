/**
 * Os cartões de partilha (`lib/partilha.ts`), sem o desenho: os endereços, as
 * contas de texto e qual imagem vai em que página. O desenho prova-se no
 * navegador (`metadados.spec.ts`), onde há um servidor para o pedir.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTAO,
  CARTAO_DA_REGIAO,
  cartaoDaLinha,
  cartaoDaParagem,
  corpoDoTitulo,
  encurtar,
  idDoCartao,
} from '../src/lib/partilha.ts';
import { IMAGEM_DE_PARTILHA, imagemDaRegiao } from '../src/lib/metadados.ts';
import { seguro } from '../src/lib/formato.ts';

test('o cartão tem a medida que as redes recortam', () => {
  assert.deepEqual(CARTAO, { largura: 1200, altura: 630 });
});

test('o endereço de um cartão volta a dar o identificador do ficheiro da paragem ou da linha', () => {
  for (const id of ['pa_mercado', 'tmr:1234', 'linha 1.2', 'ÁGUA-1']) {
    for (const endereco of [cartaoDaParagem(id), cartaoDaLinha(id)]) {
      const segmento = endereco.split('/').pop()!;
      // É o mesmo `seguro` que dá o nome ao ficheiro no armazém.
      assert.equal(idDoCartao(segmento), seguro(id), endereco);
    }
  }
  assert.equal(cartaoDaParagem('pa:1'), '/cartao/paragens/pa-1.png');
  assert.equal(cartaoDaLinha('L1'), '/cartao/linhas/L1.png');
});

test('um endereço torto não chega ao armazém', () => {
  for (const segmento of [
    'pa-1',
    'pa-1.jpg',
    '.png',
    '../regiao.png',
    'pa 1.png',
    'pa-1.png.png',
  ]) {
    assert.equal(idDoCartao(segmento), null, segmento);
  }
});

test('encurtar corta na última palavra que cabe, e só quando é preciso', () => {
  assert.equal(encurtar('Pedra Alta (Mercado)', 40), 'Pedra Alta (Mercado)');
  assert.equal(
    encurtar('Avenida da Liberdade, junto ao Mercado Municipal', 30),
    'Avenida da Liberdade, junto…',
  );
  // Sem espaço que sirva, corta a direito em vez de deixar quase nada.
  assert.equal(encurtar('Paragemcomumnomesemespacosnenhum', 12), 'Paragemcomum…');
});

test('o título encolhe com o comprimento, e um título mais curto nunca sai mais pequeno', () => {
  let anterior = Infinity;
  for (let n = 1; n <= 90; n++) {
    const corpo = corpoDoTitulo('x'.repeat(n));
    assert.ok(corpo <= anterior, `${n} caracteres: ${corpo} depois de ${anterior}`);
    anterior = corpo;
  }
  assert.equal(corpoDoTitulo('Pedra Alta'), 88);
  assert.equal(corpoDoTitulo('x'.repeat(90)), 48);
});

test('uma região leva o cartão dela, e não a imagem do produto', () => {
  const comRede = imagemDaRegiao({ rede: { nome: 'Rede Alta' }, de: 'da Serra da Pedra Alta' });
  assert.equal(comRede.url, CARTAO_DA_REGIAO);
  assert.notEqual(comRede.url, IMAGEM_DE_PARTILHA.url);
  // O texto alternativo diz o que o cartão escreve.
  assert.equal(comRede.alt, 'Rede Alta: Transportes da Serra da Pedra Alta');
  const semRede = imagemDaRegiao({ rede: {}, de: 'do Baixo Sável' });
  assert.equal(semRede.alt, 'Transportes do Baixo Sável');
});

test('com o endereço declarado, o cartão escreve-o como logótipo, e o texto alternativo também', () => {
  const r = { rede: { nome: 'Rede Alta' }, de: 'da Serra da Pedra Alta' };
  assert.equal(
    imagemDaRegiao({ ...r, dominio: 'prova.paragem.pt' }).alt,
    'prova.paragem.pt: Transportes da Serra da Pedra Alta',
  );
  assert.equal(
    imagemDaRegiao({ rede: {}, de: 'do Baixo Sável', dominio: 'sem-rede.paragem.pt' }).alt,
    'sem-rede.paragem.pt: Transportes do Baixo Sável',
  );
  // Um endereço que o feixe não desenha não vai no cartão, nem no texto dele.
  assert.equal(
    imagemDaRegiao({ ...r, dominio: 'são.paragem.pt' }).alt,
    'Rede Alta: Transportes da Serra da Pedra Alta',
  );
});
