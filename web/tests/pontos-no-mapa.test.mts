/**
 * Duas ordens que eram uma: a de desenhar e a de mostrar (P2-038, P1-011).
 *
 * A fila dos filtros do mapa abria pelo expresso — o serviço menos usado, e
 * privado — por ser o que se desenha por baixo de tudo. A ordem de desenho é
 * uma decisão de desenho; a de apresentação é uma hierarquia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camadasDe, ordemDeApresentacao } from '../src/lib/pontos-no-mapa.ts';

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
  assert.equal(porModo.autocarro.forma, 'ponto');
  // Duas camadas não se distinguem só pela cor: quem não vê cores vê a forma.
  const pares = new Set(camadasDe(TIPOS).map((c) => `${c.cor}|${c.forma}|${c.fundo}`));
  assert.equal(pares.size, TIPOS.length);
});
