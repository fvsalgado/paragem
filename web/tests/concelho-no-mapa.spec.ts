/**
 * O CONCELHO NO MAPA (auditoria de 1/11/2026, #75): a página de cada concelho
 * tem um mapa com a rede que o atravessa e as paragens dele acesas.
 */
import { expect, test } from '@playwright/test';
import { concelhoComMaisParagens, SEM, temMosaicos } from './dados-da-regiao';

test('a página do concelho tem o mapa dele, com as paragens acesas', async ({ page }) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  const c = concelhoComMaisParagens();
  await page.goto(`/rede/concelhos/${c.id}/`);
  const figura = page.locator('figure.mapa-do-concelho');
  await figura.scrollIntoViewIfNeeded();
  await expect(figura.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(figura.locator('figcaption')).toContainText(c.nome);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __mapa?: { queryRenderedFeatures(o: { layers: string[] }): unknown[] };
              }
            ).__mapa?.queryRenderedFeatures({ layers: ['linha-paragens'] }).length ?? 0,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});

test('o mapa do concelho não prende o dedo que rola a página; o do início, de ecrã inteiro, mexe-se com um dedo', async ({
  page,
}) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  type ComGestos = { __mapa?: { cooperativeGestures: { isEnabled(): boolean } } };
  const cooperativo = () =>
    page.evaluate(() => (window as unknown as ComGestos).__mapa?.cooperativeGestures.isEnabled());

  await page.goto(`/rede/concelhos/${concelhoComMaisParagens().id}/`);
  const figura = page.locator('figure.mapa-do-concelho');
  await figura.scrollIntoViewIfNeeded();
  await expect(figura.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await expect.poll(cooperativo).toBe(true);
  // O aviso por cima do mapa, em português.
  await expect(figura.locator('.maplibregl-mobile-message')).toHaveText(
    'Use dois dedos para mover o mapa',
  );

  await page.goto('/');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  await expect.poll(cooperativo).toBe(false);
});
