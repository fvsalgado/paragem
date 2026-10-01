/**
 * Põe o processador do MapLibre em `public/`, na versão que está instalada.
 *
 * Desde a versão 6, o `maplibre-gl` deixou de ser um ficheiro só. O trabalho
 * pesado do mapa corre num Web Worker que vive num módulo à parte
 * (`maplibre-gl-worker.mjs`), e esse importa o `maplibre-gl-shared.mjs` que
 * está ao lado. A biblioteca descobre onde eles estão pelo `import.meta.url`
 * do módulo principal — e dentro de um pacote do Next esse endereço não é um
 * `https://…`: a biblioteca desiste em silêncio, o processador não arranca, e
 * o mapa fica uma tela que nunca pede um mosaico. O Coreto encontrou isto ao
 * subir à 6, num Chromium, contra a compilação de produção.
 *
 * A saída é dizer à biblioteca onde está o processador (`setWorkerUrl`, no
 * `Mapa.tsx`) e garantir que ele está lá: os dois ficheiros copiados tal como
 * saem do pacote, sem passarem pelo empacotador — que os trataria como
 * recursos soltos, com nomes com hash, e partia o `import` relativo entre
 * eles.
 *
 * **A versão vai no caminho** de propósito. Sem ela, um navegador com o
 * processador antigo em cache falava com um módulo principal novo, e os dois
 * lados de um Worker que não são da mesma versão falham de maneiras que não
 * dizem porquê. Com ela, o caminho muda quando a versão muda, e a pasta pode
 * ser servida como imutável (`next.config.mjs`).
 *
 * E a pasta tem de estar na lista do `regiao-host.ts`: tudo o que não está lá
 * é reescrito para dentro de uma região, e o processador dava 404.
 *
 * Corre no `postinstall`, antes do `build` e antes do `dev`, e é idempotente:
 * copia a versão instalada e apaga as outras. O `tests/maplibre.test.mts`
 * recusa uma cópia que não bata byte a byte com o pacote.
 */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pacote = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(pacote, 'utf8'));
const dist = join(dirname(pacote), 'dist');

export const FICHEIROS_DO_PROCESSADOR = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const raizDaWeb = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raizDaWeb, 'public', 'maplibre');
const destino = join(pasta, version);

mkdirSync(destino, { recursive: true });
for (const nome of FICHEIROS_DO_PROCESSADOR) copyFileSync(join(dist, nome), join(destino, nome));

for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
  if (entrada.isDirectory() && entrada.name !== version) {
    rmSync(join(pasta, entrada.name), { recursive: true, force: true });
  }
}

if (!process.env.CI) {
  console.log(`maplibre-gl ${version}: processador copiado para public/maplibre/${version}/`);
}
