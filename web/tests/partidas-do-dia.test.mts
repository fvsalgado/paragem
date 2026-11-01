/**
 * As partidas de um dia numa paragem, numa lista só (auditoria de 1/11/2026,
 * #14): os quadros que valem nesse dia, juntos e pela hora — com a mesma
 * tabela dos dias do «A seguir».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarioDasDatas } from '../src/lib/dias.ts';
import { notasDosPeriodos, partidasDoDia, periodoDoServico } from '../src/lib/partidas-do-dia.ts';

// 1/10/2026 é quinta; 3/10 sábado; 4/10 domingo, sem linha na tabela.
const CAL = calendarioDasDatas({
  servicos: ['rede:A-U', 'rede:E-U', 'rede:A-S'],
  datas: {
    '20261001': [0, 1],
    '20261002': [0],
    '20261003': [2],
    '20261005': [0, 1],
  },
});

const P = [
  { hora: '08:10', servico_id: 'rede:A-U', linha: '1' },
  { hora: '07:30', servico_id: 'rede:E-U', linha: '2' },
  { hora: '09:00', servico_id: 'rede:A-S', linha: '1' },
  { hora: '12:00', linha: '9' }, // sem calendário: anda todos os dias
];

test('junta os quadros que valem no dia, pela hora', () => {
  assert.deepEqual(
    partidasDoDia(P, CAL, '20261001')!.map((p) => p.hora),
    ['07:30', '08:10', '12:00'],
  );
  // Na sexta não há escola: a do período escolar sai.
  assert.deepEqual(
    partidasDoDia(P, CAL, '20261002')!.map((p) => p.hora),
    ['08:10', '12:00'],
  );
  assert.deepEqual(
    partidasDoDia(P, CAL, '20261003')!.map((p) => p.hora),
    ['09:00', '12:00'],
  );
});

test('um dia sem linha dentro do período é um dia sem serviço; fora dele, não se sabe', () => {
  assert.deepEqual(
    partidasDoDia(P, CAL, '20261004')!.map((p) => p.hora),
    ['12:00'],
  );
  assert.equal(partidasDoDia(P, CAL, '20261231'), null);
});

test('a nota do período vai nas partidas que não são do período mais comum do dia', () => {
  const nomes = {
    'rede:A-U': 'Todo o ano · Dias úteis',
    'rede:E-U': 'Em tempo de aulas · Dias úteis',
  };
  const doDia = [
    { servico_id: 'rede:A-U' },
    { servico_id: 'rede:A-U' },
    { servico_id: 'rede:E-U' },
  ];
  const notas = notasDosPeriodos(doDia, nomes);
  assert.equal(notas.get('rede:E-U'), 'Em tempo de aulas');
  assert.equal(notas.has('rede:A-U'), false);
  // Com um período só no dia, ninguém leva nota.
  assert.equal(notasDosPeriodos([{ servico_id: 'rede:E-U' }], nomes).size, 0);
});

test('o período é a primeira parte do nome do serviço', () => {
  assert.equal(periodoDoServico('Em tempo de aulas · Dias úteis'), 'Em tempo de aulas');
  assert.equal(periodoDoServico('Dias úteis'), 'Dias úteis');
});
