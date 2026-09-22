/**
 * O analisador do painel, contra um excerto de três cartões.
 *
 * Corre com `node --test`. Não vai à rede: o excerto está em `fixtures/` — a
 * ESTRUTURA real, com estações inventadas. Se o fornecedor mudar a forma do
 * cartão, é aqui que se dá por isso, e não numa página em produção a mostrar
 * contagens em branco.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analisar, chave } from './analisar.mjs';

const html = readFileSync(
  fileURLToPath(new URL('./fixtures/painel.html', import.meta.url)),
  'utf-8',
);

test('lê as três estações, com nome e coordenadas', () => {
  const e = analisar(html);
  assert.equal(e.length, 3);
  assert.deepEqual(
    e.map((x) => x.nome),
    [
      'Pedra Alta - Terminal',
      'BUTe - Ribeira do Corvo - Largo da Camara Municipal',
      'Pedra Alta - Estação Ferroviária',
    ],
  );
  assert.equal(e[2].lat, 41.331);
  assert.equal(e[2].lon, -7.269);
});

test('bicicletas e docas vêm pelo rótulo, não pela posição', () => {
  const [terminal] = analisar(html);
  assert.equal(terminal.bicicletas, 2);
  assert.equal(terminal.docas, 8);
});

test('um zero é um zero, e não «sem dados»', () => {
  // O cartão do subsistema tem zero bicicletas. É informação — poupa a
  // caminhada —, e tem de se distinguir de uma leitura que falhou.
  const sub = analisar(html).find((x) => x.nome.startsWith('BUTe'));
  assert.equal(sub.bicicletas, 0);
  assert.notEqual(sub.bicicletas, null);
  assert.equal(sub.docas, 10);
});

test('a chave é estável e sem acentos', () => {
  assert.equal(chave('Pedra Alta - Estação Ferroviária'), 'pedra-alta-estacao-ferroviaria');
  assert.equal(chave('Pedra Alta - Terminal'), 'pedra-alta-terminal');
});

test('uma página sem cartões não rebenta — devolve vazio', () => {
  assert.deepEqual(analisar('<html><body>nada aqui</body></html>'), []);
});
