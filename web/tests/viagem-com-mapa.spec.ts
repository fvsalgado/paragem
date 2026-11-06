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

  test('o percurso leva setas no sentido da viagem, fora dos troços a pé', async ({ page }) => {
    test.skip(!temMosaicos(), SEM.mosaicos);
    const endereco = viagem();
    test.skip(!endereco, 'a região não tem duas paragens');
    await page.goto(endereco!);
    await expect(page.locator('.mapa-da-viagem canvas.maplibregl-canvas')).toBeVisible({
      timeout: 20_000,
    });
    test.skip(
      !(await page
        .locator('.opcao')
        .first()
        .isVisible({ timeout: 20_000 })
        .catch(() => false)),
      'nenhuma opção para esta viagem',
    );
    type Feicao = {
      properties: Record<string, unknown>;
      geometry: { type: string; coordinates: [number, number][] };
    };
    type MapaDeTeste = {
      __mapa: {
        querySourceFeatures(fonte: string): Feicao[];
        queryRenderedFeatures(o: { layers: string[] }): Feicao[];
        jumpTo(o: { center: [number, number]; zoom: number }): void;
      };
    };
    // Perto de um troço de transporte, onde as setas já se desenham.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const m = (window as unknown as MapaDeTeste).__mapa;
          const troco = m
            .querySourceFeatures('percurso')
            .find((f) => f.properties.modo !== 'WALK' && f.geometry.type === 'LineString');
          if (!troco) return false;
          const c = troco.geometry.coordinates;
          m.jumpTo({ center: c[Math.floor(c.length / 2)], zoom: 15 });
          return true;
        }),
      )
      .toBe(true);
    const setas = () =>
      page.evaluate(() =>
        (window as unknown as MapaDeTeste).__mapa
          .queryRenderedFeatures({ layers: ['percurso-setas'] })
          .map((f) => f.properties.modo),
      );
    await expect.poll(async () => (await setas()).length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(await setas()).not.toContain('WALK');
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
