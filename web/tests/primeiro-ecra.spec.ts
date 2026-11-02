/**
 * O PRIMEIRO ECRÃ NO TELEMÓVEL: o mapa com a rede desenhada e as sedes de
 * concelho nomeadas, por cima de uma folha a meio com «Para onde quer ir?» e
 * «Aqui perto» à vista (§6).
 *
 * Nasceu de um defeito que só se via em imagem (auditoria de 1/11/2026, #11):
 * a 390 × 844, o mapa abria com um retângulo vazio entre a procura e a folha —
 * a cor do fundo e mais nada. O DOM estava certo, o MapLibre dizia que tinha
 * desenhado tudo, e quem perguntasse ao mapa que nomes lá estavam ouvia a
 * lista inteira. Por isso este teste olha para os píxeis.
 */
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { BUILD, REGIAO } from './anfitrioes';
import { temMosaicos } from './dados-da-regiao';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

/** Espera que o mapa tenha acabado de desenhar o que tem para desenhar. */
async function mapaPronto(page: Page) {
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { __mapa?: { loaded(): boolean; areTilesLoaded(): boolean } })
        .__mapa;
      return !!m && m.loaded() && m.areTilesLoaded();
    },
    undefined,
    { timeout: 30_000 },
  );
  // Uma pintura depois de os mosaicos chegarem.
  await page.waitForTimeout(500);
}

/**
 * Que parte de um pedaço do ecrã é da cor mais comum — lida no navegador, sem
 * dependências. Um mapa vazio é quase todo a cor do fundo; um mapa desenhado
 * tem campo, estradas, água, a rede e nomes.
 */
async function corDominante(
  page: Page,
  caixa: { x: number; y: number; width: number; height: number },
): Promise<number> {
  // O ECRÃ INTEIRO, e recorta-se depois. Com `clip`, a captura refaz a
  // composição de outra maneira, e o retângulo vazio não aparecia nela —
  // medido: a mesma fração com e sem o defeito.
  const png = await page.screenshot();
  return page.evaluate(
    async ([b64, c]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const k = img.width / window.innerWidth;
      const [w, h] = [Math.round(c.width * k), Math.round(c.height * k)];
      const tela = document.createElement('canvas');
      tela.width = w;
      tela.height = h;
      const ctx = tela.getContext('2d')!;
      ctx.drawImage(img, c.x * k, c.y * k, w, h, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const cores = new Map<number, number>();
      // Arredondadas a 16 níveis por canal: o que conta são as coisas
      // desenhadas, e não o ruído do antisserrilhado.
      for (let i = 0; i < data.length; i += 4) {
        const c = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        cores.set(c, (cores.get(c) ?? 0) + 1);
      }
      return Math.max(...cores.values()) / (data.length / 4);
    },
    [png.toString('base64'), caixa] as const,
  );
}

/** As sedes que a região tem com sítio no OpenStreetMap — a mesma conta de `lib/sedes.ts`. */
function haSedes(): boolean {
  const ler = (f: string) => {
    const c = join(BUILD, REGIAO, 'sitio', f);
    return existsSync(c) ? JSON.parse(readFileSync(c, 'utf8')) : null;
  };
  const concelhos = (ler('concelhos.json') ?? []) as { nome: string }[];
  const sitios = (ler('sitios.json')?.sitios ?? []) as unknown[][];
  const nomes = new Set(concelhos.map((c) => c.nome));
  return sitios.some(
    (s) => nomes.has(String(s[0])) && /^place=(city|town|village)$/.test(String(s[4])),
  );
}

test.describe('o primeiro ecrã, no telemóvel', () => {
  test.skip(!temMosaicos(), 'a região em teste não tem mapa: abre na vista sem mapa');

  test('o mapa desenha-se inteiro entre a procura e a folha', async ({ page }) => {
    await page.goto('/');
    await mapaPronto(page);
    const fila = await page.locator('.app-camadas, .app-procura').last().boundingBox();
    const folha = await page.locator('.folha-de-abertura').boundingBox();
    expect(fila && folha, 'a procura e a folha estão no ecrã').toBeTruthy();
    const topo = Math.ceil(fila!.y + fila!.height) + 4;
    const fundo = Math.floor(folha!.y) - 4;
    expect(fundo - topo, 'sobra mapa entre a procura e a folha').toBeGreaterThan(160);
    // A METADE DE CIMA do que se vê do mapa, de bordo a bordo menos a coluna
    // dos botões: era aí que ficava o retângulo vazio.
    const fracao = await corDominante(page, {
      x: 0,
      y: topo,
      width: 320,
      height: Math.floor((fundo - topo) / 2),
    });
    // Medido: com o retângulo vazio, 99 % do pedaço era a cor do fundo; com o
    // mapa desenhado, a cor mais comum não chega a metade.
    expect(fracao, 'a metade de cima do mapa não é uma cor só').toBeLessThan(0.85);
  });

  test('a folha abre a meio, com «Para onde quer ir?» e «Aqui perto» à vista', async ({ page }) => {
    await page.goto('/');
    const folha = page.locator('.folha-de-abertura');
    await expect(folha).toHaveAttribute('data-altura', 'media');
    const altura = page.viewportSize()!.height;
    for (const alvo of [
      page.getByRole('button', { name: 'Para onde quer ir?' }),
      folha.getByRole('heading', { name: 'Aqui perto' }),
    ]) {
      await expect(alvo).toBeVisible();
      const caixa = await alvo.boundingBox();
      expect(caixa!.y + caixa!.height, 'cabe no primeiro ecrã').toBeLessThanOrEqual(altura);
    }
    // E A FOLHA DEIXA MAPA: a meio, e não a tapar o ecrã.
    const caixa = await folha.boundingBox();
    expect(caixa!.y, 'a folha começa abaixo de metade do ecrã').toBeGreaterThan(altura * 0.45);
  });

  test('as sedes de concelho têm nome no mapa, logo à entrada', async ({ page }) => {
    test.skip(!haSedes(), 'nenhuma sede desta região tem lugar no OpenStreetMap');
    await page.goto('/');
    await mapaPronto(page);
    const nomes = await page.evaluate(() =>
      (
        window as unknown as {
          __mapa: {
            queryRenderedFeatures(o: { layers: string[] }): { properties: { nome: string } }[];
          };
        }
      ).__mapa
        .queryRenderedFeatures({ layers: ['nomes-das-sedes'] })
        .map((f) => f.properties.nome),
    );
    expect(new Set(nomes).size, 'pelo menos uma sede nomeada').toBeGreaterThan(0);
  });
});
