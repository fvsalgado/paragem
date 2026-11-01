/**
 * Cada número da grelha «Por modo» diz de quê (auditoria de 1/11/2026, #109):
 * «Urbano municipal 7», «Bicicleta partilhada 81» — sete quê?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhasDoModo, quantosNoModo } from '../src/lib/por-modo.ts';
import { daRede } from '../src/lib/prosa.ts';
import type { ModoDetalhe } from '../src/lib/formato.ts';

const vazio: ModoDetalhe = {
  modo: '',
  gerido_por: [],
  sistemas: [],
  pontos: [],
  percursos: [],
  paragens: [],
  horarios: [],
  incompleto: false,
  notas: [],
  fontes: [],
  quantos: 0,
};
const ponto = { nome: 'x', lat: 0, lon: 0, concelho: null };
const sem = (s: string) => s.replace(/\s/g, ' ');

test('as bicicletas contam-se em estações, e os táxis em praças', () => {
  const bicicletas = {
    ...vazio,
    sistemas: [
      {
        id: 'a',
        nome: 'A',
        operador: null,
        estado: null,
        disponibilidade_publica: false,
        estacoes: [ponto, ponto],
      },
      {
        id: 'b',
        nome: 'B',
        operador: null,
        estado: null,
        disponibilidade_publica: false,
        estacoes: [ponto],
      },
    ],
  } as ModoDetalhe;
  assert.equal(quantosNoModo('bicicleta', bicicletas), '3 estações');
  assert.equal(quantosNoModo('taxi', { ...vazio, pontos: [ponto] }), '1 praça');
});

test('o mesmo urbano no cartaz e no OpenStreetMap conta uma vez', () => {
  const urbanos = {
    ...vazio,
    horarios: [
      { id: 'v', nome: 'TU — Linha Verde', rede: 'TU' },
      { id: 'a', nome: 'TU — Linha Azul', rede: 'TU' },
      { id: 'x', nome: 'TX', rede: 'TX' },
    ],
    percursos: [
      { nome: 'Linha Verde', rede: 'TU', operador: null, cor: null },
      { nome: 'Linha Rosa', rede: 'TU', operador: null, cor: null },
    ],
  } as unknown as ModoDetalhe;
  assert.equal(linhasDoModo(urbanos), 4);
  assert.equal(quantosNoModo('urbano-municipal', urbanos), '4 linhas');
});

test('os expressos contam-se nas paragens que têm na região; sem nada, vazio', () => {
  const expressos = { ...vazio, paragens: [{}, {}, {}, {}] } as unknown as ModoDetalhe;
  assert.equal(quantosNoModo('expresso', expressos), '4 paragens');
  assert.equal(quantosNoModo('expresso', vazio), '');
});

test('«da rede», com o nome dela como vem', () => {
  assert.equal(daRede({ rede: { nome: 'Sável Bus' } }), 'da rede Sável Bus');
  assert.equal(daRede({ rede: { nome: 'Rede Alta' } }), 'da Rede Alta');
  assert.equal(sem(daRede({ rede: {} })), 'da rede');
});
