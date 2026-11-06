/**
 * O ACABAMENTO: o que a auditoria visual mediu e que um teste de violações não
 * vê (P1-014, P1-015, P1-022, P1-029, P1-046).
 *
 * Nenhum destes é uma violação WCAG; todos são o sítio a parecer mal feito a
 * quem decide se o contrata. Medem-se pelo que o navegador calcula, e não
 * pelo que o CSS diz, que é o que já os tinha deixado passar uma vez.
 */
import { test, expect } from '@playwright/test';
import {
  concelhoComMaisParagens,
  linhaComMaisViagens,
  paragemComMaisPartidas,
  temMosaicos,
  SEM,
} from './dados-da-regiao';

test('o texto secundário é secundário: mais pequeno, e na cor do §6', async ({ page }) => {
  // A classe aparecia setenta vezes e não tinha regra fora das listas: as
  // notas do tarifário saíam iguais ao preço ao lado (P1-029).
  await page.goto('/rede/tarifario/');
  const nota = page.locator('main p.secundario, main span.secundario').first();
  await expect(nota).toHaveCSS('color', 'rgb(74, 92, 102)');
  const [daNota, doTexto] = await Promise.all([
    nota.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    page
      .locator('main p')
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ]);
  expect(daNota).toBeLessThan(doTexto);
});

test('o título não se cola ao cabeçalho', async ({ page }) => {
  // Media 0 px entre o cabeçalho e a caixa do título (P1-015).
  for (const caminho of [
    '/rede/',
    '/rede/tarifario/',
    `/rede/linhas/${linhaComMaisViagens().id}/`,
  ]) {
    await page.goto(caminho);
    const ar = await page.evaluate(() => {
      const fim = document.querySelector('header.cabecalho')!.getBoundingClientRect().bottom;
      const primeiro = document.querySelector('main#conteudo > *')!.getBoundingClientRect().top;
      return primeiro - fim;
    });
    expect(ar, `${caminho}: o conteúdo começa a ${ar} px do cabeçalho`).toBeGreaterThanOrEqual(20);
  }
});

test('a ligação no meio de uma frase do rodapé não estica a linha', async ({ page }) => {
  // Os 44 px eram de todas as ligações do rodapé, e a do «OpenStreetMap», no
  // meio da atribuição, fazia uma linha mais alta do que as outras (P1-022).
  await page.goto('/rede/');
  const naFrase = page.locator('footer p a');
  for (const a of await naFrase.all()) await expect(a).toHaveCSS('display', 'inline');
  for (const a of await page.locator('footer nav a').all()) {
    expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('os dados abertos escrevem as datas como o resto do sítio, e o código em pequeno', async ({
  page,
}) => {
  await page.goto('/dados-abertos/');
  const principal = page.getByRole('main');
  await expect(principal).not.toContainText(/\b\d{4}-\d{2}-\d{2}\b/);
  const codigo = principal.locator('code').first();
  if (await codigo.count()) {
    const [doCodigo, doTexto] = await Promise.all([
      codigo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      codigo.evaluate((e) => parseFloat(getComputedStyle(e.parentElement!).fontSize)),
    ]);
    expect(doCodigo).toBeLessThan(doTexto);
  }
});

test('num ecrã largo, o «A seguir» fica ao lado do horário, e não por cima dele', async ({
  page,
}) => {
  // Uma coluna de 608 px num ecrã de 1440, com 400 px vazios de cada lado
  // (P1-014). No telemóvel continuam um a seguir ao outro.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/rede/paragens/${paragemComMaisPartidas().id}/`);
  const seguir = (await page.locator('section.a-seguir').boundingBox())!;
  const horario = (await page.locator('section[aria-labelledby="horario"]').boundingBox())!;
  expect(seguir.x, 'o «A seguir» à direita do horário').toBeGreaterThanOrEqual(
    horario.x + horario.width,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const seguirNoTelemovel = (await page.locator('section.a-seguir').boundingBox())!;
  const horarioNoTelemovel = (await page
    .locator('section[aria-labelledby="horario"]')
    .boundingBox())!;
  expect(horarioNoTelemovel.y).toBeGreaterThan(seguirNoTelemovel.y);
});

test('num ecrã largo, o concelho e o tarifário também vão a duas colunas', async ({ page }) => {
  // O P1-014 ficou a meio: a paragem e a linha alargaram, e o concelho e o
  // tarifário continuavam uma coluna de 608 px num ecrã de 1440.
  const doConcelho = `/rede/concelhos/${concelhoComMaisParagens().id}/`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(doConcelho);
  const lateral = page.locator('.colunas-do-concelho > .coluna-lateral');
  test.skip((await lateral.count()) === 0, 'o concelho com mais paragens não tem o que ir ao lado');
  const aoLado = (await lateral.boundingBox())!;
  const paragens = (await page.locator('section[aria-labelledby="c-paragens"]').boundingBox())!;
  expect(aoLado.x, 'o a pedido e os outros modos à direita').toBeGreaterThanOrEqual(
    paragens.x + paragens.width,
  );

  await page.goto('/rede/tarifario/');
  const ajuda = page.locator('section[aria-labelledby="qual"]');
  if (await ajuda.count()) {
    const caixaDaAjuda = (await ajuda.boundingBox())!;
    const tabela = (await page.locator('table.horario').first().boundingBox())!;
    expect(caixaDaAjuda.x, '«Que título me serve?» ao lado das tabelas').toBeGreaterThanOrEqual(
      tabela.x + tabela.width,
    );
  }

  // No telemóvel, a ordem de sempre: o a pedido antes das linhas.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(doConcelho);
  const aPedido = page.locator('section[aria-labelledby="c-a-pedido"]');
  const linhas = page.locator('section[aria-labelledby="c-linhas"]');
  if ((await aPedido.count()) && (await linhas.count())) {
    expect((await linhas.boundingBox())!.y).toBeGreaterThan((await aPedido.boundingBox())!.y);
  }
});

test('o tema escuro vem do sistema, e o mapa muda com ele', async ({ page }) => {
  // P1-044: a página e o mapa de base, nas cores do tema que o sistema pede —
  // e o mapa aberto troca de tinta quando o sistema troca, sem perder nada.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/rede/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 26, 32)');
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto('/');
  type ComMapa = {
    __mapa?: { loaded(): boolean; getPaintProperty(c: string, p: string): unknown };
  };
  await page.waitForFunction(() => !!(window as unknown as ComMapa).__mapa?.loaded());
  const fundo = () =>
    page.evaluate(() =>
      (window as unknown as ComMapa).__mapa!.getPaintProperty('fundo', 'background-color'),
    );
  expect(await fundo()).toBe('#172127');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(fundo).toBe('#eef0eb');
});

test('«A rede» num ecrã largo é duas colunas, com a procura à direita, e diz que se planeia no «Como chegar»', async ({
  page,
}) => {
  // Era uma coluna de 576 px com três ecrãs e meio de altura a 1 440 px
  // (#110), «Procurar» encabeçava três ligações e nenhuma procura (#103), e a
  // abertura mandava planear pelo mapa (#185).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/rede/');
  await expect(page.getByRole('main')).not.toContainText('mapa é mais rápido');
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Como chegar' }).first(),
  ).toBeVisible();
  const esquerda = await page.locator('.catalogo-da-rede > .coluna-principal').boundingBox();
  const direita = await page.locator('.catalogo-da-rede > .coluna-lateral').boundingBox();
  expect(direita!.x).toBeGreaterThan(esquerda!.x + esquerda!.width);
  expect(Math.abs(direita!.y - esquerda!.y)).toBeLessThan(5);
  await expect(
    page.locator('.coluna-lateral').getByRole('searchbox', { name: 'Paragem ou linha' }),
  ).toBeVisible();
  // «Por modo» sem filete entre cartões e com o mesmo fundo em todos (#186).
  const fundos = await page
    .locator('.lista.por-modo .cartao')
    .evaluateAll((cs) => [...new Set(cs.map((c) => getComputedStyle(c).backgroundColor))]);
  expect(fundos).toHaveLength(1);
  await expect(page.locator('.lista.por-modo > li').first()).toHaveCSS(
    'border-bottom-width',
    '0px',
  );
});

test('no computador, o rodapé começa onde começa o conteúdo', async ({ page }) => {
  // Os links do rodapé começavam 16 px à esquerda do título, em todas as
  // páginas: o espaço dos lados ia por fora da largura máxima (#170).
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const caminho of ['/rede/estacoes/', '/rede/']) {
    await page.goto(caminho);
    const titulo = (await page.locator('main h1').boundingBox())!;
    const rodape = (await page.locator('footer.rodape nav a').first().boundingBox())!;
    expect(Math.abs(rodape.x - titulo.x), caminho).toBeLessThanOrEqual(1);
  }
});

test('a nota dos dados tem cantos suaves, e não vira elipse em duas linhas', async ({ page }) => {
  // Com o raio todo, uma nota de duas linhas era uma elipse com o texto
  // encostado à curva (#167, #194).
  await page.goto('/rede/');
  const nota = page.locator('.marca-dados').first();
  await expect(nota).toBeVisible();
  const raio = await nota.evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
  expect(raio).toBeLessThanOrEqual(12);
});

test('no rodapé, o tema escolhe-se numa linha só', async ({ page }) => {
  // O grupo do rodapé era uma caixa com uma nota por baixo, uns 90 px no
  // telemóvel, a repetir o botão do cabeçalho (#164, #195).
  await page.goto('/rede/');
  const tema = page.locator('footer.rodape fieldset.escolha-do-tema');
  await expect(tema).toBeVisible();
  expect((await tema.boundingBox())!.height).toBeLessThanOrEqual(60);
  await expect(tema.getByRole('radio', { name: 'Escuro' })).toBeVisible();
});

test('«Como chegar» vazio: a frase tem margem, e não se oferece «Atualizar» sem procura', async ({
  page,
}) => {
  // Antes das duas pontas não há procura para atualizar, e a frase que pede
  // as pontas estava colada à borda da caixa dos resultados.
  await page.goto('/viagem/');
  const frase = page.getByText('Escolha de onde parte e para onde vai.');
  await expect(frase).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar' })).toHaveCount(0);
  const caixa = (await page.locator('.zona-de-resultados').boundingBox())!;
  const texto = (await frase.boundingBox())!;
  expect(texto.x - caixa.x).toBeGreaterThanOrEqual(12);
});

test('o «A seguir» não guarda um buraco: as partidas têm a altura das fantasmas', async ({
  page,
}) => {
  // A caixa guarda a altura das linhas fantasmas para nada saltar quando as
  // horas chegam; uma partida sem espera era 15 px mais baixa do que elas, e
  // cinco deixavam 75 px vazios por baixo da lista.
  await page.goto(`/rede/paragens/${paragemComMaisPartidas().id}/`);
  const linhas = page.locator('ul.partidas > li');
  await expect(linhas.first()).toBeVisible({ timeout: 15_000 });
  const alturas = await linhas.evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().height));
  const minima = await linhas.first().evaluate((l) => parseFloat(getComputedStyle(l).minHeight));
  for (const a of alturas) expect(a).toBeGreaterThanOrEqual(minima - 0.5);
  // E a caixa guardada não fica maior do que o que lá está.
  const folga = await linhas.first().evaluate((l) => {
    const caixa = l.closest<HTMLElement>('div[style*="min-height"]');
    if (!caixa) return 0;
    const conteudo = [...caixa.children].reduce((s, c) => s + c.getBoundingClientRect().height, 0);
    return parseFloat(caixa.style.minHeight) - conteudo;
  });
  expect(folga).toBeLessThan(12);
});

test('o número de quadros não se cola ao nome deles', async ({ page }) => {
  await page.goto(`/rede/paragens/${paragemComMaisPartidas().id}/`);
  const resumo = page.locator('details.todos-os-quadros > summary');
  await expect(resumo).toBeVisible();
  expect(await resumo.evaluate((s) => parseFloat(getComputedStyle(s).columnGap))).toBeGreaterThan(
    0,
  );
});
