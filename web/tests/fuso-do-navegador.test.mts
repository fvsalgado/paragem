/**
 * AS HORAS E OS DIAS SÃO OS DA REGIÃO, esteja o telemóvel no fuso que estiver.
 *
 * O engano que isto fixa não dava erro nenhum: com o telemóvel na hora de
 * Espanha, o planeador e as folhas de partidas escreviam o autocarro das 08:05
 * às 09:05 — o `toLocaleTimeString` e o `getHours()` sem fuso são os do
 * aparelho —, pediam ao planeador as partidas de uma hora mais tarde, e perto
 * da meia-noite o «amanhã» saía trocado. Nos Açores, o mesmo ao contrário.
 *
 * Por isso o fuso do PROCESSO — que é o que o `Date` do navegador usa — muda
 * em cada teste para um sítio que não é Lisboa, e confirma-se primeiro que
 * mudou mesmo: um teste que corresse sempre na hora de Lisboa passava com o
 * defeito lá dentro. Cada ficheiro destes corre no seu processo
 * (`npm run test:unidade`), por isso mexer no `TZ` aqui não chega aos outros;
 * repõe-se na mesma, por boa educação.
 *
 * As datas são de outubro e de dezembro de 2026: Lisboa está a UTC+1 e a
 * UTC+0, Madrid a UTC+2 e a UTC+1, os Açores a UTC+0 e a UTC−1.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  calendarioDasDatas,
  chaveDoDia,
  dataDoCampo,
  fraseDoDia,
  horaDoRelogio,
  proximas,
} from '../src/lib/dias.ts';
import { instanteNaRegiao } from '../src/lib/fuso.ts';
import { diaDe, horaDe } from '../src/lib/otp.ts';

/** Corre `fazer` com o relógio do «telemóvel» noutro fuso, e confirma que mudou. */
function noFuso(fuso: string, fazer: () => void): void {
  const antes = process.env.TZ;
  process.env.TZ = fuso;
  try {
    fazer();
  } finally {
    process.env.TZ = antes;
  }
}

/** 08:05 de 13/10/2026 em Lisboa (UTC+1): 07:05 em UTC. */
const OITO_E_CINCO = Date.UTC(2026, 9, 13, 7, 5);

test('com o telemóvel na hora de Espanha, o autocarro das 08:05 continua às 08:05', () => {
  noFuso('Europe/Madrid', () => {
    assert.equal(new Date(OITO_E_CINCO).getHours(), 9, 'o «telemóvel» está mesmo em Madrid');
    assert.equal(horaDe(OITO_E_CINCO), '08:05', 'a hora de um itinerário');
    assert.equal(horaDoRelogio(new Date(OITO_E_CINCO)), '08:05', 'a hora de «agora»');
    assert.equal(dataDoCampo(new Date(OITO_E_CINCO)), '2026-10-13');
  });
});

test('com o telemóvel nos Açores, o autocarro das 08:05 continua às 08:05', () => {
  noFuso('Atlantic/Azores', () => {
    assert.equal(new Date(OITO_E_CINCO).getHours(), 7, 'o «telemóvel» está mesmo nos Açores');
    assert.equal(horaDe(OITO_E_CINCO), '08:05');
    assert.equal(horaDoRelogio(new Date(OITO_E_CINCO)), '08:05');
  });
});

test('no inverno também: a diferença muda, a hora da região não', () => {
  // 08:05 de 4/12 em Lisboa é 08:05 em UTC; em Madrid são 09:05.
  const inverno = Date.UTC(2026, 11, 4, 8, 5);
  noFuso('Europe/Madrid', () => {
    assert.equal(new Date(inverno).getHours(), 9);
    assert.equal(horaDe(inverno), '08:05');
    assert.equal(horaDoRelogio(new Date(inverno)), '08:05');
  });
});

test('às 23h30 de Lisboa, um telemóvel em Madrid já é amanhã — e a região ainda é hoje', () => {
  // 22:30 UTC de 13/10: 23:30 em Lisboa, 00:30 de 14/10 em Madrid.
  const quase = new Date(Date.UTC(2026, 9, 13, 22, 30));
  noFuso('Europe/Madrid', () => {
    assert.equal(quase.getDate(), 14, 'no telemóvel já é dia 14');
    assert.equal(chaveDoDia(quase), '20261013');
    assert.equal(dataDoCampo(quase), '2026-10-13');
    assert.equal(horaDoRelogio(quase), '23:30');

    // O «amanhã» do planeador: a referência é o dia e a hora PERGUNTADOS, na
    // região. A partida das 23h45 é hoje; a das 07h00 do dia 14 é amanhã.
    const referencia = instanteNaRegiao('2026-10-13', '23:30');
    assert.equal(referencia, quase.getTime(), 'o instante perguntado é o da região');
    assert.equal(diaDe(Date.UTC(2026, 9, 13, 22, 45), referencia), '', '23h45 é hoje');
    assert.equal(diaDe(Date.UTC(2026, 9, 14, 6, 0), referencia), 'amanhã', '07h00 é amanhã');
  });
});

test('à 00h30 de Lisboa, um telemóvel nos Açores ainda é ontem — e a região já é amanhã', () => {
  // 23:30 UTC de 13/10: 00:30 de 14/10 em Lisboa, 23:30 de 13/10 nos Açores.
  const depois = new Date(Date.UTC(2026, 9, 13, 23, 30));
  noFuso('Atlantic/Azores', () => {
    assert.equal(depois.getDate(), 13, 'no telemóvel ainda é dia 13');
    assert.equal(chaveDoDia(depois), '20261014');
    assert.equal(horaDoRelogio(depois), '00:30');

    // Quem pergunta pelas 23h30 do dia 13 pergunta pela hora da região, e não
    // pela dos Açores — senão as partidas do próprio dia saíam «ontem».
    const referencia = instanteNaRegiao('2026-10-13', '23:30');
    assert.equal(referencia, Date.UTC(2026, 9, 13, 22, 30));
    assert.equal(diaDe(Date.UTC(2026, 9, 13, 22, 45), referencia), '');
    assert.equal(diaDe(Date.UTC(2026, 9, 14, 5, 0), referencia), 'amanhã');
  });
});

test('a folha da paragem mostra a partida de hoje que ainda não passou, noutro fuso', () => {
  // Um serviço só às terças (13/10) e outro só às quartas (14/10). Às 23h30
  // de terça em Lisboa, com o telemóvel em Madrid (já quarta, 00h30), a
  // partida das 23h45 de terça é a seguinte — e não as de quarta.
  const cal = calendarioDasDatas({
    servicos: ['TER', 'QUA'],
    datas: { '20261013': [0], '20261014': [1] },
  });
  const partidas = [
    { hora: '23:45', servico_id: 'TER' },
    { hora: '06:10', servico_id: 'QUA' },
  ];
  const instante = new Date(Date.UTC(2026, 9, 13, 22, 30));
  noFuso('Europe/Madrid', () => {
    const r = proximas(partidas, instante, horaDoRelogio(instante), cal);
    assert.equal(r.tipo, 'no-dia');
    if (r.tipo !== 'no-dia') return;
    assert.equal(r.dias, 0, 'é hoje, na região');
    assert.deepEqual(
      r.partidas.map((p) => p.hora),
      ['23:45'],
    );
    assert.equal(fraseDoDia(r, instante), '', 'sem frase de «as próximas são amanhã»');
  });
});

test('e depois da última de hoje, «amanhã» é o amanhã da região', () => {
  // 23:50 de terça em Lisboa (22:50 UTC); nos Açores ainda são 22:50 de
  // terça, em Madrid já é quarta. Em todos, a seguinte é a de quarta, e é
  // «amanhã».
  const cal = calendarioDasDatas({
    servicos: ['TER', 'QUA'],
    datas: { '20261013': [0], '20261014': [1] },
  });
  const partidas = [
    { hora: '23:45', servico_id: 'TER' },
    { hora: '06:10', servico_id: 'QUA' },
  ];
  const instante = new Date(Date.UTC(2026, 9, 13, 22, 50));
  for (const fuso of ['Europe/Madrid', 'Atlantic/Azores', 'America/New_York']) {
    noFuso(fuso, () => {
      const r = proximas(partidas, instante, horaDoRelogio(instante), cal);
      assert.equal(r.tipo, 'no-dia', fuso);
      if (r.tipo !== 'no-dia') return;
      assert.equal(r.dias, 1, `${fuso}: amanhã`);
      assert.deepEqual(
        r.partidas.map((p) => p.hora),
        ['06:10'],
        fuso,
      );
      assert.match(fraseDoDia(r, instante), /As próximas são amanhã:/, fuso);
    });
  }
});

test('«amanhã» é o de hoje: numa pesquisa para outro dia, diz-se o dia pelo nome', async () => {
  const { diaDe } = await import('../src/lib/otp.ts');
  // Domingo, 1/11/2026, ao meio-dia em Lisboa; pergunta-se por terça, 3/11.
  const hoje = Date.UTC(2026, 10, 1, 12, 0);
  const terca = Date.UTC(2026, 10, 3, 8, 0);
  const quarta = Date.UTC(2026, 10, 4, 7, 30);
  assert.equal(diaDe(quarta, terca, 'Europe/Lisbon', hoje), 'quarta-feira, 4/11');
  assert.equal(diaDe(terca, terca, 'Europe/Lisbon', hoje), '', 'o dia perguntado não se repete');
  // Perguntado hoje, o dia seguinte continua a ser «amanhã».
  const segunda = Date.UTC(2026, 10, 2, 7, 0);
  assert.equal(diaDe(segunda, hoje, 'Europe/Lisbon', hoje), 'amanhã');
});
