/**
 * Os nomes de um feed de expressos, como se dizem em português
 * (`lib/expressos.ts`).
 *
 * A página dos expressos dizia «Coimbra – Fatima – Lisboa BB», «Sete Rios» e
 * «Luxembourg» (auditoria de 1/11/2026): a língua e os acentos do feed, e um
 * código de variante que ninguém sabe ler.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emPortugues, percursoEmPortugues } from '../src/lib/expressos.ts';

test('um percurso lê-se em português, sem o ponto técnico nem o código de variante', () => {
  assert.equal(percursoEmPortugues('Coimbra - Fatima - Lisbon BB'), 'Coimbra – Fátima – Lisboa');
  assert.equal(percursoEmPortugues('Coimbra - Fatima - Lisbon'), 'Coimbra – Fátima – Lisboa');
  assert.equal(
    percursoEmPortugues('Lisbon - Viseu - Hub - Paris - Luxembourg'),
    'Lisboa – Viseu – Paris – Luxemburgo',
  );
  assert.equal(
    percursoEmPortugues('Braga - Coimbra - Sete Rios'),
    'Braga – Coimbra – Lisboa (Sete Rios)',
  );
  // Um nome que acaba em três maiúsculas é um nome, e fica.
  assert.equal(
    percursoEmPortugues('Reims - Champagne-Ardenne TGV'),
    'Reims – Champagne-Ardenne TGV',
  );
});

test('uma paragem fica com o nome do operador, só com a terra em português', () => {
  assert.equal(emPortugues('Fatima (Bus Station)'), 'Fátima (Bus Station)');
  assert.equal(emPortugues('Lisbon Sete Rios (Terminal)'), 'Lisboa Sete Rios (Terminal)');
  assert.equal(emPortugues('Porto (Bus Station)'), 'Porto (Bus Station)');
});
