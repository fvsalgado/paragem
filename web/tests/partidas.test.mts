/**
 * A espera e o contraste — as duas contas que a folha de partidas faz.
 *
 * Nenhuma das duas é óbvia o bastante para ficar sem teste: a primeira tem
 * de lidar com horas que já passaram e com o «25:10» dos GTFS, e a segunda
 * existe precisamente porque o que o feed declara está por vezes errado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactar, esperaLegivel, expandir, textoSobre } from '../src/lib/formato.ts';
import {
  calendarioDasDatas,
  calendarioDasMascaras,
  chaveDoDia,
  dataDoCampo,
  fraseDoDia,
  horaDoRelogio,
  periodoDe,
  proximas,
  servicosNoDia,
} from '../src/lib/dias.ts';

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
const CAL = calendarioDasDatas({
  servicos: ['rede:U', 'rede:S'],
  datas: {
    '20261001': [0],
    '20261002': [0],
    '20261003': [1],
    '20261005': [0],
    '20261006': [0],
  },
});

// A MESMA SEMANA EM MÁSCARAS, tal como o pipeline a escreve no
// `calendario.json` (`calendario_em_mascaras`, em `sitio.py`) — copiada da
// saída dele, e não feita aqui: é o que prova que as duas pontas falam a
// mesma língua. «Mw==» é 0b00110011, os dias 0, 1, 4 e 5 a contar de 1/10;
// «BA==» é o bit 2, o sábado.
const CAL_EM_MASCARAS = calendarioDasMascaras({
  formato: 'mascaras/1',
  inicio: '20261001',
  dias: 6,
  servicos: ['rede:U', 'rede:S'],
  padroes: ['Mw==', 'BA=='],
  padrao: [0, 1],
});

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

test('A SEGUIR É PELA HORA: a circular escolar das 7:51 vem antes da anual das 8:18', () => {
  // As partidas chegam pela ordem do horário impresso — o serviço anual
  // primeiro, o escolar depois. Cortadas assim, as cinco «a seguir» eram as
  // cinco seguintes da anual, e a circular que passava dali a um minuto não
  // aparecia na folha.
  const CAL_ESCOLAR = calendarioDasDatas({
    servicos: ['rede:A-U', 'rede:E-U'],
    datas: { '20261006': [0, 1] },
  });
  const anual = (hora: string) => ({ hora, linha: '2', servico_id: 'rede:A-U' });
  const escolar = (hora: string) => ({ hora, linha: '11', servico_id: 'rede:E-U' });
  const ESTACAO = [
    anual('08:18'),
    anual('09:18'),
    anual('10:18'),
    escolar('07:51'),
    escolar('08:11'),
    escolar('08:31'),
  ];
  const r = proximas(ESTACAO, dia(6, 7, 50), '07:50', CAL_ESCOLAR, 4);
  assert.equal(r.tipo, 'no-dia');
  if (r.tipo !== 'no-dia') return;
  assert.deepEqual(
    r.partidas.map((p) => `${p.hora} ${p.linha}`),
    ['07:51 11', '08:11 11', '08:18 2', '08:31 11'],
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

test('a tabela em máscaras responde o mesmo que a tabela dos dias, a qualquer hora (P3-006)', () => {
  // O sítio passou a pedir o `calendario.json` — vinte vezes mais pequeno do
  // que o `servicos.json` na região real. O `proximas` não pode notar a
  // diferença: o mesmo dia, a mesma hora, a mesma resposta, dentro e fora do
  // período, e com a frase que vai antes das horas.
  assert.deepEqual(periodoDe(CAL_EM_MASCARAS), periodoDe(CAL));
  // De 26/9 a 10/10: antes do princípio, o período inteiro, e depois do fim.
  for (let n = 0; n < 15; n++) {
    const chave = chaveDoDia(new Date(2026, 8, 26 + n));
    assert.deepEqual(
      [...(servicosNoDia(CAL_EM_MASCARAS, chave) ?? ['fora'])],
      [...(servicosNoDia(CAL, chave) ?? ['fora'])],
      chave,
    );
  }
  for (let d = 1; d <= 8; d++) {
    for (const h of [0, 6, 7, 10, 13, 20, 21, 23]) {
      const quando = new Date(2026, 9, d, h, 30);
      const agora = horaDoRelogio(quando);
      const a = proximas(TERMINAL, quando, agora, CAL, 5);
      const b = proximas(TERMINAL, quando, agora, CAL_EM_MASCARAS, 5);
      assert.deepEqual(b, a, `${d}/10 ${agora}`);
      assert.equal(fraseDoDia(b, quando), fraseDoDia(a, quando));
    }
  }
  const vazia = calendarioDasMascaras({
    inicio: null,
    dias: 0,
    servicos: [],
    padroes: [],
    padrao: [],
  });
  assert.equal(periodoDe(vazia), null);
  assert.deepEqual(proximas(TERMINAL, dia(4), '10:30', vazia), {
    tipo: 'fora-do-periodo',
    inicio: '',
    fim: '',
  });
});

test('à meia-noite e meia, o dia do campo é o de hoje e não o de ontem em UTC', () => {
  // 00:30 de sexta 2/10 em Lisboa, no verão, são 23:30 de quinta em UTC. O
  // «Partir agora» usava o `toISOString()` para o dia e a hora local para as
  // horas — e perguntava pelas carreiras de quinta.
  const antes = process.env.TZ;
  process.env.TZ = 'Europe/Lisbon';
  try {
    const d = new Date('2026-10-01T23:30:00Z');
    assert.equal(d.toISOString().slice(0, 10), '2026-10-01', 'em UTC ainda é quinta');
    assert.equal(dataDoCampo(d), '2026-10-02');
    assert.equal(horaDoRelogio(d), '00:30');
  } finally {
    // O fuso é do processo, e não deste teste: deixá-lo em Lisboa mudava o
    // dia aos testes que viessem a seguir no mesmo processo.
    process.env.TZ = antes;
  }
});

test('as partidas compactas voltam a ser as mesmas partidas', () => {
  // É o que vai para o navegador na página da paragem: sem repetir o destino,
  // a linha e o serviço em cada partida. O que se perde é só o nome da própria
  // paragem nas circulares, que a lista nunca mostra.
  const lista = [
    {
      hora: '07:10',
      linha: '1',
      linha_id: 'RA1',
      destino: 'Ribeira',
      servico_id: 'f:A-U',
      estimada: false,
    },
    {
      hora: '08:00',
      linha: '2',
      linha_id: 'RA2',
      destino: 'Aqui',
      servico_id: 'f:A-U',
      estimada: true,
      circular: true,
    },
    {
      hora: '09:00',
      linha: '1',
      linha_id: 'RA1',
      destino: 'Ribeira',
      estimada: false,
      operador: 'Outra, Lda',
    },
  ];
  const c = compactar(lista);
  assert.equal(c.destinos.length, 1, 'o destino repetido escreve-se uma vez');
  assert.equal(c.linhas.length, 2);
  const de_volta = expandir(c);
  assert.deepEqual(de_volta[0], lista[0]);
  assert.equal(de_volta[1].circular, true);
  assert.equal(de_volta[1].estimada, true);
  assert.equal(de_volta[2].servico_id, undefined, 'sem serviço declarado continua sem serviço');
  assert.equal(de_volta[2].operador, 'Outra, Lda');
});
