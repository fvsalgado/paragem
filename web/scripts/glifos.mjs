/**
 * Gera os glifos do mapa a partir do tipo de letra que o sítio já usa.
 *
 * O MapLibre exige um `glyphs` para qualquer etiqueta de texto — o
 * `localIdeographFontFamily` só cobre CJK, não o latim, e sem isto as camadas
 * de nomes recusam-se a carregar e o mapa inteiro fica cinzento. Descobriu-se
 * assim, com o mapa a falhar em silêncio.
 *
 * Um servidor de glifos de terceiro resolvia numa linha e trazia o que o §7
 * proíbe: mais um sítio de onde isto pode deixar de funcionar, e mais um
 * terceiro a ver quem consultou que mapa. Geram-se cá, uma vez, e vão no
 * sítio como qualquer outro ficheiro.
 *
 * TODAS AS GAMAS DO PLANO BÁSICO, e não só as quatro do latim. Esta foi a
 * lição mais cara do mapa até hoje.
 *
 * A primeira versão gerava 0–1023 com o argumento de que «o resto são
 * alfabetos que não aparecem num mapa de Portugal». Aparecem: os travessões,
 * as aspas curvas e as reticências estão em U+2000–206F, a gama 8192–8447, e
 * os nomes do OpenStreetMap estão cheios deles.
 *
 * E o castigo não é um caractere em falta. **Quando um ficheiro de glifos dá
 * 404, o MapLibre deita fora o MOSAICO INTEIRO** — ruas, água, edifícios,
 * tudo — sem um erro na consola. O mapa ficava em branco por cima da cidade,
 * que é a maior vila da região, e funcionava dez quilómetros ao lado. Passei
 * uma tarde a suspeitar dos mosaicos, do tamanho dos mosaicos, da margem do
 * mapa e da paleta, e era um `404` num ficheiro de 60 kB.
 *
 * As gamas vazias custam umas dezenas de bytes cada e são respostas válidas.
 * O que custa caro é a que falta.
 *
 * O tipo de letra é o Atkinson Hyperlegible — o mesmo do §8, desenhado para
 * quem vê mal, sob SIL Open Font License, que permite redistribuir.
 *
 * CORRE-SE À MÃO, e as saídas ficam no repositório. Os glifos dependem só do
 * tipo de letra: gerá-los em cada corrida do CI seria pedir-lhe um módulo
 * nativo e 90 segundos para produzir exatamente os mesmos ficheiros. Quando o
 * tipo de letra mudar, corre-se outra vez:
 *
 *     npm install --no-save fontnik
 *     node scripts/glifos.mjs regular.ttf bold.ttf
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fontnik = require('fontnik');

const DESTINO = path.resolve(process.cwd(), 'public', 'glifos');
const GAMAS = 256; // o plano básico inteiro: 0–65535, de 256 em 256

// AS DUAS VARIANTES, mesmo que o estilo só use a normal.
//
// A negra custa 252 ficheiros e 1 MB que ninguém descarrega — só se pede o
// que se usa. E paga-se de bom grado: o dia em que uma camada de nomes pedir
// negrito, o que acontece sem ela é o mapa ficar em branco, que é o defeito
// que este ficheiro existe para não voltar a acontecer.
const VARIANTES = [
  { nome: 'Atkinson Hyperlegible Regular', ficheiro: process.argv[2] },
  { nome: 'Atkinson Hyperlegible Bold', ficheiro: process.argv[3] },
];

for (const v of VARIANTES) {
  if (!v.ficheiro || !fs.existsSync(v.ficheiro)) {
    console.error(`falta o .ttf de «${v.nome}»`);
    process.exit(1);
  }
  const dados = fs.readFileSync(v.ficheiro);
  const pasta = path.join(DESTINO, v.nome);
  fs.mkdirSync(pasta, { recursive: true });
  for (let i = 0; i < GAMAS; i++) {
    const de = i * 256;
    const ate = de + 255;
    await new Promise((resolve, reject) => {
      fontnik.range({ font: dados, start: de, end: ate }, (erro, pbf) => {
        if (erro) return reject(erro);
        fs.writeFileSync(path.join(pasta, `${de}-${ate}.pbf`), pbf);
        resolve();
      });
    });
  }
  console.log(`glifos: ${v.nome} → ${GAMAS} gamas`);
}
