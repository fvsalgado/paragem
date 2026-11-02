/** O que a página de um modo decide antes de desenhar (`lib/pagina-do-modo.ts`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoDoCartaz,
  juntarPontos,
  regraDaData,
  nomeQueSoDizOQueE,
  percursosSemHorario,
  quemGerePorOrdem,
  regrasENotas,
} from '../src/lib/pagina-do-modo.ts';
import type { HorarioDeModo, PercursoDeModo } from '../src/lib/formato.ts';

const percurso = (nome: string, rede: string | null = 'TV'): PercursoDeModo => ({
  nome,
  rede,
  operador: 'Câmara',
  cor: null,
});
const horario = (nome: string) => ({ nome }) as HorarioDeModo;

test('um percurso que já tem horário na página não se lista outra vez', () => {
  const ps = [percurso('Linha Verde'), percurso('Linha Verde Express'), percurso('Linha Roxa')];
  // Com a rede à frente, ou sem ela; sem distinguir acentos nem maiúsculas.
  assert.deepEqual(
    percursosSemHorario(ps, [horario('TV — Linha Verde'), horario('linha verde express')]).map(
      (p) => p.nome,
    ),
    ['Linha Roxa'],
  );
  // Sem horários, ficam todos — é o que se sabe dessas linhas.
  assert.equal(percursosSemHorario(ps, []).length, 3);
  // Uma linha com o mesmo nome noutra rede é outra linha.
  assert.equal(
    percursosSemHorario([percurso('Linha Verde', 'XY')], [horario('TV — Linha Verde')]).length,
    1,
  );
});

test('as notas numeradas de um cartaz separam-se das regras da linha', () => {
  assert.deepEqual(
    regrasENotas([
      'Sábados até às 13:58',
      '(1) Realiza-se apenas no período escolar',
      ' (2) Termina na estação',
    ]),
    {
      regras: ['Sábados até às 13:58'],
      notas: ['(1) Realiza-se apenas no período escolar', ' (2) Termina na estação'],
    },
  );
});

test('quem gere vai pelo tamanho do que gere, o maior à frente (#159)', () => {
  const estacoes = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      nome: null,
      lat: 0,
      lon: 0,
      concelho: null,
    }));
  const sistema = (operador: string, n: number) => ({
    id: operador,
    nome: operador,
    operador,
    estado: null,
    disponibilidade_publica: false,
    estacoes: estacoes(n),
  });
  assert.deepEqual(
    quemGerePorOrdem({
      gerido_por: ['Câmara de Pedra Alta', 'Comunidade da Serra'],
      sistemas: [sistema('Câmara de Pedra Alta', 10), sistema('Comunidade da Serra', 67)],
      pontos: [],
    }),
    ['Comunidade da Serra', 'Câmara de Pedra Alta'],
  );
  // Sem nada que os pese, fica a ordem dos dados.
  assert.deepEqual(quemGerePorOrdem({ gerido_por: ['B', 'A'], sistemas: [], pontos: [] }), [
    'B',
    'A',
  ]);
});

test('a mesma praça mapeada duas vezes conta uma, e fica com o que uma delas souber (#189)', () => {
  // 0,0001° de latitude são uns 11 m.
  const praca = (lat: number, nome: string | null = null, telefone: string | null = null) => ({
    id: `n${lat}`,
    nome,
    telefone,
    operador: null,
    lat,
    lon: -7.6,
    concelho: 'pedra-alta',
  });
  const juntas = juntarPontos([
    praca(40.1),
    praca(40.1001, 'Praça do Mercado', '+351 0'),
    praca(40.2),
  ]);
  assert.equal(juntas.length, 2);
  assert.equal(juntas[0].nome, 'Praça do Mercado');
  assert.equal(juntas[0].telefone, '+351 0');
  // Um nome que só diz o que é não é um nome.
  assert.equal(juntarPontos([praca(40.3, 'Táxis')])[0].nome, null);
});

test('«Táxis» e «Praça de Táxis» só dizem o que é; «Praça do Mercado» é um nome', () => {
  for (const n of ['Táxis', 'Praça de Táxis', 'praca taxis', 'Táxi', null]) {
    assert.equal(nomeQueSoDizOQueE(n), true, String(n));
  }
  assert.equal(nomeQueSoDizOQueE('Praça do Mercado'), false);
});

test('um cartaz com mais de um ano, ou sem data, pede aviso à cabeça (#191)', () => {
  const hoje = new Date(2026, 10, 2);
  assert.deepEqual(avisoDoCartaz({ em_vigor_desde: '2021-02-01', texto: null }, hoje), {
    desde: 'fevereiro de 2021',
  });
  assert.equal(avisoDoCartaz({ em_vigor_desde: '2026-03-01', texto: null }, hoje), null);
  assert.deepEqual(avisoDoCartaz({ em_vigor_desde: null, texto: null }, hoje), { desde: null });
  // O que o cartaz diz por palavras vai por baixo, como sempre.
  assert.equal(avisoDoCartaz({ em_vigor_desde: null, texto: 'é o folheto de 2026' }, hoje), null);
  assert.equal(avisoDoCartaz(undefined, hoje), null);
});

test('a regra que diz a data é a que o aviso já diz', () => {
  assert.equal(regraDaData('horários em vigor a partir de 1 de fevereiro de 2021'), true);
  assert.equal(regraDaData('Sábados, exceto feriados, até às 13h58m'), false);
});
