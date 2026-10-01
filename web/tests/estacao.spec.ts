/**
 * A ESTAÇÃO: os comboios que o sítio já tem, e o autocarro à porta.
 *
 * Dizia «os horários da CP não são publicados aqui» — e o planeador do mesmo
 * sítio propunha comboios ao minuto. E a ligação ao autocarro era um nome, às
 * vezes duas vezes o mesmo, sem uma partida. A demonstração não tem comboio, e
 * aí estes casos saltam com a razão escrita.
 */
import { test, expect } from '@playwright/test';

import { estacoes, fusoDaRegiao, SEM } from './dados-da-regiao';

const COM_AUTOCARRO = estacoes().find((e) => e.sem_ligacao === false);
const SEM_AUTOCARRO = estacoes().find((e) => e.sem_ligacao === true);
const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');

test.use({ timezoneId: fusoDaRegiao() });

test('a estação mostra os comboios, e o autocarro à porta uma vez por nome', async ({ page }) => {
  test.skip(!COM_AUTOCARRO, SEM.comboio);
  await page.goto(`/rede/estacoes/${seguro(COM_AUTOCARRO!.id)}/`);
  await expect(page.getByRole('heading', { name: 'Comboios a seguir' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('não são publicados aqui');
  const aPorta = page.locator('.paragem-a-porta h3 a');
  await expect(aPorta.first()).toBeVisible();
  const nomes = await aPorta.allInnerTexts();
  expect(new Set(nomes).size, 'a mesma paragem duas vezes').toBe(nomes.length);
  await expect(page.getByRole('link', { name: 'Como chegar aqui' })).toHaveAttribute(
    'href',
    /\/viagem\/\?para=/,
  );
});

test('sem autocarro perto, di-lo sem o vermelho dos alertas', async ({ page }) => {
  test.skip(!SEM_AUTOCARRO, SEM.comboio);
  await page.goto(`/rede/estacoes/${seguro(SEM_AUTOCARRO!.id)}/`);
  const faixa = page.locator('.faixa', { hasText: 'Não há paragem de autocarro' });
  await expect(faixa).toBeVisible();
  await expect(faixa).not.toHaveClass(/alerta/);
});
