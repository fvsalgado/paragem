import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * O processador do mapa em `public/` é o do pacote instalado, byte a byte.
 *
 * O `Mapa.tsx` diz ao MapLibre que o processador está em
 * `/maplibre/<versão>/maplibre-gl-worker.mjs`, e quem o põe lá é o
 * `scripts/copiar-maplibre.mjs`, no `postinstall` e antes de cada construção.
 * Isto apanha uma subida do `maplibre-gl` sem o script ter corrido — e, mais
 * importante, uma cópia de outra versão: os dois lados de um Worker que não são
 * da mesma versão falham de maneiras que não dizem porquê.
 *
 * As regiões de prova não têm mapa, e por isso nenhum teste de interface do CI
 * chega a arrancar o processador. É aqui que ele se verifica.
 */
const require = createRequire(import.meta.url);
const pacote = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(pacote, 'utf8')) as { version: string };
const dist = join(dirname(pacote), 'dist');
const publico = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre', version);

for (const nome of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  test(`${nome} está na pasta da versão instalada e é igual ao do pacote`, () => {
    const copia = join(publico, nome);
    assert.ok(existsSync(copia), `${copia} não existe — corre node scripts/copiar-maplibre.mjs`);
    assert.deepEqual(readFileSync(copia), readFileSync(join(dist, nome)));
  });
}

test('o processador importa o módulo partilhado ao lado, por caminho relativo', () => {
  // É isto que obriga a servir os dois da mesma pasta, e que o empacotador
  // partia ao tratá-los como recursos soltos com nomes com hash.
  const processador = readFileSync(join(publico, 'maplibre-gl-worker.mjs'), 'utf8');
  assert.match(processador, /from\s*["']\.\/maplibre-gl-shared\.mjs["']/);
});
