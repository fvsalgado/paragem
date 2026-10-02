/**
 * A MARCA BRANCA: o sítio de cada região é da autoridade, e não do fornecedor.
 *
 * O cabeçalho abria com «Paragem.pt», a levar à página de vendas do produto,
 * e a região vinha a seguir numa pastilha (P4-008, P1-007, P2-029, P3-029). O
 * primeiro ecrã do mapa não tinha marca nenhuma (P1-008), e um nome comprido
 * partia o cabeçalho (P1-043). O que se prova aqui:
 *
 * - o cabeçalho é a assinatura da rede, a levar ao início DA REGIÃO, numa
 *   faixa com a cor que ela declara — e a tinta lê-se por cima dela;
 * - «Paragem.pt» só aparece discreto, no fim, a levar ao produto;
 * - a assinatura está no primeiro ecrã do mapa e no menu;
 * - um nome comprido não muda a altura do cabeçalho, nem empurra a página.
 *
 * NENHUM CLIENTE ESTÁ AQUI: a cor e o logótipo esperados leem-se do
 * `regiao.json` que a construção publicou, e as regiões de prova provam o
 * caso de quem não declara marca nenhuma.
 */
import { test, expect, type Page } from '@playwright/test';
import { PRODUTO, PROVA, PROVA_MUNICIPIO, REGIAO, anfitriao } from './anfitrioes';
import { corDaMarca, declaracao, temMosaicos } from './dados-da-regiao';

/** A cor de um elemento como `#rrggbb`. */
async function cor(page: Page, seletor: string, propriedade: 'color' | 'background-color') {
  return await page
    .locator(seletor)
    .first()
    .evaluate((e, p) => {
      const [r, g, b] = getComputedStyle(e)
        .getPropertyValue(p)
        .match(/\d+(\.\d+)?/g)!
        .map(Number);
      return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
    }, propriedade);
}

function contraste(a: string, b: string): number {
  const l = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [l(a), l(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const nomeDaRede = (id: string) =>
  declaracao(id)?.rede?.nome ?? `Transportes ${declaracao(id)!.de}`;

test('o cabeçalho é a assinatura da rede, e leva ao início da região', async ({ page }) => {
  for (const id of [REGIAO, 'prova', 'prova-municipio']) {
    if (!declaracao(id)) continue;
    await page.goto(`${anfitriao(id)}/rede/`);
    const cabecalho = page.getByRole('banner');
    const primeira = cabecalho.getByRole('link').first();
    await expect(primeira, id).toContainText(nomeDaRede(id));
    await expect(primeira, id).toHaveAttribute('href', '/');
    // O produto não está no cabeçalho de uma região.
    await expect(cabecalho.getByRole('link', { name: /Paragem/ }), id).toHaveCount(0);
  }
});

test('a faixa tem a cor da marca da região, e a tinta lê-se por cima', async ({ page }) => {
  for (const id of [REGIAO, 'prova']) {
    if (!declaracao(id)) continue;
    await page.goto(`${anfitriao(id)}/rede/`);
    const fundo = await cor(page, 'header.cabecalho', 'background-color');
    expect(fundo, id).toBe(corDaMarca(id));
    const tinta = await cor(page, 'header.cabecalho .nome-principal', 'color');
    expect(contraste(fundo, tinta), `${id}: ${tinta} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
    // O foco, dentro da faixa, é da cor da tinta: o amarelo não se via numa faixa clara.
    await page.getByRole('banner').getByRole('link').first().focus();
    const contorno = await page
      .getByRole('banner')
      .getByRole('link')
      .first()
      .evaluate((e) => getComputedStyle(e).outlineColor);
    expect(contorno, id).toBe(
      await page
        .locator('header .nome-principal')
        .first()
        .evaluate((e) => getComputedStyle(e).color),
    );
  }
});

test('as provas não têm marca própria: a faixa é a do produto, sem logótipo', async ({ page }) => {
  for (const host of [PROVA, PROVA_MUNICIPIO]) {
    await page.goto(`${host}/rede/`);
    expect(await cor(page, 'header.cabecalho', 'background-color'), host).toBe('#0a5c7a');
    await expect(page.locator('header img.logotipo'), host).toHaveCount(0);
  }
});

test('a região que declara um logótipo mostra-o, sem saltar quando chega', async ({ page }) => {
  const logotipo = declaracao()?.marca?.logotipo;
  test.skip(!logotipo, 'a região em teste não declara logótipo');
  await page.goto('/rede/');
  const img = page.locator('header img.logotipo');
  await expect(img).toHaveAttribute('src', new RegExp(`${logotipo!.replace(/\./g, '\\.')}$`));
  // A largura e a altura vêm no HTML: o lugar está guardado antes de a imagem chegar.
  await expect(img).toHaveAttribute('width', /^\d+$/);
  await expect(img).toHaveAttribute('height', /^\d+$/);
  expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  // Decorativo: o nome está escrito ao lado.
  await expect(img).toHaveAttribute('alt', '');
});

test('«Feito com Paragem.pt» discreto, no fim, a levar ao produto', async ({ page }) => {
  await page.goto('/rede/');
  const feito = page.getByRole('contentinfo').locator('.feito-com');
  await expect(feito).toHaveText('Feito com Paragem.pt');
  // A montra do produto, noutro anfitrião (a construção dos testes leva-a a
  // `NEXT_PUBLIC_PARAGEM_PRODUTO`, que é este).
  await expect(feito.getByRole('link', { name: 'Paragem.pt' })).toHaveAttribute('href', PRODUTO);
});

test('a marca da rede está no primeiro ecrã do mapa, e no menu', async ({ page }) => {
  test.skip(!temMosaicos(), 'a região em teste não tem mapa');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const folha = page.locator('.folha-de-abertura');
  await expect(folha.locator('.assinatura')).toContainText(nomeDaRede(REGIAO));
  await expect(folha.locator('.assinatura')).toBeInViewport();

  await page.getByRole('button', { name: 'Abrir o menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.locator('.assinatura')).toContainText(nomeDaRede(REGIAO));
  await expect(menu.locator('.feito-com')).toHaveText('Feito com Paragem.pt');
});

test('um nome comprido não muda a altura do cabeçalho, nem empurra a página', async ({ page }) => {
  // O nome de uma comunidade intermunicipal tem facilmente sessenta letras.
  // Mede-se com o nome da região em teste e com um assim, escrito por cima.
  for (const largura of [320, 390, 1280]) {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.goto('/rede/');
    const altura = async () => (await page.locator('header.cabecalho').boundingBox())!.height;
    const antes = await altura();
    await page.evaluate(() => {
      const longo =
        'Comunidade Intermunicipal das Terras Altas do Vale do Rio Comprido e Serras Vizinhas';
      for (const e of document.querySelectorAll('header .nome-principal, header .nome-secundario'))
        e.textContent = longo;
    });
    expect(await altura(), `${largura} px`).toBe(antes);
    const larga = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(larga, `${largura} px: a página desliza para o lado`).toBeLessThanOrEqual(0);
  }
});
