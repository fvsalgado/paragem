/**
 * Lighthouse de acessibilidade, em telemóvel — o critério do §9: **≥ 95**.
 *
 * Corre à parte do Playwright porque é uma ferramenta diferente a medir uma
 * coisa diferente: o axe diz se há violações, o Lighthouse dá uma nota que
 * inclui coisas que o axe não pontua. As duas juntas apanham mais do que
 * qualquer uma sozinha, e nenhuma das duas apanha metade do que apanha uma
 * pessoa que use leitor de ecrã todos os dias.
 *
 *   node tests/lighthouse.mjs                 # usa o sítio já servido
 *   PARAGEM_CHROMIUM=/caminho node tests/…    # com um Chromium específico
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const MINIMO = Number(process.env.PARAGEM_LIGHTHOUSE_MINIMO ?? 95);

/**
 * Cada região no seu anfitrião — os mesmos de `tests/anfitrioes.ts`, e a
 * descoberta é a mesma de `tests/dados-da-regiao.ts`, escritas aqui porque
 * isto é JavaScript sem construção e aqueles ficheiros são TypeScript.
 *
 * NENHUM CLIENTE ESTÁ ESCRITO AQUI: a região medida é a que esta raiz
 * construiu e não é de demonstração (§11.6); sem nenhuma, mede-se a
 * demonstração. As páginas saem dos dados dela — a paragem com mais partidas,
 * a linha com mais viagens, o concelho com mais paragens —, e os modos que ela
 * não tem não se medem, porque não existem.
 */
const PORTA = process.env.PARAGEM_PORTA ?? '4321';
const PRODUTO = `http://127.0.0.1:${PORTA}`;
const DEMONSTRACOES = ['prova', 'prova-municipio'];
const BUILD = resolve(
  process.env.PARAGEM_BUILD ?? (existsSync(join('..', 'build')) ? join('..', 'build') : 'build'),
);

const construidas = existsSync(BUILD)
  ? readdirSync(BUILD, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(BUILD, e.name, 'sitio', 'regiao.json')))
      .map((e) => e.name)
      .sort()
  : [];
const REGIAO =
  process.env.PARAGEM_REGIAO_DE_TESTE ??
  construidas.find((r) => !DEMONSTRACOES.includes(r)) ??
  'prova';
const R = `http://${REGIAO}.localhost:${PORTA}`;
const PROVA = `http://prova.localhost:${PORTA}`;

const dados = (nome) => {
  const f = join(BUILD, REGIAO, 'sitio', nome);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
const maior = (lista, campo) =>
  [...(lista ?? [])].sort((a, b) => b[campo] - a[campo] || a.id.localeCompare(b.id))[0];

const paragem = maior(dados('paragens.json'), 'partidas');
const linha = maior(dados('linhas.json'), 'viagens');
const concelho = maior(dados('concelhos.json'), 'paragens');
// OS MODOS QUE A REGIÃO DECLARA, MENOS OS QUE O AMBIENTE DESLIGA.
//
// Faltava a segunda metade, e media-se um 404 de propósito: a página de um
// módulo desligado não existe, o Lighthouse dá-lhe 0, e o guarda do §9 — que
// exige 95 — reprovava a dizer que a acessibilidade estava má. Estava a medir
// uma página que ninguém serve.
//
// Isto é o terceiro sítio com a mesma causa. O `PARAGEM_MODULOS_DESLIGADOS`
// tem de chegar a tudo o que olha para o sítio, não só a quem o levanta.
const desligados = (process.env.PARAGEM_MODULOS_DESLIGADOS ?? '')
  .split(',')
  .map((x) => x.trim().split('='))
  .filter(([r]) => r === REGIAO)
  .flatMap(([, m]) => (m ?? '').split('+'))
  .filter(Boolean);
const modos = Object.keys(dados('modos.json') ?? {}).filter((m) => !desligados.includes(m));
const temAPedido = (dados('a-pedido.json')?.circuitos ?? []).length > 0;
const doModo = (m, nome) => (modos.includes(m) ? [[nome, `${R}/modos/${m}/`]] : []);

/** Uma de cada molde, as mais carregadas — se parte, parte onde há mais. */
const PAGINAS = [
  ['produto', `${PRODUTO}/`],
  ['mapa da região', `${R}/`],
  ['a rede', `${R}/rede/`],
  ['demonstração', `${PROVA}/`],
  ['como chegar', `${R}/viagem/`],
  ...(temAPedido ? [['a pedido', `${R}/a-pedido/`]] : []),
  ...doModo('bicicleta', 'bicicletas'),
  ...doModo('taxi', 'táxis'),
  // A página com o quadro de horário dos urbanos municipais: quando a região
  // os tem, é a única do sítio com uma tabela de dados, e uma tabela mal feita
  // é a forma mais rápida de perder pontos aqui — e de deixar quem usa leitor
  // de ecrã sem saber de que viagem é cada hora.
  ...doModo('urbano-municipal', 'urbanos municipais'),
  ...(paragem ? [['paragem', `${R}/rede/paragens/${paragem.id}/`]] : []),
  ...(linha ? [['linha', `${R}/rede/linhas/${linha.id}/`]] : []),
  ...(concelho ? [['concelho', `${R}/rede/concelhos/${concelho.id}/`]] : []),
  ['tarifário', `${R}/rede/tarifario/`],
  ['acessibilidade', `${R}/acessibilidade/`],
];

// Um servidor em baixo dá 0 em todas as páginas, e 0 parece um defeito nosso.
// É outra coisa: é a medição não ter acontecido. Diz-se qual das duas é.
try {
  const r = await fetch(`${PRODUTO}/`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`respondeu ${r.status}`);
} catch (e) {
  console.error(`Não há nada a responder em ${PRODUTO}: ${e.message}`);
  console.error('Levanta o sítio primeiro:  npm run servir');
  process.exit(2);
}

const chrome = await launch({
  chromePath: process.env.PARAGEM_CHROMIUM,
  chromeFlags: [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // Os `*.localhost` das regiões resolvem no navegador, não no DNS da máquina.
    '--host-resolver-rules=MAP *.localhost 127.0.0.1',
  ],
});

let falhou = false;
try {
  for (const [nome, endereco] of PAGINAS) {
    const r = await lighthouse(
      endereco,
      { port: chrome.port, output: 'json', logLevel: 'error' },
      // `mobile` de propósito: o §9 diz «Lighthouse de acessibilidade ≥ 95 em
      // telemóvel», e é onde isto se usa — na paragem, de pé.
      { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility'] } },
    );
    const nota = Math.round((r.lhr.categories.accessibility.score ?? 0) * 100);
    const falhas = Object.values(r.lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative')
      .map((a) => `      ${a.id}: ${a.title}`);

    const marca = nota >= MINIMO ? '✓' : '✗';
    console.log(`${marca} ${nota.toString().padStart(3)} ${nome} (${endereco})`);
    for (const f of falhas) console.log(f);
    if (nota < MINIMO) falhou = true;
  }
} finally {
  await chrome.kill();
}

if (falhou) {
  console.error(`\nAlguma página ficou abaixo de ${MINIMO}. O §9 exige ${MINIMO}.`);
  process.exit(1);
}
console.log(`\nTodas ≥ ${MINIMO}.`);
