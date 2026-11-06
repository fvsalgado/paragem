/**
 * O horário para afixar na paragem: as partidas em grelha, uma fila por hora.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chamadasDaFolha, chaveDaChamada, quadrosDaFolha } from '../src/lib/horario-afixavel.ts';
import { codigoQr } from '../src/lib/qr.ts';

const partida = (hora: string, extra: Partial<Record<string, unknown>> = {}) => ({
  hora,
  linha: '1',
  linha_id: 'L1',
  destino: 'Centro',
  servico_nome: 'Todo o ano · Dias úteis',
  estimada: false,
  ...extra,
});

test('uma fila por hora, com os minutos pela ordem', () => {
  const [quadro] = quadrosDaFolha([partida('08:42'), partida('07:15'), partida('08:02')]);
  assert.deepEqual(
    quadro.horas.map((h) => [h.hora, h.minutos.map((m) => m.minuto)]),
    [
      ['07', ['15']],
      ['08', ['02', '42']],
    ],
  );
  assert.equal(quadro.partidas, 3);
});

test('um quadro por tipo de dia, pela ordem em que chegam', () => {
  const quadros = quadrosDaFolha([
    partida('07:00'),
    partida('09:00', { servico_nome: 'Todo o ano · Sábados' }),
    partida('08:00'),
  ]);
  assert.deepEqual(
    quadros.map((q) => [q.nome, q.partidas]),
    [
      ['Todo o ano · Dias úteis', 2],
      ['Todo o ano · Sábados', 1],
    ],
  );
});

test('depois da meia-noite fica no fim, na fila «00», e diz-se', () => {
  const [quadro] = quadrosDaFolha([partida('24:10'), partida('23:40')]);
  assert.deepEqual(
    quadro.horas.map((h) => [h.hora, h.diaSeguinte]),
    [
      ['23', false],
      ['00', true],
    ],
  );
});

test('a letra é de uma linha para um destino, e só aparece quando há mais do que uma', () => {
  assert.equal(chamadasDaFolha([partida('07:00'), partida('08:00')]).size, 0);
  const letras = chamadasDaFolha([
    partida('07:00', { destino: 'Escola' }),
    partida('08:00'),
    partida('09:00'),
    partida('10:00', { linha: '2', linha_id: 'L2' }),
  ]);
  // A mais servida fica com o A; depois, pela linha e pelo destino.
  assert.equal(letras.get(chaveDaChamada('L1', 'Centro'))?.letra, 'A');
  assert.equal(letras.get(chaveDaChamada('L1', 'Escola'))?.letra, 'B');
  assert.equal(letras.get(chaveDaChamada('L2', 'Centro'))?.letra, 'C');
  assert.equal(letras.get(chaveDaChamada('L2', 'Centro'))?.linha, '2');
});

test('o código QR tem o tamanho da norma e a margem silenciosa', () => {
  const { lado, caminho } = codigoQr('https://exemplo.localhost/rede/paragens/abc/');
  // Uma versão QR tem 17 + 4 × v módulos de lado; mais 4 de margem de cada lado.
  assert.equal((lado - 8 - 17) % 4, 0);
  assert.ok(caminho.length > 0);
  assert.match(caminho, /^M\d+ \d+h1v1h-1z/);
});
