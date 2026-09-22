/**
 * OS MODOS QUE NÃO SÃO A REDE.
 *
 * A grelha «Por modo» mostrava sete cartões e quatro deles não levavam a lado
 * nenhum: bicicletas, táxis, urbanos municipais e expressos eram rótulos
 * pintados. Quem toca em «Bicicleta partilhada» quer a estação mais perto.
 *
 * O que estes testes guardam é isso e uma coisa mais difícil: que a página
 * diga o que NÃO sabe antes de dizer o que sabe. O que há de cada um destes
 * modos é muito desigual — dezenas de estações de bicicletas com coordenadas,
 * e dos urbanos municipais às vezes só o traçado, sem paragens e sem horas.
 * Pôr a falta no fim, depois de uma lista, é deixar quem lê supor que a lista
 * está completa.
 *
 * QUE MODOS EXISTEM É DA REGIÃO, e por isso nenhum está escrito aqui como
 * certo: cada caso pergunta aos dados o que esta região tem
 * (`dados-da-regiao.ts`) e salta com a razão escrita quando ela não tem esse
 * modo — ou quando o painel o desligou, que é outra maneira de ele não estar
 * lá.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PROVA } from './anfitrioes';
import {
  concelhoComOutroModo,
  modosDeclarados,
  horarioComParagensPorSituar,
  modo as lerModo,
  modosDisponiveis,
  temModoLigado,
  umModoComPagina,
  umQuadroDe,
  SEM,
} from './dados-da-regiao';

const COM_PAGINA = umModoComPagina();
const BICICLETA = temModoLigado('bicicleta') ? lerModo('bicicleta') : null;
const URBANOS = temModoLigado('urbano-municipal') ? lerModo('urbano-municipal') : null;
const EXPRESSO = temModoLigado('expresso') ? lerModo('expresso') : null;
const QUADRO = URBANOS ? umQuadroDe('urbano-municipal') : null;
/** A secção «o que falta saber» só existe onde há lacunas declaradas. */
const LACUNAS_NAS_BICICLETAS = !!BICICLETA && (BICICLETA.incompleto || BICICLETA.notas.length > 0);
const POR_SITUAR = URBANOS ? horarioComParagensPorSituar('urbano-municipal') : null;
/** Os rótulos são do produto; o que varia é quais deles a região usa. */
const ROTULO: Record<string, RegExp> = {
  bicicleta: /Bicicleta/,
  taxi: /Táxi/,
  'urbano-municipal': /[Uu]rbano/,
  expresso: /Expresso/,
  'a-pedido': /pedido/,
};

test('a grelha «Por modo» leva a algum lado', async ({ page }) => {
  test.skip(!COM_PAGINA, SEM.modo('nenhum com página própria'));
  await page.goto(`/rede/`);
  const modos = page.getByRole('region', { name: 'Por modo' });
  const ligacoes = modos.getByRole('link');
  // Um cartão por modo declarado; o que não tiver destino continua a aparecer
  // como texto — a região declarou-o, e escondê-lo era dizer que não existe.
  expect(await ligacoes.count()).toBeGreaterThan(0);
  expect(await ligacoes.count()).toBeLessThanOrEqual(modosDeclarados().length);

  await modos.getByRole('link', { name: ROTULO[COM_PAGINA!] }).click();
  await expect(page).toHaveURL(new RegExp(`/modos/${COM_PAGINA}/?$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(ROTULO[COM_PAGINA!]);
});

test('as bicicletas dizem onde estão, e de onde viriam as contagens', async ({ page }) => {
  // As contagens vêm de um serviço à parte, lido do site do operador, e com a
  // hora. A página diz de onde vêm e que o operador pode falhar — não promete
  // um número certo que não controla.
  test.skip(!BICICLETA, SEM.modo('bicicleta'));
  test.skip(!LACUNAS_NAS_BICICLETAS, SEM.lacunas('bicicleta'));
  await page.goto(`/modos/bicicleta/`);
  await expect(page.getByText(/lidas da página que o operador publica/)).toBeVisible();
  await expect(page.getByText(/pode contá-las mal/)).toBeVisible();

  // UM TÍTULO POR SISTEMA, sejam quantos forem: cada um tem o seu operador, e
  // juntá-los numa lista só fazia parecer que as bicicletas são todas iguais.
  for (const s of BICICLETA!.sistemas) {
    await expect(page.getByRole('heading', { name: s.nome, exact: true })).toBeVisible();
  }
  // O que está por confirmar diz-se por confirmar.
  const porConfirmar = BICICLETA!.sistemas.some((s) => s.estado === 'por-confirmar');
  await expect(page.getByText(/Estado do serviço por confirmar/)).toHaveCount(porConfirmar ? 1 : 0);
});

test('sem serviço de disponibilidade, não aparece contagem nenhuma', async ({ page }) => {
  // A construção do CI não configura o serviço — é o caso por omissão de quem
  // aloja o sítio. Aí a página tem de mostrar as estações e MAIS NADA: uma
  // contagem inventada mandava alguém a uma estação vazia. É o mesmo princípio
  // do planeador com o OTP em baixo.
  test.skip(!BICICLETA, SEM.modo('bicicleta'));
  await page.goto(`/modos/bicicleta/`);
  await expect(
    page.getByRole('heading', { name: BICICLETA!.sistemas[0].nome, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.disponibilidade')).toHaveCount(0);
  await expect(page.getByText(/Neste momento,/)).toHaveCount(0);
});

test('a falta vem antes da lista, e não depois', async ({ page }) => {
  test.skip(!temModoLigado('taxi'), SEM.modo('taxi'));
  await page.goto(`/modos/taxi/`);
  const falta = page.getByText(/é o que o OpenStreetMap tem/);
  const onde = page.getByRole('heading', { name: 'Onde estão' });
  await expect(falta).toBeVisible();
  await expect(onde).toBeVisible();
  const y = async (l: typeof falta) => (await l.boundingBox())!.y;
  expect(await y(falta), 'a lacuna tem de vir antes da lista').toBeLessThan(await y(onde));

  // E os concelhos onde não há nenhuma ficam escritos: «não está no mapa» não
  // é o mesmo que «não existe», e quem lá mora tem o direito de saber a
  // diferença.
  await expect(page.getByText(/Sem nenhuma levantada:/)).toBeVisible();
});

test('os urbanos municipais separam o que se sabe do que falta', async ({ page }) => {
  // Este teste MUDOU quando os horários passaram a existir, e é suposto ter
  // mudado: até aqui a página dizia «pergunte à câmara do concelho», porque
  // era o que havia. Os cartazes das câmaras trouxeram as horas; o que
  // continua a faltar são as coordenadas das paragens.
  test.skip(!URBANOS?.percursos.length, SEM.modo('urbano-municipal'));
  await page.goto(`/modos/urbano-municipal/`);
  await expect(page.getByText(/As paragens e as horas não estão lá/)).toBeVisible();

  // As linhas cujo TRAÇADO se conhece, numa lista — que é o que são: o
  // OpenStreetMap tem por onde passam e não tem mais nada. Quantas são é da
  // região; que estejam lá todas é do produto.
  const lista = page.getByRole('heading', { name: 'As linhas que se conhecem' });
  await expect(lista).toBeVisible();
  for (const p of URBANOS!.percursos) {
    await expect(page.getByRole('listitem').filter({ hasText: p.nome }).first()).toBeVisible();
  }
});

test('o expresso diz para onde vai e que os títulos daqui não servem', async ({ page }) => {
  test.skip(!EXPRESSO?.paragens.length, SEM.modo('expresso'));
  await page.goto(`/modos/expresso/`);
  await expect(page.getByText(/Os títulos desta região não servem/)).toBeVisible();
  // O destino de cada cais é o que interessa a quem está na paragem: apanhar
  // um expresso é ir para outro lado, e cortar a viagem na fronteira era
  // esconder-lhe o destino.
  await expect(
    page.getByRole('heading', { name: EXPRESSO!.paragens[0].nome }).first(),
  ).toBeVisible();
});

test('a página do concelho conta os outros modos que há ali', async ({ page }) => {
  // Qual concelho e qual modo sai dos dados: é o primeiro sítio onde há
  // alguma coisa que não seja a rede de autocarros.
  const onde = concelhoComOutroModo();
  test.skip(!onde, SEM.modo('nenhum outro num concelho'));
  await page.goto(`/rede/concelhos/${onde!.concelho}/`);
  const outros = page.getByRole('region', { name: 'Outros modos aqui' });
  await expect(outros).toBeVisible();
  // E o cartão leva à página do modo.
  await outros.getByRole('link', { name: ROTULO[onde!.modo] }).click();
  await expect(page).toHaveURL(new RegExp(`/modos/${onde!.modo}/?$`));
});

test('a região de prova só ganha os modos que declara', async ({ page }) => {
  // O contrato do §11.5: uma região nova entra sem um commit. A prova declara
  // bicicletas, táxis e urbanos — e NÃO declara expressos, por isso não tem
  // página de expressos. Uma secção vazia à espera de dados que não vêm é
  // pior do que secção nenhuma.
  await page.goto(`${PROVA}/modos/bicicleta/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Bicicleta/);
  await expect(page.getByRole('heading', { name: 'AltaBike', exact: true })).toBeVisible();

  const resposta = await page.goto(`${PROVA}/modos/expresso/`);
  expect(resposta?.status(), 'a prova não declara expressos').toBe(404);
});

test('as páginas de modo não têm violações graves de acessibilidade', async ({ page }) => {
  const paginas = modosDisponiveis().filter((m) => !['autocarro', 'comboio'].includes(m));
  test.skip(paginas.length === 0, SEM.modo('nenhum com página própria'));
  for (const m of paginas) {
    await page.goto(`/modos/${m}/`);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const graves = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(graves.map((v) => `${m}: ${v.id}`)).toEqual([]);
  }
});

test('os urbanos municipais passam a dizer a que horas passa', async ({ page }) => {
  // Era a maior lacuna da página: «Para saber a que horas passa, pergunte à
  // câmara do concelho». Os cartazes que a câmara publica têm as horas, e
  // agora estão aqui — paragem a paragem, numa tabela que um leitor de ecrã
  // sabe anunciar.
  test.skip(!QUADRO, SEM.modo('urbano-municipal'));
  await page.goto('/modos/urbano-municipal/');
  const seccao = page.locator('section', {
    has: page.getByRole('heading', { name: QUADRO!.linha, exact: true }),
  });
  await expect(seccao.first()).toBeVisible();
  // A regra de serviço vem do rodapé do cartaz, escrita como lá está.
  for (const regra of QUADRO!.regras) {
    await expect(seccao.first()).toContainText(regra);
  }
  // E a grelha abre: está dentro de um `<details>` FECHADO, porque dezenas de
  // paragens por dezenas de viagens não cabem num telemóvel desenroladas.
  // Fechado quer dizer fora da árvore de acessibilidade — por isso o teste faz
  // o que uma pessoa faz, que é tocar no resumo.
  const grelha = seccao.first().locator('details.quadro-de-horario').first();
  await grelha.locator('summary').click();
  await expect(grelha.getByRole('cell', { name: QUADRO!.hora }).first()).toBeVisible();
});

test('a primeira hora lê-se sem abrir a grelha', async ({ page }) => {
  // Dezenas de paragens por dezenas de viagens não cabem num telemóvel. O
  // resumo do `<details>` responde à pergunta mais comum — «a que horas é a
  // primeira?» — sem obrigar a abrir nada.
  test.skip(!QUADRO, SEM.modo('urbano-municipal'));
  await page.goto('/modos/urbano-municipal/');
  const resumo = page
    .locator('section', { has: page.getByRole('heading', { name: QUADRO!.linha, exact: true }) })
    .first()
    .locator('details.quadro-de-horario')
    .first()
    .locator('summary');
  await expect(resumo).toContainText(`${QUADRO!.viagens} viagens`);
  await expect(resumo).toContainText(`${QUADRO!.paragem} às ${QUADRO!.hora}`);
});

test('diz de cada linha quantas paragens estão no mapa, e nomeia as que não', async ({ page }) => {
  // As horas existem para as paragens todas; as COORDENADAS, para parte. A
  // diferença tem de estar na página, linha a linha: uma que dissesse só «não
  // entra no planeador» escondia que a Verde Express está inteira, e uma que
  // não dissesse nada deixava quem a lê à espera de ver a Azul no mapa.
  //
  // E NÃO SE CRAVA A CONTAGEM. As coordenadas vêm do OpenStreetMap, que muda
  // todos os dias: «6 paragens» hoje pode ser 5 ou 7 na semana que vem, e um
  // número exato aqui é um teste que reprova sozinho — e que reprova no
  // `main`, onde reprovar impede a publicação. Fixa-se a FRASE, que é o que
  // tem de estar lá.
  test.skip(!POR_SITUAR, SEM.modo('urbano-municipal'));
  await page.goto('/modos/urbano-municipal/');
  await expect(page.getByText(/\d+ paragens? (está|estão) no mapa/).first()).toBeVisible();
  await expect(page.getByText(/têm? hora e não têm? sítio/).first()).toBeVisible();

  // E NOMEIA-AS. Um número sozinho não se conserta; uma lista de nomes é o
  // pedido concreto a quem mapeia ou a quem na câmara tem a folha.
  //
  // O nome aparece DUAS vezes na página — na lista do que falta e na linha da
  // grelha de horário —, por isso o teste aponta à lista: é a que prova que
  // a página nomeia a lacuna, e não só que a paragem existe algures.
  const seccao = page.locator('section', {
    has: page.getByRole('heading', { name: POR_SITUAR!.linha, exact: true }),
  });
  await seccao.getByText('As que faltam').click();
  await expect(
    seccao.getByRole('listitem').filter({ hasText: POR_SITUAR!.faltam[0] }).first(),
  ).toBeVisible();
});

test('as estações levam o nome que o sistema lhes dá', async ({ page }) => {
  // O OpenStreetMap sabe ONDE estão — casam a menos de 60 m — mas escreve-lhes
  // uma etiqueta de mapa, com a marca à frente do sítio. O nome que está no
  // poste, e que a pessoa procura, é o que o SISTEMA publica, e é esse que o
  // pipeline guarda.
  //
  // Verifica-se pela positiva: se a página estivesse a mostrar as etiquetas do
  // mapa, os nomes do sistema não estavam lá. Um teste escrito pela negativa
  // precisava de saber como é a etiqueta de cada operador — que é coisa de uma
  // região, não do produto.
  test.skip(!BICICLETA, SEM.modo('bicicleta'));
  const sistema = BICICLETA!.sistemas[0];
  await page.goto(`/modos/bicicleta/`);
  const seccao = page.locator('section', {
    has: page.getByRole('heading', { name: sistema.nome, exact: true }),
  });
  for (const e of sistema.estacoes.slice(0, 3)) {
    await expect(seccao.first()).toContainText(e.nome);
  }
});

test('a página nomeia o que ainda falta: um feed próprio do sistema', async ({ page }) => {
  // As contagens já se mostram, mas por leitura do HTML de uma página feita
  // para pessoas — frágil. O passo durável tem nome, e fica escrito: um feed
  // de dados próprio do sistema.
  test.skip(!BICICLETA, SEM.modo('bicicleta'));
  test.skip(!LACUNAS_NAS_BICICLETAS, SEM.lacunas('bicicleta'));
  await page.goto(`/modos/bicicleta/`);
  await expect(page.getByText(/Falta um feed de dados próprio do sistema/)).toBeVisible();
});
