/**
 * O ÍCONE, O MANIFESTO E A COR DE TEMA, em todos os anfitriões.
 *
 * Os três ficheiros de ícone que o encaminhamento deixava passar não existiam
 * e davam 404 — o navegador registava o erro na consola —, e não havia
 * manifesto nem cor de tema: o sítio não se punha no ecrã principal com marca
 * nenhuma (P3-004). O ícone é o do produto em todo o lado; o manifesto é de
 * cada anfitrião, e o de uma região chama-se como ela.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { PORTA, PRODUTO, anfitriao, regioes } from './anfitrioes';

/** Um pedido pelo endereço da máquina, com o `Host` de quem se quer ser. */
async function pedir(request: APIRequestContext, host: string | null, caminho: string) {
  return await request.get(`http://127.0.0.1:${PORTA}${caminho}`, {
    headers: host ? { host: `${host}:${PORTA}` } : {},
  });
}

const ANFITRIOES = [null, ...regioes().map((id) => `${id}.localhost`)];

test('os ícones respondem em todos os anfitriões, com o tipo certo', async ({ request }) => {
  for (const host of ANFITRIOES) {
    for (const [caminho, tipo] of [
      ['/favicon.ico', /image\/(x-icon|vnd\.microsoft\.icon)/],
      ['/icon.svg', /image\/svg\+xml/],
      ['/apple-icon.png', /image\/png/],
    ] as const) {
      const r = await pedir(request, host, caminho);
      expect(r.status(), `${host ?? 'produto'} ${caminho}`).toBe(200);
      expect(r.headers()['content-type'], `${host ?? 'produto'} ${caminho}`).toMatch(tipo);
    }
  }
});

test('cada anfitrião tem o seu manifesto, e os ícones dele existem', async ({ request }) => {
  for (const host of ANFITRIOES) {
    const r = await pedir(request, host, '/manifest.webmanifest');
    expect(r.status(), host ?? 'produto').toBe(200);
    expect(r.headers()['content-type']).toContain('application/manifest+json');
    const m = await r.json();
    expect(m.start_url).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.lang).toBe('pt-PT');
    expect(m.theme_color).toBe('#0A5C7A');
    // O da região chama-se como ela; o do produto, como o produto.
    if (host) expect(m.name).toMatch(/^Transportes /);
    else expect(m.name).toBe('Paragem.pt');
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icone of m.icons as { src: string }[]) {
      expect((await pedir(request, host, icone.src)).status(), icone.src).toBe(200);
    }
  }
});

test('cada página diz ao navegador onde estão o ícone, o manifesto e a cor de tema', async ({
  page,
}) => {
  for (const endereco of [
    `${PRODUTO}/`,
    `${PRODUTO}/contacto/`,
    `${anfitriao(regioes()[0])}/rede/`,
  ]) {
    await page.goto(endereco);
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0A5C7A');
  }
});
