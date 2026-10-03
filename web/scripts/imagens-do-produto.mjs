/**
 * As imagens do PRODUTO, geradas e não desenhadas à mão: os ícones, a captura
 * do telemóvel da página do produto, e a imagem de partilha.
 *
 *     node scripts/imagens-do-produto.mjs icones
 *     node scripts/imagens-do-produto.mjs telemovel --regiao <demonstração>
 *     node scripts/imagens-do-produto.mjs partilha
 *
 * As três saem do Chromium do Playwright, que já cá está para os testes: um
 * pacote de imagem a mais era uma dependência para três ficheiros que mudam
 * uma vez por ano. O resultado vai para o repositório — o sítio não gera
 * imagens a pedido —, e este ficheiro é a receita para o voltar a fazer.
 *
 * **ÍCONES.** A fonte é UMA: `src/lib/marca-do-produto.ts`, o mesmo desenho
 * que o cabeçalho mostra. Dois desenhos do «p», e cada um onde serve:
 *
 * - AO PÍXEL, para 16, 32 e 48 px: o `app/icon.svg`, que troca de azulejo com
 *   o tema do navegador, e o `favicon.ico`, que não pode trocar e leva o
 *   azul-noite, o da barra clara. Reduzir o desenho grande não servia: a 16 px
 *   nenhum píxel da letra chegava a 3:1.
 * - VETORIAL, de 180 px para cima: o `apple-icon.png` e os PNG do manifesto,
 *   em papel. Dois cortes: com os cantos redondos e transparentes, para onde o
 *   desenho fica tal e qual (o manifesto «any»); e sem cantos, a cheio, para
 *   onde o sistema recorta à sua maneira — o iOS põe preto onde houver
 *   transparência, e o Android recorta o ícone «maskable» num círculo, por
 *   isso o desenho encolhe para dentro da zona segura.
 *
 * **TELEMÓVEL.** Uma captura REAL de uma região de DEMONSTRAÇÃO a correr, e
 * nunca de um cliente: a página do produto responde a qualquer anfitrião que
 * o mapa de domínios não conheça, e uma imagem expõe o que uma frase expõe —
 * mais, até, porque traz o nome, as terras e a rede. A paragem é a que tem
 * mais partidas nos dados, como nos testes; a hora é fixa, para a captura não
 * mudar com o relógio de quem a gera. O enquadramento começa no título da
 * paragem: é a resposta a «o que passa a seguir?», que é o produto.
 * Precisa do sítio e dos dados a correr (`npm run dados`, `npm run servir`,
 * com o mesmo ambiente dos testes).
 *
 * **PARTILHA.** 1200 × 630, o tamanho que as pré-visualizações do WhatsApp,
 * do Facebook e companhia esperam. Desenha-se dentro da própria página do
 * produto, que já tem a letra e as cores carregadas: sem ficheiros de letra
 * a mais no repositório, e sem uma segunda cópia das cores. A marca é a
 * palavra a cores, do mesmo módulo.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  CORES_CLARO,
  PAPEL,
  iconeAoPixel,
  iconeDoSeparador,
  iconeVetorial,
  palavra,
} from '../src/lib/marca-do-produto.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = join(WEB, 'public', 'produto');
const [, , comando, ...resto] = process.argv;
const opcao = (nome, omissao) => {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 && resto[i + 1] ? resto[i + 1] : omissao;
};

const SITIO = opcao('sitio', 'http://127.0.0.1:4321');
const DADOS = opcao('dados', process.env.PARAGEM_DADOS ?? 'http://127.0.0.1:4322');

async function abrir(opcoes = {}) {
  return await chromium.launch({
    ...(process.env.PARAGEM_CHROMIUM ? { executablePath: process.env.PARAGEM_CHROMIUM } : {}),
    // As regiões vivem em `*.localhost`, que resolve no navegador e não no DNS.
    args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1'],
    ...opcoes,
  });
}

/** Um PNG (ou WebP) codificado pelo próprio navegador, a partir de um PNG. */
async function codificar(pagina, png, tipo, qualidade) {
  const url = await pagina.evaluate(
    async ({ dados, tipo, qualidade }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${dados}`;
      await img.decode();
      const tela = document.createElement('canvas');
      tela.width = img.naturalWidth;
      tela.height = img.naturalHeight;
      tela.getContext('2d').drawImage(img, 0, 0);
      return tela.toDataURL(tipo, qualidade);
    },
    { dados: png.toString('base64'), tipo, qualidade },
  );
  return Buffer.from(url.split(',')[1], 'base64');
}

// --- ícones ------------------------------------------------------------------

/**
 * O SVG desenhado num quadrado de `lado` px: `escala` é a fração do quadrado
 * que o desenho ocupa, e `fundo` o que fica por trás (transparente ou a
 * cheio).
 */
async function icone(pagina, svg, lado, { escala = 1, fundo = 'transparent' } = {}) {
  await pagina.setViewportSize({ width: lado, height: lado });
  const fonte = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<div id="q" style="width:${lado}px;height:${lado}px;display:grid;place-items:center;background:${fundo}">` +
      `<img src="${fonte}" style="width:${lado * escala}px;height:${lado * escala}px;display:block"></div>` +
      `</body></html>`,
  );
  await pagina.locator('img').evaluate((img) => img.decode());
  return await pagina.locator('#q').screenshot({ omitBackground: true });
}

/**
 * Um `.ico` com PNG lá dentro — o formato aceita-os desde 2007, e todos os
 * navegadores os leem. Cabeçalho de 6 bytes, uma entrada de 16 por imagem, e
 * as imagens a seguir.
 */
function ico(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  let deslocamento = 6 + 16 * imagens.length;
  const entradas = imagens.map(({ lado, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0);
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += png.length;
    return e;
  });
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)]);
}

async function icones() {
  const navegador = await abrir();
  const pagina = await navegador.newPage({ deviceScaleFactor: 1 });
  mkdirSync(PUBLICO, { recursive: true });

  writeFileSync(join(WEB, 'src', 'app', 'icon.svg'), iconeDoSeparador());

  // Ao píxel, cada tamanho com a sua grelha, e no azulejo azul-noite.
  const pequenos = [];
  for (const lado of [16, 32, 48]) {
    pequenos.push({ lado, png: await icone(pagina, iconeAoPixel(lado, 'noite'), lado) });
  }
  writeFileSync(join(WEB, 'src', 'app', 'favicon.ico'), ico(pequenos));

  // O iOS recorta os cantos à sua maneira e pinta de preto a transparência:
  // o quadrado vai a cheio.
  writeFileSync(
    join(WEB, 'src', 'app', 'apple-icon.png'),
    await icone(pagina, iconeVetorial({ cantos: false }), 180),
  );
  for (const lado of [192, 512]) {
    writeFileSync(join(PUBLICO, `icone-${lado}.png`), await icone(pagina, iconeVetorial(), lado));
  }
  // «maskable»: o Android recorta num círculo de 80 % do lado, e o desenho
  // tem de caber lá dentro inteiro.
  writeFileSync(
    join(PUBLICO, 'icone-mascaravel-512.png'),
    await icone(pagina, iconeVetorial({ cantos: false, escala: 0.7 }), 512),
  );
  await navegador.close();
  console.log(
    'ícones: src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png, public/produto/icone-*.png',
  );
}

// --- a captura do telemóvel -------------------------------------------------

/**
 * Um instante em hora de Lisboa, com o desvio certo para esse dia: +01:00 no
 * verão e +00:00 no inverno. Cravar um dos dois punha a captura uma hora ao
 * lado em metade do ano.
 */
function emLisboa(dia, hora) {
  for (const desvio of ['+00:00', '+01:00']) {
    const instante = new Date(`${dia}T${hora}:00${desvio}`);
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instante);
    if (local === hora) return instante;
  }
  throw new Error(`${dia} ${hora} não existe em Lisboa`);
}

/** O próximo dia útil (hoje, se for), como `AAAA-MM-DD` de Lisboa. */
function proximoDiaUtil() {
  const d = new Date();
  for (;;) {
    const dia = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short' })
      .format(d)
      .toLowerCase();
    if (!['sat', 'sun'].includes(dia)) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(d);
}

async function telemovel() {
  const regiao = opcao('regiao', null);
  if (!regiao) throw new Error('falta --regiao <id de uma região de demonstração>');
  const declaracao = await (await fetch(`${DADOS}/${regiao}/regiao.json`)).json();
  // NUNCA UM CLIENTE: ver o comentário do topo.
  if (!declaracao.demonstracao) throw new Error(`${regiao} não é uma região de demonstração`);
  const paragens = await (await fetch(`${DADOS}/${regiao}/paragens.json`)).json();
  const paragem = [...paragens].sort(
    (a, b) => b.partidas - a.partidas || a.id.localeCompare(b.id),
  )[0];
  const porta = new URL(SITIO).port || '80';
  const endereco = `http://${regiao}.localhost:${porta}/rede/paragens/${paragem.id}/`;

  const navegador = await abrir();
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  });
  const pagina = await contexto.newPage();
  // Uma manhã de dia útil, antes das primeiras partidas: o «A seguir» cheio.
  const [dia, hora] = opcao('quando', `${proximoDiaUtil()}T07:58`).split('T');
  await pagina.clock.setFixedTime(emLisboa(dia, hora));
  await pagina.goto(endereco, { waitUntil: 'networkidle' });
  await pagina.getByRole('heading', { name: 'A seguir' }).waitFor();
  const topo = await pagina.locator('h1').evaluate((h) => h.getBoundingClientRect().top + scrollY);
  const png = await pagina.screenshot({
    clip: { x: 0, y: Math.max(0, topo - 20), width: 390, height: 844 },
    fullPage: true,
  });
  writeFileSync(join(PUBLICO, 'telemovel.webp'), await codificar(pagina, png, 'image/webp', 0.86));
  await navegador.close();
  console.log(`telemóvel: ${endereco} a ${dia} às ${hora} → public/produto/telemovel.webp`);
}

// --- a imagem de partilha ---------------------------------------------------

async function partilha() {
  const navegador = await abrir();
  const pagina = await navegador.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  // A página do produto, pela letra e pelas cores; o conteúdo troca-se.
  await pagina.goto(`${SITIO}/`, { waitUntil: 'networkidle' });
  const { viewBox, corpo } = palavra('feixe', { cores: CORES_CLARO, fundo: PAPEL });
  const marca = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${corpo}</svg>`;
  await pagina.evaluate(
    ({ marca }) => {
      document.body.className = '';
      document.body.innerHTML = `
        <div class="partilha">
          <div class="partilha-texto">
            <p class="partilha-marca">${marca}</p>
            <p class="partilha-titulo">Os transportes de um território, num sítio só.</p>
            <p class="partilha-modos">Autocarros · comboios · transporte a pedido · bicicletas · expressos · táxis</p>
          </div>
          <div class="partilha-telemovel"><img src="/produto/telemovel.webp" alt=""></div>
        </div>`;
      const estilo = document.createElement('style');
      estilo.textContent = `
        html, body { margin: 0; background: var(--fundo); overflow: hidden; }
        .partilha { width: 1200px; height: 630px; box-sizing: border-box; padding: 0 72px 0 80px;
          display: grid; grid-template-columns: 1fr 300px; gap: 56px; align-items: center;
          color: var(--texto); border-top: 12px solid var(--marca); }
        .partilha-marca { margin: 0 0 40px; }
        .partilha-marca svg { display: block; height: 84px; width: auto; }
        .partilha-titulo { font-size: 62px; line-height: 1.08; font-weight: 700; margin: 0 0 32px; }
        .partilha-modos { font-size: 25px; color: var(--texto-secundario); margin: 0; line-height: 1.4; }
        .partilha-telemovel { align-self: end; height: 560px; overflow: hidden;
          border: 12px solid var(--texto); border-bottom: 0; border-radius: 40px 40px 0 0;
          background: #fff; }
        .partilha-telemovel img { width: 100%; display: block; }`;
      document.head.append(estilo);
    },
    { marca },
  );
  await pagina.locator('.partilha-telemovel img').evaluate((img) => img.decode());
  await pagina.evaluate(() => document.fonts.ready);
  const png = await pagina.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  writeFileSync(join(PUBLICO, 'partilha.png'), png);
  await navegador.close();
  console.log(`partilha: public/produto/partilha.png (${Math.round(png.length / 1024)} kB)`);
}

const comandos = { icones, telemovel, partilha };
if (!comandos[comando]) {
  console.error(
    'uso: node scripts/imagens-do-produto.mjs icones | telemovel --regiao <id> | partilha',
  );
  process.exit(2);
}
await comandos[comando]();
