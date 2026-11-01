/**
 * De quando é o documento de onde saem os horários — o que ele próprio diz.
 *
 * Uma brochura de 2017 guardada em 2026 não é «de 2026»: a página diz a data
 * de conteúdo, ou que o documento não a diz, e nunca a de obtenção no lugar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseDoConteudo } from '../src/lib/formato.ts';

test('com o dia, diz desde quando vale', () => {
  assert.equal(
    fraseDoConteudo({ em_vigor_desde: '2020-12-02', texto: null }, 'o cartaz'),
    'Em vigor desde 2/12/2020, diz o cartaz.',
  );
});

test('sem o dia, diz o que o documento escreve', () => {
  assert.equal(
    fraseDoConteudo(
      { em_vigor_desde: null, texto: 'novo circuito a partir de maio de 2022' },
      'o documento',
    ),
    'O documento não diz o dia em que entra em vigor: novo circuito a partir de maio de 2022.',
  );
});

test('sem nada, diz que não diz — e não inventa uma data', () => {
  assert.equal(
    fraseDoConteudo({ em_vigor_desde: null, texto: null }, 'o cartaz'),
    'O cartaz não diz desde quando vale.',
  );
  assert.equal(fraseDoConteudo(undefined, 'o cartaz'), null);
});
