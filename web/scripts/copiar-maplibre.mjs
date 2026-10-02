/**
 * Põe o MapLibre em `public/`, na versão que está instalada — o módulo
 * principal, o processador, o código que os dois partilham, e a folha de
 * estilo.
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
 * **E O MÓDULO PRINCIPAL TAMBÉM VEM DAQUI (P3-007).** Era o empacotador que o
 * metia num pedaço seu — e com ele uma segunda cópia do código partilhado,
 * porque o processador continuava a ir buscar a primeira a esta pasta. Medido
 * no início da região real: 137 kB comprimidos de JavaScript descarregados
 * duas vezes, e analisados duas vezes. Servidos os dois daqui, o principal e o
 * processador importam o MESMO `maplibre-gl-shared.mjs`, e a cache do
 * navegador serve-o uma vez só (`Mapa.tsx`, `carregarMapLibre`).
 *
 * **E A FOLHA DE ESTILO (P3-028).** Era um `import` de CSS no `Mapa.tsx`, e o
 * Next punha-a no `<head>` a bloquear a pintura — 83 kB, e à frente de
 * qualquer pixel. Daqui, o mapa pede-a quando se vai desenhar, e só onde há
 * mapa.
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

export const FICHEIROS_DO_MAPA = [
  'maplibre-gl.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl.css',
];

const raizDaWeb = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = join(raizDaWeb, 'public', 'maplibre');
const destino = join(pasta, version);

mkdirSync(destino, { recursive: true });
for (const nome of FICHEIROS_DO_MAPA) copyFileSync(join(dist, nome), join(destino, nome));

for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
  if (entrada.isDirectory() && entrada.name !== version) {
    rmSync(join(pasta, entrada.name), { recursive: true, force: true });
  }
}

if (!process.env.CI) {
  console.log(`maplibre-gl ${version}: copiado para public/maplibre/${version}/`);
}
