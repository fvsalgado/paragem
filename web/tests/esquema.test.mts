/**
 * O nome de uma ponta do esquema da linha não fica atravessado pelo traço
 * (auditoria de 1/11/2026, #13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotuloDaPonta, type Caixa } from '../src/lib/esquema.ts';

const cruzaAlgum = (c: Caixa, t: number[][]) =>
  t.some(([x, y]) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);

test('um traço que sai da ponta para a direita leva o nome para a esquerda ou para fora dele', () => {
  // A ponta em (150, 50), e o traço a seguir para a direita.
  const t = [
    [150, 50],
    [200, 50],
    [250, 50],
  ];
  const r = rotuloDaPonta([150, 50], 'Terminal', t, 300, 100);
  assert.equal(cruzaAlgum(r.caixa, t), false);
  assert.notEqual(r.ancora, 'start', 'à direita era em cima do traço');
});

test('o nome fica dentro do desenho, mesmo encostado à borda', () => {
  const t = [
    [5, 50],
    [5, 90],
  ];
  const r = rotuloDaPonta([5, 50], 'Uma ponta com nome comprido', t, 300, 100);
  assert.ok(r.caixa.x0 >= 0 && r.caixa.x1 <= 300 && r.caixa.y0 >= 0 && r.caixa.y1 <= 100);
});

test('o segundo nome não tapa o primeiro', () => {
  const t = [
    [100, 50],
    [110, 50],
  ];
  const a = rotuloDaPonta([100, 50], 'Primeira', t, 300, 100);
  const b = rotuloDaPonta([110, 50], 'Segunda', t, 300, 100, [a.caixa]);
  const sobrepoem =
    a.caixa.x0 < b.caixa.x1 &&
    b.caixa.x0 < a.caixa.x1 &&
    a.caixa.y0 < b.caixa.y1 &&
    b.caixa.y0 < a.caixa.y1;
  assert.equal(sobrepoem, false);
});
