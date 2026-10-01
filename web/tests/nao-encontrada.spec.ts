/**
 * A PÁGINA QUE NÃO EXISTE.
 *
 * Era a do Next.js, em inglês e sem saída, e é das mais visitadas por quem
 * chega de fora: uma ligação antiga, guardada nos favoritos ou impressa num
 * cartaz, a uma paragem que mudou de identificador. Dentro de uma região tem
 * de ter a casa dela à volta e para onde ir; fora, a do produto.
 */
import { test, expect } from '@playwright/test';

import { PRODUTO } from './anfitrioes';

test('numa região, responde 404 em português, com a casa à volta e três saídas', async ({
  page,
}) => {
  // Uma ficha que não existe (a página chama `notFound()`) e um caminho que
  // nenhuma página reconhece (cai na rota de recurso da região).
  for (const caminho of ['/rede/paragens/nao-existe/', '/isto-nao-existe/']) {
    const r = await page.goto(caminho);
    expect(r?.status(), caminho).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Esta página não existe' }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/^Página não encontrada/);
    // O cabeçalho e o rodapé da região, e não uma página em branco.
    await expect(page.locator('header.cabecalho')).toBeVisible();
    await expect(page.locator('footer.rodape')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para o mapa' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Procurar uma paragem' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver a rede' })).toBeVisible();
    await expect(page.getByText(/could not be found/i)).toHaveCount(0);
  }
});

test('fora de uma região, a 404 é a do produto, também em português', async ({ page }) => {
  const r = await page.goto(`${PRODUTO}/isto-nao-existe/`);
  expect(r?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Esta página não existe' }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Página não encontrada/);
  await expect(page.getByRole('link', { name: 'Ver as regiões' })).toBeVisible();
  await expect(page.getByText(/could not be found/i)).toHaveCount(0);
});
