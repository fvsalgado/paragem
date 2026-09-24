/**
 * Gera os ícones do sítio a partir da marca.
 *
 * Os ficheiros que este script escreve estão versionados — um ícone é um
 * artefacto, não se compila a cada pedido —, mas a receita fica aqui para que
 * ninguém tenha de os redesenhar à mão quando a marca ou a cor mudarem. Corre
 * uma vez e escreve tudo:
 *
 *   src/app/favicon.ico                   16, 32 e 48 px, o separador do navegador
 *   src/app/icon.svg                      o mesmo desenho, sem tamanho
 *   src/app/apple-icon.png                180 px, o ecrã principal do iPhone
 *   public/icones/paragem-192.png         os dois tamanhos que o manifesto pede
 *   public/icones/paragem-512.png
 *   public/icones/paragem-512-mascara.png e a versão para a máscara do Android
 *
 * O desenho vem de `src/lib/marca.ts`, que é o mesmo módulo que a `Marca` usa:
 * o ícone no telemóvel é o desenho que está no cabeçalho. Há um teste
 * (`tests/marca.test.mts`) que confere o `icon.svg` contra os traços — quem
 * mudar a marca e se esquecer de correr isto fica a saber.
 *
 * Os ícones vestem a cor do PRODUTO em todas as regiões: são um ficheiro só
 * para todos os anfitriões, e a marca que se instala é o Paragem.pt. A região
 * que tem cara própria mostra-a na faixa, no `theme-color` e nos cartões.
 *
 * Levantado do `scripts/gerar-icones.mjs` do Coreto, que resolveu primeiro os
 * pormenores do `.ico` — ver os comentários de lá, que vieram com o código.
 * O cartão de partilha não se faz aqui: é uma rota do sítio (`lib/cartao.tsx`),
 * porque o de cada região e o de cada paragem têm nomes que o código não sabe.
 *
 *   CHROMIUM_PATH=/caminho/para/o/chrome node scripts/gerar-icones.mjs
 *
 * Sem `CHROMIUM_PATH`, usa o Chromium que o Playwright do projeto instalou
 * (`npx playwright install chromium`).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  COR_DO_PRODUTO,
  MARCA_P_TRACADO,
  MARCA_TINTA,
  TINTA_DO_PRODUTO,
} from '../src/lib/marca.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTAVEL = process.env.CHROMIUM_PATH ?? process.env.PLAYWRIGHT_CHROMIUM_PATH;

const TINTA_LARGURA = MARCA_TINTA.direita - MARCA_TINTA.esquerda;
const TINTA_ALTURA = MARCA_TINTA.fundo - MARCA_TINTA.topo;
const TINTA_MEIO_X = MARCA_TINTA.esquerda + TINTA_LARGURA / 2;
const TINTA_MEIO_Y = MARCA_TINTA.topo + TINTA_ALTURA / 2;

/**
 * A marca numa caixa quadrada, centrada e com o fundo pintado.
 *
 * Os tamanhos pequenos dão a ESCALA e não a parte: meia, uma, uma e meia. É
 * o que faz cada borda cair em pixéis inteiros (ver `MARCA_P`), e para
 * isso a deslocação também tem de ser inteira — arredonda-se, e a marca fica
 * no máximo meio pixel fora do meio, o que ninguém vê; um traço a meio pixel
 * vê-se, porque fica cinzento.
 *
 * `passo` é de quanto em quanto se arredonda a deslocação: 1 para um ficheiro
 * que só se mostra a um tamanho, 2 para o `icon.svg`, que o navegador reduz a
 * metade no separador — uma deslocação ímpar passava a meio pixel.
 *
 * `parte` é quanto do lado do ícone a marca ocupa, nos tamanhos grandes. Não
 * é gosto: um ícone normal quer folga para não bater nas bordas, e um ícone
 * `maskable` do
 * Android tem de caber numa circunferência com 80% do lado — a diagonal de um
 * quadrado inscrito nessa circunferência dá 56%, e é daí que vem o 0,55.
 *
 * `raio` arredonda os cantos do fundo, e só serve onde quem mostra o ícone
 * não o recorta: no separador do navegador. O iPhone e o Android recortam à
 * forma deles, e para esses o fundo vai até ao canto — um canto transparente
 * aparecia preto no ecrã principal do iPhone.
 */
function svgDaMarca({ lado, parte, escala: aoPixel, passo = 1, raio = 0 }) {
  const escala = aoPixel ?? (parte * lado) / Math.max(TINTA_LARGURA, TINTA_ALTURA);
  const deslocar = (valor) => (aoPixel ? Math.round(valor / passo) * passo : valor);
  const x = deslocar(lado / 2 - TINTA_MEIO_X * escala);
  const y = deslocar(lado / 2 - TINTA_MEIO_Y * escala);
  const cantos = raio > 0 ? ` rx="${(raio * lado).toFixed(2)}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${lado}" height="${lado}">
  <rect width="${lado}" height="${lado}"${cantos} fill="${COR_DO_PRODUTO}"/>
  <g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${escala.toFixed(5)})" fill="${TINTA_DO_PRODUTO}">
    <path fill-rule="evenodd" d="${MARCA_P_TRACADO}"/>
  </g>
</svg>
`;
}

/** Rasteriza um SVG ao tamanho exato, sem margens nem barras. */
async function rasterizar(browser, svg, lado) {
  const pagina = await browser.newPage({ viewport: { width: lado, height: lado } });
  await pagina.setContent(
    `<!doctype html><html><body style="margin:0;line-height:0">${svg}</body></html>`,
  );
  const png = await pagina.screenshot({ clip: { x: 0, y: 0, width: lado, height: lado } });
  await pagina.close();
  return png;
}

/**
 * Os pixéis crus de um SVG, em RGBA, tal como o Chromium os desenha.
 *
 * É o que o `.ico` precisa. Tirar a fotografia em PNG e metê-la lá dentro
 * parece mais simples e não serve: o Chromium escreve um PNG sem canal alfa
 * quando a imagem é opaca, e o Next recusa-o na compilação («The PNG is not in
 * RGBA format!»). Passar pelo `canvas` dá os quatro canais sempre.
 */
async function pixeisDaMarca(browser, svg, lado) {
  const pagina = await browser.newPage({ viewport: { width: lado, height: lado } });
  const dados = await pagina.evaluate(
    async ({ svg, lado }) => {
      const imagem = new Image();
      imagem.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await imagem.decode();
      const tela = document.createElement('canvas');
      tela.width = lado;
      tela.height = lado;
      const pincel = tela.getContext('2d');
      pincel.drawImage(imagem, 0, 0, lado, lado);
      return Array.from(pincel.getImageData(0, 0, lado, lado).data);
    },
    { svg, lado },
  );
  await pagina.close();
  return Buffer.from(dados);
}

/**
 * Um bitmap de 32 bits, no formato que vai dentro de um `.ico`: a altura no
 * cabeçalho é o DOBRO da imagem (contava com uma máscara por baixo), as
 * linhas escrevem-se de baixo para cima, e a ordem dos canais é BGRA. A
 * máscara vai a zeros — com 32 bits quem manda na transparência é o alfa —,
 * mas tem de lá estar, com as linhas alinhadas a quatro bytes.
 */
function bitmapParaIco(pixeis, lado) {
  const cabecalho = Buffer.alloc(40);
  cabecalho.writeUInt32LE(40, 0);
  cabecalho.writeInt32LE(lado, 4);
  cabecalho.writeInt32LE(lado * 2, 8);
  cabecalho.writeUInt16LE(1, 12);
  cabecalho.writeUInt16LE(32, 14);

  const cores = Buffer.alloc(lado * lado * 4);
  for (let linha = 0; linha < lado; linha += 1) {
    const origem = (lado - 1 - linha) * lado * 4;
    for (let coluna = 0; coluna < lado; coluna += 1) {
      const de = origem + coluna * 4;
      const para = (linha * lado + coluna) * 4;
      cores[para] = pixeis[de + 2];
      cores[para + 1] = pixeis[de + 1];
      cores[para + 2] = pixeis[de];
      cores[para + 3] = pixeis[de + 3];
    }
  }

  const bytesPorLinhaDaMascara = Math.ceil(lado / 8 / 4) * 4;
  const mascara = Buffer.alloc(bytesPorLinhaDaMascara * lado);

  return Buffer.concat([cabecalho, cores, mascara]);
}

/** Junta vários tamanhos num `.ico`: seis bytes de cabeçalho, dezasseis por tamanho, as imagens. */
function empacotarIco(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);

  const entradas = [];
  const corpos = [];
  let deslocamento = 6 + imagens.length * 16;

  for (const { lado, pixeis } of imagens) {
    const corpo = bitmapParaIco(pixeis, lado);
    const entrada = Buffer.alloc(16);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 0);
    entrada.writeUInt8(lado >= 256 ? 0 : lado, 1);
    entrada.writeUInt8(0, 2);
    entrada.writeUInt8(0, 3);
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(corpo.length, 8);
    entrada.writeUInt32LE(deslocamento, 12);
    entradas.push(entrada);
    corpos.push(corpo);
    deslocamento += corpo.length;
  }

  return Buffer.concat([cabecalho, ...entradas, ...corpos]);
}

async function escrever(caminho, dados) {
  const destino = resolve(RAIZ, caminho);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, dados);
  console.log(`✓ ${caminho} (${(dados.length / 1024).toFixed(1)} kB)`);
}

/** O canto do separador: arredondado, mas pouco — a 16 px, mais do que isto come a placa. */
const RAIO_DO_SEPARADOR = 0.18;

const browser = await chromium.launch(EXECUTAVEL ? { executablePath: EXECUTAVEL } : {});

try {
  // O separador do navegador: 16, 32 e 48 px, à escala de meio, um e um e
  // meio — os três em que cada borda cai em pixéis inteiros.
  const ico = empacotarIco(
    await Promise.all(
      [
        [16, 0.5],
        [32, 1],
        [48, 1.5],
      ].map(async ([lado, escala]) => ({
        lado,
        pixeis: await pixeisDaMarca(
          browser,
          svgDaMarca({ lado, escala, raio: RAIO_DO_SEPARADOR }),
          lado,
        ),
      })),
    ),
  );
  await escrever('src/app/favicon.ico', ico);

  // O mesmo desenho sem tamanho, para quem o souber ler — é o que o Chrome e
  // o Firefox preferem ao `.ico`. Desenhado a 32, à escala certa e com
  // deslocação par, para cair em pixéis inteiros a 16, a 32 e a 48.
  await escrever(
    'src/app/icon.svg',
    svgDaMarca({ lado: 32, escala: 1, passo: 2, raio: RAIO_DO_SEPARADOR }).replace(
      / width="\d+" height="\d+"/,
      '',
    ),
  );

  // O ecrã principal do iPhone. Sem transparência, que o iOS não perdoa.
  await escrever(
    'src/app/apple-icon.png',
    await rasterizar(browser, svgDaMarca({ lado: 180, parte: 0.66 }), 180),
  );

  // Os dois tamanhos que o manifesto pede, e a versão para a máscara redonda
  // do Android — essa com a marca mais pequena, para nada ser cortado.
  await escrever(
    'public/icones/paragem-192.png',
    await rasterizar(browser, svgDaMarca({ lado: 192, parte: 0.68 }), 192),
  );
  await escrever(
    'public/icones/paragem-512.png',
    await rasterizar(browser, svgDaMarca({ lado: 512, parte: 0.68 }), 512),
  );
  await escrever(
    'public/icones/paragem-512-mascara.png',
    await rasterizar(browser, svgDaMarca({ lado: 512, parte: 0.55 }), 512),
  );
} finally {
  await browser.close();
}
