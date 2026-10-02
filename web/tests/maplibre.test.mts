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

// O MÓDULO PRINCIPAL E A FOLHA DE ESTILO TAMBÉM (P3-007, P3-028): o `Mapa.tsx`
// importa-os daqui, e não do pacote — um módulo principal empacotado trazia a
// sua própria cópia do código partilhado, e a folha empacotada bloqueava a
// pintura de todas as páginas.
for (const nome of [
  'maplibre-gl.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl.css',
]) {
  test(`${nome} está na pasta da versão instalada e é igual ao do pacote`, () => {
    const copia = join(publico, nome);
    assert.ok(existsSync(copia), `${copia} não existe — corre node scripts/copiar-maplibre.mjs`);
    assert.deepEqual(readFileSync(copia), readFileSync(join(dist, nome)));
  });
}

test('o principal e o processador importam o MESMO módulo partilhado, ao lado', () => {
  // É isto que obriga a servir os três da mesma pasta, e que o empacotador
  // partia ao tratá-los como recursos soltos com nomes com hash. E é o que faz
  // a cache servir o código partilhado uma vez só, aos dois.
  for (const nome of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs']) {
    const modulo = readFileSync(join(publico, nome), 'utf8');
    assert.match(modulo, /from\s*["']\.\/maplibre-gl-shared\.mjs["']/, nome);
  }
});

test('o mapa não traz o MapLibre pelo empacotador', () => {
  // Um `import('maplibre-gl')` ou um `import 'maplibre-gl/…css'` de valor
  // voltava a pôr no pacote do Next a segunda cópia do código partilhado, ou
  // a folha de estilo a bloquear a pintura de todas as páginas. Os tipos
  // continuam a vir do pacote: `import type` não traz um byte.
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const mapa = readFileSync(join(raiz, 'componentes', 'Mapa.tsx'), 'utf8');
  const semComentarios = mapa.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // `typeof import('maplibre-gl')` é um tipo, e não traz nada.
  assert.doesNotMatch(semComentarios, /(?<!typeof\s+)import\s*\(\s*['"]maplibre-gl/);
  assert.doesNotMatch(semComentarios, /import\s+['"]maplibre-gl/);
  // E o `import()` que o substitui passa ao lado do empacotador.
  assert.match(mapa, /import\(\s*\/\*\s*webpackIgnore:\s*true\s*\*\//);
});
