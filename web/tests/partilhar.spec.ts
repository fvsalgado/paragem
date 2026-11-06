/**
 * «PARTILHAR» NA PARAGEM E NA LINHA: o endereço canónico da página, pela folha
 * de partilha do telemóvel quando há, e copiado quando não há — e aí diz-se
 * que se copiou.
 */
import { expect, test, type Page } from '@playwright/test';
import { linhaComMaisViagens, paragemComMaisPartidas } from './dados-da-regiao';

const PAGINAS = [
  ['paragem', `/rede/paragens/${paragemComMaisPartidas().id}/`],
  ['linha', `/rede/linhas/${linhaComMaisViagens().id}/`],
] as const;

/** Sem folha de partilha, como o Chromium da secretária: só resta copiar. */
const semFolha = (page: Page) =>
  page.addInitScript(() => {
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (navigator as { share?: unknown }).share;
  });

for (const [qual, caminho] of PAGINAS) {
  test(`na ${qual}, «Partilhar» é um botão com nome, e sem folha copia o endereço`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await semFolha(page);
    await page.goto(caminho);
    const botao = page.getByRole('button', { name: 'Partilhar' });
    await expect(botao).toBeVisible();
    // Um alvo a sério, para um dedo na rua.
    const caixa = (await botao.boundingBox())!;
    expect(caixa.height).toBeGreaterThanOrEqual(44);
    expect(caixa.width).toBeGreaterThanOrEqual(44);

    await botao.click();
    await expect(page.getByRole('status').filter({ hasText: 'Ligação copiada' })).toBeVisible();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toBe(new URL(caminho, page.url()).href);
  });
}

test('com folha de partilha, partilha o título e o endereço da página', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { partilhado?: ShareData };
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (dados: ShareData) => {
        w.partilhado = dados;
      },
    });
  });
  const [, caminho] = PAGINAS[0];
  await page.goto(`${caminho}#horario`);
  await page.getByRole('button', { name: 'Partilhar' }).click();
  const dados = await page.waitForFunction(
    () => (window as unknown as { partilhado?: ShareData }).partilhado,
  );
  const { title, url } = (await dados.jsonValue()) as ShareData;
  // O canónico, e não o da barra: a âncora fica de fora.
  expect(url).toBe(new URL(caminho, page.url()).href);
  expect(title).toBe(await page.title());
});
