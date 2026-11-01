/**
 * A FOLHA DO MAPA RESPONDE ÀS DUAS PERGUNTAS DE QUEM DECIDE: quanto custa
 * andar na rede, e como se pede o transporte a pedido (auditoria de
 * 1/11/2026, #90). E num ecrã largo diz o que o sítio junta (#173).
 */
import { test, expect } from '@playwright/test';

import { aPedido, temAPedido, temMosaicos, SEM } from './dados-da-regiao';

test('o a pedido tem o telefone na folha, e os preços levam ao tarifário', async ({ page }) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto('/');
  const folha = page.locator('section.folha-de-abertura');
  await expect(folha).toBeVisible();
  if (temAPedido() && aPedido()?.reservas?.telefone) {
    const bloco = folha.getByRole('region', { name: 'Transporte a pedido' });
    await expect(bloco.getByRole('link', { name: /^Ligar / })).toHaveAttribute('href', /^tel:/);
  }
  const precos = folha.locator('.precos-na-folha a');
  if (await precos.count()) {
    await expect(precos).toHaveAttribute('href', '/rede/tarifario/');
    await expect(precos).toContainText('€');
  }
  // A «Tudo em lista» continua a ser o último filho da folha (a folha só se
  // pinta inteira quando ele chega).
  await expect(folha.locator('> :last-child')).toHaveClass(/abertura-nota/);
});

test('num ecrã largo, a folha diz numa frase o que o sítio junta', async ({ page }) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const frase = page.locator('.folha-de-abertura .o-que-junta');
  if (await frase.count()) {
    await expect(frase).toBeVisible();
    await expect(frase).toContainText('tudo num só sítio');
  }
});
