/**
 * As descargas pelo domínio da região (P4-025). A página ligava direto ao
 * armazém, num endereço do fornecedor de alojamento; agora liga a
 * `/dados-abertos/<caminho>` no domínio da região, e a rota redireciona para
 * o armazém — que continua a servir os bytes, sem nada no meio.
 */
import { test, expect } from '@playwright/test';
import { PROVA } from './anfitrioes';
import { relatorioDaConstrucao } from './dados-da-regiao';

test('as descargas saem pelo domínio da região, e chegam ao ficheiro', async ({ page }) => {
  await page.goto(`${PROVA}/dados-abertos/`);
  const ligacao = page.getByRole('link', { name: 'gtfs/rede-alta.zip' });
  await expect(ligacao).toHaveAttribute('href', '/dados-abertos/gtfs/rede-alta.zip');

  // Pedido de dentro da página, como o navegador o faria: o domínio da região
  // responde, redireciona, e o ficheiro chega inteiro.
  const resposta = await page.evaluate(async () => {
    const r = await fetch('/dados-abertos/gtfs/rede-alta.zip');
    const corpo = new Uint8Array(await r.arrayBuffer());
    return {
      ok: r.ok,
      redirecionou: r.redirected,
      url: r.url,
      zip: corpo[0] === 0x50 && corpo[1] === 0x4b,
    };
  });
  expect(resposta.ok).toBe(true);
  expect(resposta.redirecionou).toBe(true);
  expect(resposta.url).toMatch(/\/prova\/descargas\/gtfs\/rede-alta\.zip$/);
  expect(resposta.zip, 'o que chega é um zip').toBe(true);

  // O que a página não lista não se alcança por aqui — nem a subir pastas.
  const fora = await page.evaluate(async () =>
    Promise.all(
      ['/dados-abertos/inventario.json', '/dados-abertos/gtfs/../regiao.json'].map(
        async (c) => (await fetch(c, { redirect: 'manual' })).status,
      ),
    ),
  );
  expect(fora[0]).toBe(404);
  expect([404, 0]).toContain(fora[1]);
});

test('os dados abertos abrem pelo que se usa, e não publicam o registo da construção', async ({
  page,
}) => {
  // A página abria com catorze linhas sobre o que não se pode fazer com os
  // ficheiros e fechava com o registo interno do pipeline em bruto —
  // «esperava 28, obtive 26», códigos do validador, «1 viagens». O registo
  // sai da página; quem o quiser descarrega o relatório da construção.
  await page.goto('/dados-abertos/');
  const principal = page.getByRole('main');
  await expect(principal.getByRole('heading', { name: /Lacunas|O que falta/ })).toHaveCount(0);
  await expect(principal).not.toContainText(/esperava \d+, obtive/);

  // O primeiro parágrafo diz o que há para usar; os termos vêm depois, uma vez.
  const abertura = principal.locator('h1 + p');
  await expect(abertura).toContainText('para descarregar e usar');
  await expect(abertura).not.toContainText(/licença/i);
  await expect(
    principal
      .locator('strong')
      .filter({ hasText: /^(Nem todos estes ficheiros|Estes ficheiros reutilizam-se)/ }),
  ).toHaveCount(1);
  const termos = principal.getByRole('heading', { name: 'Com que termos' });
  const primeiraDescarga = principal.locator('ul.descargas').first();
  expect((await termos.boundingBox())!.y).toBeGreaterThan(
    (await primeiraDescarga.boundingBox())!.y,
  );

  const relatorio = relatorioDaConstrucao();
  if (relatorio) {
    await expect(principal.getByRole('link', { name: relatorio })).toBeVisible();
  }
});
