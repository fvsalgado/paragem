/**
 * A rede no mapa lê-se de longe: os corredores separam-se dos ramais, e o
 * contorno não faz um novelo.
 *
 * Os limiares eram os de uma cidade (20 e 6 viagens por dia útil). Numa
 * região do interior, a mediana da rede de autocarro é de 2 viagens por dia, e
 * quase toda ela caía na classe fina — com um contorno claro à volta de cada
 * traço, à escala da região era um novelo azul.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contraste, MINIMO_DE_UM_TRACO } from '../src/lib/cor.ts';
import {
  CONTORNO_DESDE,
  SUPERFICIES_DO_MAPA,
  classeDasViagens,
  corDaRede,
  corDoRamal,
  FUNDO_DO_MAPA,
  haloDoContorno,
  larguraDoTraco,
  type TemaDoMapa,
} from '../src/lib/estilo-mapa.ts';

const TEMAS: TemaDoMapa[] = ['claro', 'escuro'];
const autocarro = (viagens: number | null) => ({ modo: 'autocarro', viagens });

test('as classes contam como uma rede do interior', () => {
  assert.equal(classeDasViagens(null), 0);
  assert.equal(classeDasViagens(0), 0);
  assert.equal(classeDasViagens(1), 1);
  assert.equal(classeDasViagens(3), 1);
  assert.equal(classeDasViagens(4), 2);
  assert.equal(classeDasViagens(11), 2);
  assert.equal(classeDasViagens(12), 3);
  assert.equal(classeDasViagens(40), 3);
});

test('à escala da região, um corredor tem pelo menos o triplo da largura de um ramal', () => {
  assert.ok(larguraDoTraco(autocarro(12), 8) >= 3 * larguraDoTraco(autocarro(2), 8));
  // E as classes vizinhas distinguem-se: ao olho, 1 e 0,6 px eram o mesmo fio.
  assert.ok(larguraDoTraco(autocarro(4), 8) >= 1.8 * larguraDoTraco(autocarro(2), 8));
});

test('de perto, nenhum traço passa dos 7 px: a forma vem do traçado a 8 m', () => {
  for (const viagens of [null, 0, 2, 8, 30]) {
    assert.ok(larguraDoTraco(autocarro(viagens), 16) <= 7);
  }
  assert.ok(larguraDoTraco({ modo: 'comboio', viagens: 40 }, 16) <= 7);
});

test('o contorno da rede nasce com o zoom', () => {
  for (const z of [7, 8, CONTORNO_DESDE]) assert.equal(haloDoContorno(z), 0);
  assert.equal(haloDoContorno(12), 2);
  assert.equal(haloDoContorno(16), 2);
  // De longe, a largura do contorno é a da linha: não lhe acrescenta nada.
  assert.equal(larguraDoTraco(autocarro(2), 8, true), larguraDoTraco(autocarro(2), 8));
  assert.equal(larguraDoTraco(autocarro(2), 14, true), larguraDoTraco(autocarro(2), 14) + 2);
});

test('o comboio fica como estava: os limiares, as larguras e o contorno de antes', () => {
  const comboio = (viagens: number | null) => ({ modo: 'comboio', viagens });
  assert.equal(larguraDoTraco(comboio(0), 8), 0.6);
  assert.equal(larguraDoTraco(comboio(5), 11), 1.2);
  assert.equal(larguraDoTraco(comboio(6), 14), 3.5);
  assert.equal(larguraDoTraco(comboio(19), 16), 5);
  assert.equal(larguraDoTraco(comboio(20), 8), 1.5);
  assert.equal(larguraDoTraco(comboio(20), 8, true), 3.5);
});

test('o tom dos ramais recua, e continua a ler-se sobre as superfícies do mapa', () => {
  for (const tema of TEMAS) {
    for (const modo of ['autocarro', 'urbano-municipal']) {
      const ramal = corDoRamal(tema, modo);
      const inteira = corDaRede(tema, modo);
      assert.ok(
        contraste(ramal, FUNDO_DO_MAPA[tema]) < contraste(inteira, FUNDO_DO_MAPA[tema]),
        `${tema}/${modo}: o ramal não recua`,
      );
      for (const superficie of SUPERFICIES_DO_MAPA[tema]) {
        const c = contraste(ramal, superficie);
        assert.ok(
          c >= MINIMO_DE_UM_TRACO,
          `${tema}/${modo}: ${ramal} sobre ${superficie} dá ${c.toFixed(2)}:1`,
        );
      }
    }
  }
});
