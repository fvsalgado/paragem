/**
 * As descargas pelo domínio da região (P4-025): o endereço que a página liga,
 * e o que a rota aceita — só o que o catálogo lista, e nada fora dele.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enderecoDaDescarga, ficheiroDaDescarga } from '../src/lib/descargas.ts';
import type { Descarga } from '../src/lib/formato.ts';

const base = {
  grupo: 'feeds',
  modo: null,
  bytes: 10,
  fonte: 'x',
  licenca: null,
  licenca_por_esclarecer: false,
  atribuicao: null,
  atribuicao_obrigatoria: false,
};
const CATALOGO: Descarga[] = [
  { ...base, caminho: 'gtfs/rede-alta.zip', ficheiro: 'rede-alta.zip', existe: true },
  { ...base, caminho: 'gbfs/altabike.zip', ficheiro: 'altabike.zip', existe: false },
];

test('a ligação é do domínio da região, e não do armazém', () => {
  assert.equal(enderecoDaDescarga(CATALOGO[0]), '/dados-abertos/gtfs/rede-alta.zip');
  assert.equal(
    enderecoDaDescarga({ caminho: 'tap/são bento.json', ficheiro: 'x' }),
    '/dados-abertos/tap/s%C3%A3o%20bento.json',
  );
});

test('a rota só dá o que o catálogo lista e existe', () => {
  assert.equal(ficheiroDaDescarga(CATALOGO, ['gtfs', 'rede-alta.zip'])?.ficheiro, 'rede-alta.zip');
  assert.equal(ficheiroDaDescarga(CATALOGO, ['gbfs', 'altabike.zip']), null);
  assert.equal(ficheiroDaDescarga(CATALOGO, ['inventario.json']), null);
  // Nada de subir pastas para ir buscar o que não está na página.
  assert.equal(ficheiroDaDescarga(CATALOGO, ['gtfs', '..', 'gtfs', 'rede-alta.zip']), null);
});
