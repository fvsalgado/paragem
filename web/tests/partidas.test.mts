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
import { proximas } from '../src/lib/dias.ts';

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

test('à noite, a lista dá a volta ao dia — e diz que deu', () => {
  // Medido no cais mais servido desta região: a última partida é às 20:00 e
  // a primeira às 06:45. Às 20:46 a folha mostrava «06:45» e mais nada — nem
  // «amanhã», nem a espera, porque 06:45 menos 20:46 dá negativo. Uma hora
  // sozinha, à noite, lê-se como «já a seguir».
  const dia = [{ hora: '06:45' }, { hora: '12:00' }, { hora: '20:00' }];

  const tarde = proximas(dia, '20:46', null, 3);
  assert.deepEqual(
    tarde.map((x) => [x.partida.hora, x.amanha]),
    [
      ['06:45', true],
      ['12:00', true],
      ['20:00', true],
    ],
    'já passaram todas as de hoje: estas são de amanhã',
  );
  assert.equal(esperaLegivel('06:45', '20:46', true), '9 h 59');

  // E de manhã NÃO dá a volta: há partidas por vir e é isso que se mostra.
  const manha = proximas(dia, '07:00', null, 3);
  assert.deepEqual(
    manha.map((x) => [x.partida.hora, x.amanha]),
    [
      ['12:00', false],
      ['20:00', false],
    ],
  );
  assert.equal(esperaLegivel('12:00', '07:00'), '5 h');
});
