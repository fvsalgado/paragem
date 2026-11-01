/**
 * O PLANEADOR NUM ECRÃ LARGO TEM O MAPA AO LADO (auditoria de 1/11/2026, #122):
 * as opções à esquerda, e o percurso da opção aberta desenhado à direita. Era
 * uma coluna estreita no meio de um ecrã de 1 440 px, sem mapa nenhum.
 *
 * Num telemóvel não: lá o mapa com as direções é a página inicial, e o
 * MapLibre não se descarrega para um mapa que não se mostra.
 */
import { expect, test } from '@playwright/test';
import { diaComMaisServico, duasParagens, SEM, temMosaicos } from './dados-da-regiao';

const viagem = () => {
  const par = duasParagens();
  const dia = diaComMaisServico();
  return par
    ? `/viagem/?de=${encodeURIComponent(par[0].id)}&para=${encodeURIComponent(par[1].id)}${dia ? `&dia=${dia}&hora=08:00` : ''}`
    : null;
};

test.describe('num ecrã largo', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test('as opções à esquerda e o percurso no mapa à direita', async ({ page }) => {
    test.skip(!temMosaicos(), SEM.mosaicos);
    const endereco = viagem();
    test.skip(!endereco, 'a região não tem duas paragens');
    await page.goto(endereco!);
    const mapa = page.locator('.mapa-da-viagem');
    await expect(mapa.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
    // AO LADO, e não por baixo: começa à direita das opções.
    const opcoes = await page.locator('.viagem-e-mapa > .coluna-principal').boundingBox();
    const caixa = await mapa.boundingBox();
    expect(caixa!.x).toBeGreaterThan(opcoes!.x + opcoes!.width - 1);
    // Quando há uma opção, o percurso dela desenha-se.
    const opcao = page.locator('.opcao').first();
    if (await opcao.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (
                  window as unknown as {
                    __mapa?: { queryRenderedFeatures(o: { layers: string[] }): unknown[] };
                  }
                ).__mapa?.queryRenderedFeatures({ layers: ['percurso-linha'] }).length ?? 0,
            ),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
    }
  });
});

test('num telemóvel, a página das direções não descarrega o mapa', async ({ page }) => {
  const endereco = viagem();
  test.skip(!endereco, 'a região não tem duas paragens');
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto(endereco!);
  await expect(page.getByRole('heading', { name: 'Como chegar', level: 1 })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.locator('.mapa-da-viagem')).toBeHidden();
  expect(pedidos.filter((u) => /maplibre-gl\.mjs|\.pmtiles/.test(u))).toEqual([]);
});
