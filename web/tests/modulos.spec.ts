/**
 * Um módulo desligado desaparece do sítio — e só ele.
 *
 * Nos testes não há base: quem desliga é `PARAGEM_MODULOS_DESLIGADOS` no
 * ambiente do servidor (`prova=taxi`, em `playwright.config.ts` e no CI), que
 * se SOMA ao que a base diria. O que se prova é o efeito: a página do modo
 * deixa de existir, o cartão sai da grelha, os pontos saem do mapa, o
 * ficheiro sai dos dados abertos, o concelho deixa de o contar — na Serra da
 * Pedra Alta, que declara táxis. O que não se desligou fica como estava.
 */
import { test, expect } from '@playwright/test';
import { PROVA } from './anfitrioes';

const DESLIGADO = process.env.PARAGEM_MODULOS_DESLIGADOS ?? '';
const TAXI_DESLIGADO = /\bprova=([a-z-]+\+)*taxi(\+|,|$)/.test(DESLIGADO);

test.beforeEach(() => {
  test.skip(!TAXI_DESLIGADO, 'o servidor não tem PARAGEM_MODULOS_DESLIGADOS=prova=taxi');
});

// Pelo navegador e não pelo `request` do Node: `*.localhost` resolve no
// Chromium (`playwright.config.ts`), não necessariamente no DNS da máquina.
test('a página do modo desligado deixa de existir; a de um ligado fica', async ({ page }) => {
  expect((await page.goto(`${PROVA}/modos/taxi/`))?.status()).toBe(404);
  expect((await page.goto(`${PROVA}/modos/bicicleta/`))?.status()).toBe(200);
});

test('o cartão sai da grelha «Por modo», e os outros ficam', async ({ page }) => {
  await page.goto(`${PROVA}/rede/`);
  const grelha = page.getByRole('region', { name: 'Por modo' }).getByRole('listitem');
  await expect(grelha.filter({ hasText: 'Táxi' })).toHaveCount(0);
  await expect(grelha.filter({ hasText: 'Bicicleta partilhada' })).toHaveCount(1);
});

test('os pontos do modo saem do mapa, e a pílula com eles', async ({ page }) => {
  await page.goto(`${PROVA}/`);
  // Os pontos vão com a página, dentro do JSON que o React escreve com as
  // aspas escapadas; um ponto de táxi era um ponto a mais.
  const html = await page.content();
  expect(html).toMatch(/\\"tipo\\":\\"bicicleta\\"/);
  expect(html).not.toMatch(/\\"tipo\\":\\"taxi\\"/);
  // E as pílulas das camadas, que derivam dos pontos, não oferecem o que não há.
  const pilulas = page.locator('button.pilula');
  if ((await pilulas.count()) > 0) {
    await expect(pilulas.filter({ hasText: 'Táxi' })).toHaveCount(0);
    await expect(pilulas.filter({ hasText: 'Bicicleta partilhada' })).toHaveCount(1);
  }
});

test('o ficheiro do modo sai dos dados abertos', async ({ page }) => {
  // Pelo NOME do ficheiro e não pela marcação da página: o que aqui se mede é
  // o interruptor a fazer efeito, e a página das descargas já foi uma tabela e
  // agora é uma lista.
  await page.goto(`${PROVA}/dados-abertos/`);
  await expect(page.getByRole('link', { name: 'taxis.geojson' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'urbanos.geojson' })).toHaveCount(1);
});

test('o concelho deixa de contar o que está desligado, e conta o resto', async ({ page }) => {
  await page.goto(`${PROVA}/rede/concelhos/`);
  await page.getByRole('main').locator('.lista a').first().click();
  await expect(page).toHaveURL(/\/rede\/concelhos\/[^/]+\/$/);
  const conteudo = page.getByRole('main');
  await expect(conteudo.getByText(/Táxi/)).toHaveCount(0);
  await expect(conteudo.getByText(/Bicicleta partilhada/).first()).toBeVisible();
});
