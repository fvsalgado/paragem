/**
 * As linhas e as paragens de um aviso, escolhidas pelo que o público vê
 * (P4-017): o número da linha, o nome da paragem — e o que não se resolve diz
 * porquê, com o que se escreveu.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enderecoValido,
  entradas,
  resolverLinhas,
  resolverParagens,
} from '../src/lib/painel/escolhas-do-aviso.ts';

const LINHAS = [
  { id: 'RA1', codigo: '1', nome: 'Pedra Alta – Ribeira do Corvo' },
  { id: 'RA2', codigo: '2', nome: 'Circular de Pedra Alta' },
  { id: 'VZ2', codigo: '2', nome: 'Vizinha – Pedra Alta', operador: 'Rede Vizinha' },
  { id: 'VZ9', codigo: '9', nome: 'Vizinha – Serra', operador: 'Rede Vizinha' },
  { id: 'RA7a', codigo: '7', nome: 'Sete de cima' },
  { id: 'RA7b', codigo: '7', nome: 'Sete de baixo' },
];

test('o número que está no autocarro serve, e o identificador também', () => {
  assert.deepEqual(resolverLinhas(['1'], LINHAS), { ok: true, ids: ['RA1'] });
  assert.deepEqual(resolverLinhas(['RA1', '1'], LINHAS), { ok: true, ids: ['RA1'] });
  // O nome também, sem acentos nem maiúsculas.
  assert.deepEqual(resolverLinhas(['circular de pedra alta'], LINHAS), { ok: true, ids: ['RA2'] });
});

test('um número que a casa partilha com outro operador é o da casa', () => {
  assert.deepEqual(resolverLinhas(['2'], LINHAS), { ok: true, ids: ['RA2'] });
});

test('a linha de outro operador recusa-se, e diz de quem é', () => {
  const r = resolverLinhas(['9'], LINHAS);
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.erro, /é de Rede Vizinha/);
  assert.match(r.ok ? '' : r.erro, /quem avisa sobre ele/);
});

test('um número de duas linhas da casa não se adivinha', () => {
  const r = resolverLinhas(['7'], LINHAS);
  assert.equal(r.ok, false);
  assert.match(r.ok ? '' : r.erro, /há 2 linhas com o número 7/);
  assert.match(r.ok ? '' : r.erro, /escolhe-a na lista/);
});

test('o que não existe diz-se com o que se escreveu', () => {
  const r = resolverLinhas(['44'], LINHAS);
  assert.equal(r.ok, false);
  assert.equal(r.ok ? '' : r.erro, 'não há nenhuma linha «44» nesta região');
});

test('sem catálogo, não se valida — o primeiro aviso de uma região nova passa', () => {
  assert.deepEqual(resolverLinhas(['RA1', 'RA1'], []), { ok: true, ids: ['RA1'] });
});

const PARAGENS = [
  { id: 'pa_mercado', nome: 'Pedra Alta (Mercado)' },
  { id: 'esc_1', nome: 'Escola' },
  { id: 'esc_2', nome: 'Escola' },
];

test('a paragem pelo identificador, ou pelo nome quando é de uma só', () => {
  assert.deepEqual(resolverParagens(['pa_mercado'], PARAGENS), { ok: true, ids: ['pa_mercado'] });
  assert.deepEqual(resolverParagens(['pedra alta (mercado)'], PARAGENS), {
    ok: true,
    ids: ['pa_mercado'],
  });
  const iguais = resolverParagens(['Escola'], PARAGENS);
  assert.equal(iguais.ok, false);
  assert.match(iguais.ok ? '' : iguais.erro, /há 2 paragens chamadas «Escola»/);
});

test('os campos chegam repetidos ou com vírgulas, e os vazios caem', () => {
  assert.deepEqual(entradas(['RA1', ' 2, 3 ', '', 7]), ['RA1', '2', '3']);
});

test('«Mais informação» é um endereço da Web, e nada mais', () => {
  assert.equal(enderecoValido(''), true);
  assert.equal(enderecoValido('https://exemplo.pt/obras'), true);
  assert.equal(enderecoValido('javascript:alert(1)'), false);
  assert.equal(enderecoValido('exemplo.pt'), false);
});
