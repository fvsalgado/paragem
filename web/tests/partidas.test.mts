/**
 * A espera e o contraste — as duas contas que a folha de partidas faz.
 *
 * Nenhuma das duas é óbvia o bastante para ficar sem teste: a primeira tem
 * de lidar com horas que já passaram e com o «25:10» dos GTFS, e a segunda
 * existe precisamente porque o que o feed declara está por vezes errado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esperaLegivel, textoSobre } from '../src/lib/formato.ts';
import { fraseDoDia, proximas, servicosNoDia, type Calendario } from '../src/lib/dias.ts';

test('a espera responde à pergunta de quem está na paragem', () => {
  assert.equal(esperaLegivel('14:20', '14:08'), '12 min');
  assert.equal(esperaLegivel('14:08', '14:08'), 'agora');
  assert.equal(esperaLegivel('15:51', '14:08'), '1 h 43');
  assert.equal(esperaLegivel('16:08', '14:08'), '2 h');
});

test('o que já passou, ou é longe de mais, fica só com o relógio', () => {
  assert.equal(esperaLegivel('13:00', '14:08'), null, 'já passou');
  assert.equal(esperaLegivel('25:10', '08:00'), null, 'mais de doze horas à frente');
  assert.equal(esperaLegivel('não é hora', '14:08'), null);
});

test('o contraste do distintivo calcula-se, não se acredita', () => {
  // O §8 manda garantir contraste, e o feed desta região declara texto
  // branco sobre amarelo — 1,6:1 onde a WCAG AA pede 4,5:1.
  assert.equal(textoSobre('f1ea17'), '#102C3F', 'amarelo pede texto escuro');
  assert.equal(textoSobre('00509d'), '#ffffff', 'azul escuro pede texto claro');
  assert.equal(textoSobre('483737'), '#ffffff');
  assert.equal(textoSobre('xyz'), '#ffffff', 'uma cor que não se percebe não rebenta');
});

// --- que dia é de quê ------------------------------------------------------
//
// Um calendário de brincar, pequeno ao ponto de se conferir de cabeça: uma
// semana de outubro de 2026 em que o serviço `U` anda nos dias úteis e o `S`
// ao sábado. O domingo 4/10 NÃO TEM LINHA — é assim que a tabela verdadeira
// escreve um dia sem serviço nenhum. As datas: 1/10 é quinta, 2/10 sexta,
// 3/10 sábado, 4/10 domingo, 5/10 segunda.
const CAL: Calendario = {
  servicos: ['rede:U', 'rede:S'],
  datas: {
    '20261001': [0],
    '20261002': [0],
    '20261003': [1],
    '20261005': [0],
    '20261006': [0],
  },
};

const U = (hora: string, linha = '1') => ({ hora, linha, servico_id: 'rede:U' });
const S = (hora: string, linha = '1') => ({ hora, linha, servico_id: 'rede:S' });
const TERMINAL = [U('06:45'), S('08:00'), U('10:30'), S('12:00'), U('20:00')];
const dia = (d: number, h = 10, m = 30) => new Date(2026, 9, d, h, m);

test('um dia que falta DENTRO do período é um dia sem serviço; fora dele, não se sabe', () => {
  assert.deepEqual(
    [...(servicosNoDia(CAL, '20261004') ?? ['?'])],
    [],
    'domingo: sabe-se que não há',
  );
  assert.deepEqual([...(servicosNoDia(CAL, '20261003') ?? [])], ['rede:S']);
  assert.equal(servicosNoDia(CAL, '20270104'), null, 'depois do fim: não se sabe');
  assert.equal(servicosNoDia(CAL, '20250101'), null, 'antes do princípio: não se sabe');
});

test('NÃO SEI: sem a tabela dos dias mostram-se as horas, e diz-se que é sem saber', () => {
  // O ficheiro não chegou. Não se esconde nada — mas a resposta é outra, para
  // a folha poder dizer que estas horas podem não ser de hoje.
  const r = proximas(TERMINAL, dia(4), '10:00', null, 3);
  assert.equal(r.tipo, 'sem-calendario');
  assert.deepEqual(r.tipo === 'sem-calendario' && r.partidas.map((p) => p.hora), [
    '10:30',
    '12:00',
    '20:00',
  ]);
});

test('SEI QUE NÃO HÁ: ao domingo, as próximas são as de segunda, com os serviços de segunda', () => {
  // Medido num terminal a 04/10/2026: a folha anunciava como «agora» e
  // «5 min» autocarros de dias úteis. Ao domingo não passa nada aqui, e o que
  // responde a «quando passa o próximo?» é segunda-feira — sem os de sábado.
  const r = proximas(TERMINAL, dia(4), '10:30', CAL, 5);
  assert.equal(r.tipo, 'no-dia');
  if (r.tipo !== 'no-dia') return;
  assert.equal(r.hoje, 'nao-ha');
  assert.equal(r.dias, 1);
  assert.equal(r.chave, '20261005');
  assert.deepEqual(
    r.partidas.map((p) => p.hora),
    ['06:45', '10:30', '20:00'],
    'as de dias úteis, e nenhuma de sábado',
  );
  assert.equal(
    fraseDoDia(r, dia(4)),
    'Hoje, domingo, não há partidas nesta paragem. As próximas são amanhã:',
  );
});

test('O AMANHÃ É O AMANHÃ A SÉRIO: sexta à noite, as próximas são as de sábado', () => {
  // A conta antiga repetia as de HOJE com a etiqueta «amanhã»: numa sexta às
  // 23:50, anunciava para sábado as carreiras de dia útil.
  const r = proximas(TERMINAL, dia(2, 23, 50), '23:50', CAL, 5);
  assert.equal(r.tipo, 'no-dia');
  if (r.tipo !== 'no-dia') return;
  assert.equal(r.hoje, 'ja-passaram');
  assert.equal(r.dias, 1);
  assert.equal(r.chave, '20261003');
  assert.deepEqual(
    r.partidas.map((p) => p.hora),
    ['08:00', '12:00'],
    'só as de sábado',
  );
  // E a espera conta as 24 horas da volta ao dia: «06:45» menos «20:46» dava
  // negativo, e a espera sumia-se à hora em que mais faz falta.
  assert.equal(esperaLegivel('08:00', '23:50', true), '8 h 10');
  assert.equal(
    fraseDoDia(r, dia(2, 23, 50)),
    'Hoje já não há mais partidas nesta paragem. As próximas são amanhã:',
  );
});

test('e no sábado à noite salta o domingo vazio: a próxima é na segunda-feira, 5/10', () => {
  const r = proximas(TERMINAL, dia(3, 21), '21:00', CAL, 5);
  assert.equal(r.tipo, 'no-dia');
  if (r.tipo !== 'no-dia') return;
  assert.equal(r.dias, 2);
  assert.equal(r.chave, '20261005');
  assert.equal(
    fraseDoDia(r, dia(3, 21)),
    'Hoje já não há mais partidas nesta paragem. As próximas são na segunda-feira, 5/10:',
  );
});

test('no caso de todos os dias, as de hoje que faltam — e a frase fica calada', () => {
  const r = proximas(TERMINAL, dia(1), '10:00', CAL, 5);
  assert.equal(r.tipo, 'no-dia');
  if (r.tipo !== 'no-dia') return;
  assert.equal(r.dias, 0);
  assert.equal(r.hoje, 'ha');
  assert.deepEqual(
    r.partidas.map((p) => p.hora),
    ['10:30', '20:00'],
  );
  assert.equal(fraseDoDia(r, dia(1)), '');
});

test('uma partida sem serviço declarado anda todos os dias do período', () => {
  // Há feeds que não declaram calendário; recusá-las era escondê-las.
  const r = proximas([{ hora: '11:00', linha: 'X' }], dia(4), '10:30', CAL);
  assert.equal(r.tipo, 'no-dia');
  assert.equal(r.tipo === 'no-dia' && r.dias, 0);
});

test('fora do período não se adivinha, e sem mais partidas diz-se até quando se sabe', () => {
  const fora = proximas(TERMINAL, new Date(2027, 0, 4, 9), '09:00', CAL);
  assert.deepEqual(fora, { tipo: 'fora-do-periodo', inicio: '20261001', fim: '20261006' });
  const fim = proximas([U('06:45')], dia(6, 22), '22:00', CAL);
  assert.deepEqual(fim, { tipo: 'nenhuma', fim: '20261006' });
});
