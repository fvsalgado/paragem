/**
 * Duas ordens que eram uma: a de desenhar e a de mostrar (P2-038, P1-011).
 *
 * A fila dos filtros do mapa abria pelo expresso — o serviço menos usado, e
 * privado — por ser o que se desenha por baixo de tudo. A ordem de desenho é
 * uma decisão de desenho; a de apresentação é uma hierarquia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  camadasDe,
  ordemDeApresentacao,
  raioNoZoom,
  rotuloNoMapa,
  zoomDeAparecer,
  ZOOM_DE_SEPARAR,
} from '../src/lib/pontos-no-mapa.ts';
import type { Ponto } from '../src/lib/formato.ts';

const TIPOS = ['expresso', 'paragem', 'taxi', 'bicicleta', 'estacao', 'urbano-municipal'];

test('desenha-se o expresso por baixo, e mostra-se a rede primeiro', () => {
  const camadas = camadasDe(TIPOS);
  assert.equal(camadas[0].modo, 'expresso', 'a ordem de empilhar não mudou');
  assert.deepEqual(
    ordemDeApresentacao(camadas).map((c) => c.modo),
    ['autocarro', 'comboio', 'urbano-municipal', 'bicicleta', 'expresso', 'taxi'],
  );
});

test('a ordem da região manda, e o resto segue a do produto', () => {
  const camadas = camadasDe(TIPOS);
  assert.deepEqual(
    ordemDeApresentacao(camadas, ['comboio', 'autocarro']).map((c) => c.modo),
    ['comboio', 'autocarro', 'urbano-municipal', 'bicicleta', 'expresso', 'taxi'],
  );
});

test('cada camada tem uma forma, e as dos privados são claras', () => {
  const porModo = Object.fromEntries(camadasDe(TIPOS).map((c) => [c.modo, c]));
  assert.equal(porModo.comboio.forma, 'placa');
  assert.equal(porModo.taxi.forma, 'placa');
  assert.equal(porModo.taxi.fundo, '#ffffff');
  assert.equal(porModo.expresso.forma, 'anel');
  // A paragem é um anel desde que a rede se desenha: um disco da cor da rede
  // por cima de um traço da mesma cor desaparecia nele.
  assert.equal(porModo.autocarro.forma, 'anel');
  assert.equal(porModo.bicicleta.forma, 'ponto');
  // Duas camadas não se distinguem só pela cor: quem não vê cores vê a forma.
  const pares = new Set(camadasDe(TIPOS).map((c) => `${c.cor}|${c.forma}|${c.fundo}`));
  assert.equal(pares.size, TIPOS.length);
});

/** Um ponto a `dx`, `dy` metros de uma origem qualquer. */
const ponto = (tipo: string, nome: string, dx: number, dy: number, partidas = 0): Ponto => ({
  tipo,
  nome,
  id: `${tipo}-${nome}-${dx}-${dy}`,
  lat: 39.5 + dy / 110_540,
  lon: -8.5 + dx / (111_320 * Math.cos((39.5 * Math.PI) / 180)),
  concelho: 'c',
  partidas,
});

test('das paragens gémeas, a menos servida espera até se separarem', () => {
  const [ida, volta, longe] = zoomDeAparecer([
    ponto('paragem', 'Largo da Igreja', 0, 0, 80),
    ponto('paragem', 'Largo  da igreja', 20, 0, 30),
    ponto('paragem', 'Largo da Igreja', 500, 0, 30),
  ]);
  assert.equal(ida, 11, 'a mais servida aparece desde o princípio');
  assert.equal(volta, ZOOM_DE_SEPARAR, 'a gémea cede');
  assert.equal(longe, 13, 'a 500 m já não é gémea: só o desbaste de sempre');
});

test('o que está à porta da estação cede-lhe o lugar, e o que está longe não', () => {
  const [estacao, bici, taxi, biciLonge] = zoomDeAparecer([
    ponto('estacao', 'Vila (estação)', 0, 0),
    ponto('bicicleta', 'Doca da estação', 40, 30),
    ponto('taxi', '', -60, 10),
    ponto('bicicleta', 'Doca do largo', 900, 0),
  ]);
  assert.equal(estacao, 9);
  assert.equal(bici, ZOOM_DE_SEPARAR);
  assert.equal(taxi, ZOOM_DE_SEPARAR);
  assert.equal(biciLonge, 12);
});

test('o raio interpola-se como o mapa o faz', () => {
  const [paragem] = camadasDe(['paragem']);
  assert.equal(raioNoZoom(paragem.raios, 10), 2.5);
  assert.equal(raioNoZoom(paragem.raios, 12), 3);
  assert.equal(raioNoZoom(paragem.raios, 16), 7);
  assert.equal(raioNoZoom(paragem.raios, 18), 7);
});

test('a estação escreve-se sem o «(estação)», e o resto como está', () => {
  assert.equal(rotuloNoMapa({ tipo: 'estacao', nome: 'Vila Nova (estação)' }), 'Vila Nova');
  assert.equal(rotuloNoMapa({ tipo: 'estacao', nome: 'Entroncamento' }), 'Entroncamento');
  assert.equal(rotuloNoMapa({ tipo: 'paragem', nome: 'Rua (estação)' }), 'Rua (estação)');
});
