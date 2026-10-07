/**
 * O Lighthouse em telemóvel — o que se publica, medido como o telemóvel o vê.
 *
 * TRÊS COISAS, e as duas últimas são novas:
 *
 * 1. **Acessibilidade ≥ 95** em todas as páginas, nos DOIS TEMAS — o critério
 *    do §9. O tema escuro (P1-044) tem as suas cores, e um contraste que passa
 *    num pode não passar no outro.
 * 2. **Desempenho**, com um piso por molde. O CI nunca o tinha visto (P3-006):
 *    o início da região real pesava 1,1 MB e prendia o telemóvel 3,6 s, e
 *    aqui só se media a acessibilidade, numa demonstração de 13 pontos. O piso
 *    é FOLGADO de propósito — a nota depende da máquina que corre isto, e um
 *    piso à justa partia com o ruído do runner, que é a maneira de ensinar
 *    toda a gente a ignorar o CI. Uma página que fique abaixo mede-se outra
 *    vez antes de reprovar, e o registo diz quando foi o ruído a ganhar.
 * 3. **O peso de cada página, contra um orçamento**, medido na demonstração
 *    mais rica (a que tem os sete modos e o mapa). Os bytes não dependem da
 *    máquina: são o número que não parte com o ruído, e é ele que apanha um
 *    regresso como os pontos todos embutidos no HTML ou uma segunda cópia do
 *    MapLibre. O salto da página (CLS) também se mede: tem de ser zero, ou
 *    quase.
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

import { killAll, launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const MINIMO = Number(process.env.PARAGEM_LIGHTHOUSE_MINIMO ?? 95);

/**
 * OS PISOS DE DESEMPENHO, por molde. Medidos na demonstração a 2/10/2026, numa
 * máquina de 4 CPU partilhados com outros processos: as páginas de catálogo
 * deram 87–99, e o mapa 52–61.
 *
 * O MAPA TEM PISO PRÓPRIO, e mais baixo, por duas razões que não são defeitos.
 * O bloqueio (TBT) é o MapLibre a arrancar com o CPU a um quarto, num Chrome
 * sem placa gráfica — é o preço de haver mapa. E o LCP simulado conta os
 * módulos do mapa, que se pedem logo no `<head>` com prioridade baixa
 * (P3-023): a simulação reparte a rede por eles como se fossem tão urgentes
 * como a página. Com a rede travada de verdade (`throttlingMethod: devtools`)
 * o LCP do mesmo início é o FCP, 1,7 s — e o mapa chega 2 a 3 s mais cedo.
 *
 * Os pisos ficam vinte e tal pontos abaixo do medido — o suficiente para o
 * ruído de um runner não os tocar, e perto o suficiente para apanhar o que se
 * mediu em produção antes disto: a paragem a 74 com 0,40 de salto, e o início
 * da região real a 43 — que aqui só o peso apanha, porque a demonstração tem
 * poucos pontos para pesar.
 */
const PISO_DO_MAPA = Number(process.env.PARAGEM_LIGHTHOUSE_DESEMPENHO_MAPA ?? 40);
const PISO_DAS_PAGINAS = Number(process.env.PARAGEM_LIGHTHOUSE_DESEMPENHO ?? 70);
/** O salto da página: zero é o objetivo; isto é a folga para o arredondamento. */
const SALTO_MAXIMO = 0.05;

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
const BUILD = resolve(
  process.env.PARAGEM_BUILD ?? (existsSync(join('..', 'build')) ? join('..', 'build') : 'build'),
);

const construidas = existsSync(BUILD)
  ? readdirSync(BUILD, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(BUILD, e.name, 'sitio', 'regiao.json')))
      .map((e) => e.name)
      .sort()
  : [];
const daRegiao = (r, nome) => {
  const f = join(BUILD, r, 'sitio', nome);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};
// AS DEMONSTRAÇÕES DIZEM-SE NOS DADOS (`demonstracao` no regiao.json), e não
// numa lista: a terceira entrou e passava a ser medida como a região real.
const DEMONSTRACOES = construidas.filter((r) => daRegiao(r, 'regiao.json')?.demonstracao);
const maisRica = [...DEMONSTRACOES].sort(
  (a, b) =>
    (daRegiao(b, 'paragens.json') ?? []).length - (daRegiao(a, 'paragens.json') ?? []).length ||
    a.localeCompare(b),
)[0];
const REGIAO =
  process.env.PARAGEM_REGIAO_DE_TESTE ??
  construidas.find((r) => !DEMONSTRACOES.includes(r)) ??
  maisRica ??
  'prova';
const R = `http://${REGIAO}.localhost:${PORTA}`;
const PROVA = `http://prova.localhost:${PORTA}`;
/** A demonstração mais rica — onde se mede o peso, que não depende da máquina. */
const D = maisRica ? `http://${maisRica}.localhost:${PORTA}` : null;

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
  // As três que o produto não tinha, e que davam 404 — incluindo a declaração
  // de acessibilidade da página que vende acessibilidade.
  ['contacto do produto', `${PRODUTO}/contacto/`],
  ['privacidade do produto', `${PRODUTO}/privacidade/`],
  ['acessibilidade do produto', `${PRODUTO}/acessibilidade/`],
  ['mapa da região', `${R}/`],
  ['a rede', `${R}/rede/`],
  // A VISTA SEM MAPA, que é a de uma região ainda sem mosaicos — e a faixa
  // da demonstração por cima. É outro molde, e mede-se à parte.
  ['região sem mapa', `${PROVA}/`],
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

/**
 * O PESO DE CADA MOLDE, na demonstração mais rica: o HTML e o JavaScript que
 * a página transfere, e tudo o que ela transfere até assentar. Em KiB
 * transferidos (comprimidos), como o Lighthouse os conta.
 *
 * Medido a 2/10/2026, depois de os pontos saírem do HTML, de o MapLibre
 * deixar de vir duas vezes, de as ligações deixarem de pré-carregar as
 * páginas e de a medição deixar de vir com cada uma (P3-006, P3-007, P3-008):
 *
 *   início       469 de HTML e JS (o MapLibre são 300) · 619 ao todo — eram 851
 *   a rede       151 · 187 — eram 297
 *   como chegar  162 · 263 — eram 321
 *   paragem      151 · 188
 *   linha        139 · 176
 *   tarifário    151 · 187 — eram 293
 *
 * O orçamento é isto com ~10 % de folga, para as dependências crescerem um
 * pouco — não para voltar a biblioteca da medição a cada página (96 kB), nem uma
 * segunda cópia do mapa (300). Quem o passar de propósito sobe-o aqui, com a
 * razão escrita, como esta.
 *
 * A 7/10/2026, O TEMA CLARO OU ESCURO À ESCOLHA (`lib/tema.ts`) passou-o de
 * propósito. Custa entre 2,6 e 3,5 KiB em cada página, medidos na mesma
 * máquina contra o `main` de antes dele: o JavaScript do interruptor e das
 * escolhas (1,5, com o pedido), o HTML deles, que o Next manda duas vezes
 * (0,9), e o CSS (0,3). A folga estava gasta: «como chegar» estava a 289,8 de
 * 290, e a paragem a 207,5 de 210. Sobem esses dois totais, 5 KiB cada; os
 * outros ainda cabem, a um ou dois KiB do teto — o próximo a passar sabe que
 * está lá.
 */
const ORCAMENTO = {
  início: { htmlEJs: 520, total: 680 },
  'a rede': { htmlEJs: 170, total: 210 },
  'como chegar': { htmlEJs: 180, total: 295 },
  paragem: { htmlEJs: 170, total: 215 },
  linha: { htmlEJs: 155, total: 200 },
  tarifário: { htmlEJs: 170, total: 210 },
};

const daDemonstracao = (r) => {
  if (!maisRica) return [];
  const p = maior(daRegiao(r, 'paragens.json'), 'partidas');
  const l = maior(daRegiao(r, 'linhas.json'), 'viagens');
  return [
    ['início', `${D}/`],
    ['a rede', `${D}/rede/`],
    ['como chegar', `${D}/viagem/`],
    ...(p ? [['paragem', `${D}/rede/paragens/${p.id}/`]] : []),
    ...(l ? [['linha', `${D}/rede/linhas/${l.id}/`]] : []),
    ['tarifário', `${D}/rede/tarifario/`],
  ];
};
const PAGINAS_DO_PESO = daDemonstracao(maisRica);

/** O endereço é o do mapa da região — o molde mais pesado, com piso próprio. */
const ehMapa = (endereco) => /\.localhost:\d+\/$/.test(endereco) && !endereco.startsWith(PROVA);

// --- o navegador ------------------------------------------------------------

const BANDEIRAS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  // Os `*.localhost` das regiões resolvem no navegador, não no DNS da máquina.
  '--host-resolver-rules=MAP *.localhost 127.0.0.1',
];

/** A porta de depuração responde ao protocolo, e não só ao `connect`. */
async function portaResponde(porta, prazoMs) {
  const ate = Date.now() + prazoMs;
  while (Date.now() < ate) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) return true;
    } catch {
      // Ainda não: tenta-se outra vez daqui a meio segundo.
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  return false;
}

/**
 * O CHROME, LANÇADO À PROVA DE UM ARRANQUE FALHADO.
 *
 * A 1/10/2026 este passo falhou no `main` com `connect ECONNREFUSED
 * 127.0.0.1:<porta>`: o Chrome arrancou e a porta de depuração nunca chegou a
 * ouvir — e a repetição passou. Não era uma medição a falhar, era o navegador
 * a não nascer. Por isso: espera-se que a porta responda, com prazo; se for
 * recusada ou não responder, lança-se outra vez, UMA vez, e diz-se no
 * registo. Uma segunda falha é a sério, e rebenta. O que acontece depois do
 * arranque — uma página que não carrega, uma nota baixa — não passa por aqui.
 */
async function abrirChrome(extra = []) {
  for (let vez = 1; vez <= 2; vez++) {
    let chrome = null;
    try {
      chrome = await launch({
        chromePath: process.env.PARAGEM_CHROMIUM,
        chromeFlags: [...BANDEIRAS, ...extra],
      });
      if (await portaResponde(chrome.port, 20_000)) return chrome;
      throw new Error(`a porta ${chrome.port} não respondeu em 20 s`);
    } catch (e) {
      // Um lançamento que rebentou antes de devolver o Chrome deixa-o órfão:
      // mata-se pelo registo do próprio lançador.
      if (chrome) await Promise.resolve(chrome.kill()).catch(() => {});
      else await Promise.resolve(killAll()).catch(() => {});
      if (vez === 2) throw e;
      console.warn(`! O Chrome não arrancou (${e.code ?? e.message}). Relança-se uma vez.`);
    }
  }
  throw new Error('inalcançável');
}

/** Uma medição; `ECONNREFUSED` ao ligar ao navegador relança-o uma vez. */
async function medir(navegador, endereco, categorias) {
  const correr = () =>
    lighthouse(
      endereco,
      { port: navegador.chrome.port, output: 'json', logLevel: 'error' },
      // `mobile` de propósito: o §9 diz «Lighthouse de acessibilidade ≥ 95 em
      // telemóvel», e é onde isto se usa — na paragem, de pé.
      { extends: 'lighthouse:default', settings: { onlyCategories: categorias } },
    );
  try {
    return await correr();
  } catch (e) {
    if (e?.code !== 'ECONNREFUSED' || navegador.relancado) throw e;
    console.warn(`! O Chrome deixou de aceitar ligações (${e.message}). Relança-se uma vez.`);
    navegador.relancado = true;
    await Promise.resolve(navegador.chrome.kill()).catch(() => {});
    navegador.chrome = await abrirChrome(navegador.extra);
    return await correr();
  }
}

const kib = (b) => Math.round((b ?? 0) / 102.4) / 10;

/** O que a página transferiu, por tipo, do resumo do próprio Lighthouse. */
function pesos(lhr) {
  const itens = lhr.audits['resource-summary']?.details?.items ?? [];
  const de = (t) => itens.find((x) => x.resourceType === t)?.transferSize ?? 0;
  return { htmlEJs: kib(de('document') + de('script')), total: kib(de('total')) };
}

/** As falhas de acessibilidade, e só essas — não as dicas de desempenho. */
function falhasDeAcessibilidade(lhr) {
  const ids = new Set((lhr.categories.accessibility?.auditRefs ?? []).map((a) => a.id));
  return Object.values(lhr.audits)
    .filter((a) => ids.has(a.id) && a.score !== null && a.score < 1)
    .filter((a) => a.scoreDisplayMode !== 'informative')
    .map((a) => `      ${a.id}: ${a.title}`);
}

let falhou = false;
const reprovar = (msg) => {
  console.log(msg);
  falhou = true;
};

// --- 1 e 2: acessibilidade e desempenho, no tema claro -------------------------

const claro = { chrome: await abrirChrome(), extra: [], relancado: false };
const medidas = new Map();
try {
  console.log('Tema claro — acessibilidade ≥ %d e desempenho:', MINIMO);
  for (const [nome, endereco] of PAGINAS) {
    let r = await medir(claro, endereco, ['accessibility', 'performance']);
    const nota = Math.round((r.lhr.categories.accessibility.score ?? 0) * 100);
    const piso = ehMapa(endereco) ? PISO_DO_MAPA : PISO_DAS_PAGINAS;
    let desempenho = Math.round((r.lhr.categories.performance.score ?? 0) * 100);
    // UMA SEGUNDA MEDIÇÃO ANTES DE REPROVAR. Uma nota abaixo do piso numa
    // máquina partilhada pode ser a máquina; duas seguidas não são.
    if (desempenho < piso) {
      const outra = await medir(claro, endereco, ['accessibility', 'performance']);
      const segunda = Math.round((outra.lhr.categories.performance.score ?? 0) * 100);
      if (segunda >= piso) {
        console.log(
          `    (desempenho ${desempenho} à primeira e ${segunda} à segunda: foi o ruído)`,
        );
        r = outra;
      }
      desempenho = Math.max(desempenho, segunda);
    }
    const salto = r.lhr.audits['cumulative-layout-shift']?.numericValue ?? 0;
    medidas.set(endereco, r.lhr);
    const p = pesos(r.lhr);
    const ok = nota >= MINIMO && desempenho >= piso && salto <= SALTO_MAXIMO;
    console.log(
      `${ok ? '✓' : '✗'} ${nota.toString().padStart(3)} · desempenho ${desempenho
        .toString()
        .padStart(
          3,
        )} (piso ${piso}) · salto ${salto.toFixed(3)} · ${p.total} KiB  ${nome} (${endereco})`,
    );
    for (const f of falhasDeAcessibilidade(r.lhr)) console.log(f);
    if (nota < MINIMO) reprovar(`    acessibilidade ${nota} < ${MINIMO}`);
    if (desempenho < piso) reprovar(`    desempenho ${desempenho} < ${piso}, duas vezes`);
    if (salto > SALTO_MAXIMO)
      reprovar(`    a página salta: CLS ${salto.toFixed(3)} > ${SALTO_MAXIMO}`);
  }

  // --- 3: o peso, na demonstração mais rica ------------------------------------
  if (PAGINAS_DO_PESO.length) {
    console.log(`\nO peso, na demonstração mais rica (${maisRica}) — KiB transferidos:`);
    for (const [nome, endereco] of PAGINAS_DO_PESO) {
      const lhr = medidas.get(endereco) ?? (await medir(claro, endereco, ['performance'])).lhr;
      const p = pesos(lhr);
      const o = ORCAMENTO[nome];
      const ok = !o || (p.htmlEJs <= o.htmlEJs && p.total <= o.total);
      console.log(
        `${ok ? '✓' : '✗'} ${nome}: HTML e JS ${p.htmlEJs} (orçamento ${o?.htmlEJs ?? '—'}) · tudo ${p.total} (orçamento ${o?.total ?? '—'})`,
      );
      if (!ok) reprovar(`    ${nome} passou do orçamento de peso`);
    }
  } else {
    console.log('\nSem demonstração construída: o orçamento de peso não se mede aqui.');
  }
} finally {
  await Promise.resolve(claro.chrome.kill()).catch(() => {});
}

// --- 1 outra vez: acessibilidade no tema escuro --------------------------------
//
// O Chrome com a preferência do sistema no escuro, como num telemóvel à noite:
// é o `prefers-color-scheme` que o sítio segue (P1-044).
const escuro = {
  chrome: await abrirChrome(['--blink-settings=preferredColorScheme=0']),
  extra: ['--blink-settings=preferredColorScheme=0'],
  relancado: false,
};
try {
  console.log('\nTema escuro — acessibilidade ≥ %d:', MINIMO);
  for (const [nome, endereco] of PAGINAS) {
    const r = await medir(escuro, endereco, ['accessibility']);
    const nota = Math.round((r.lhr.categories.accessibility.score ?? 0) * 100);
    console.log(
      `${nota >= MINIMO ? '✓' : '✗'} ${nota.toString().padStart(3)} ${nome} (${endereco})`,
    );
    for (const f of falhasDeAcessibilidade(r.lhr)) console.log(f);
    if (nota < MINIMO) reprovar(`    acessibilidade no escuro ${nota} < ${MINIMO}`);
  }
} finally {
  await Promise.resolve(escuro.chrome.kill()).catch(() => {});
}

if (falhou) {
  console.error(
    `\nAlguma página reprovou. O §9 exige acessibilidade ≥ ${MINIMO}; o desempenho, o salto e o peso estão acima.`,
  );
  process.exit(1);
}
console.log(`\nTudo dentro: acessibilidade ≥ ${MINIMO} nos dois temas, desempenho, salto e peso.`);
