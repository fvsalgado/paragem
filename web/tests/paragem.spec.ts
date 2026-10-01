/**
 * A PÁGINA DA PARAGEM: primeiro o que passa a seguir, depois o horário.
 *
 * Abria com dez quadros e 122 linhas de tabela — 23 ecrãs na paragem mais
 * servida —, com títulos como «E-235», e o «como chegar» no fim. Estes testes
 * fixam a ordem das perguntas: o que passa a seguir, que quadro vale hoje, e
 * onde fica — no mapa do próprio sítio, e não em coordenadas.
 *
 * O relógio põe-se cinco minutos antes de uma partida a sério, no fuso da
 * região (`dados-da-regiao.ts`): «a seguir» depende da hora, e um teste que
 * passa de manhã e falha à noite não diz nada sobre o código.
 */
import { test, expect } from '@playwright/test';

import { fusoDaRegiao, paragemComMaisPartidas, umaPartidaFutura } from './dados-da-regiao';

const PARAGEM = paragemComMaisPartidas();
const PARTIDA = umaPartidaFutura();

test.use({ timezoneId: fusoDaRegiao() });

test('a página começa pelo que passa a seguir, com a espera e a hora', async ({ page }) => {
  test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
  await page.clock.setFixedTime(PARTIDA!.quando);
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);

  const aSeguir = page.locator('section[aria-labelledby="a-seguir"]');
  const primeira = aSeguir.locator('.partidas li').first();
  await expect(primeira).toBeVisible({ timeout: 10_000 });
  await expect(primeira.locator('.quando-passa strong')).toHaveText(/agora|\d+ min/);
  await expect(primeira.locator('.relogio')).toHaveText(PARTIDA!.hora);

  // A resposta antes do pormenor: o «A seguir» vem antes do horário completo.
  const horario = page.getByRole('heading', { name: 'Horário completo' });
  expect((await aSeguir.boundingBox())!.y).toBeLessThan((await horario.boundingBox())!.y);
});

test('o horário vem por tipo de dia, e o de hoje abre-se e diz «hoje»', async ({ page }) => {
  test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
  await page.clock.setFixedTime(PARTIDA!.quando);
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);

  const quadros = page.locator('details.quadro-do-dia');
  await expect(quadros.first()).toBeAttached();
  const deHoje = page.locator('details.quadro-do-dia[open]');
  await expect(deHoje.first()).toBeVisible({ timeout: 10_000 });
  await expect(deHoje.first().locator('summary .hoje')).toHaveText(/hoje/);
  // A partida da hora fixada está num quadro aberto — é o de hoje.
  await expect(deHoje.locator('td .hora', { hasText: PARTIDA!.hora }).first()).toBeVisible();

  // Nenhum título é um código interno: «E-235» chegava ao leitor de ecrã.
  for (const nome of await page.locator('details.quadro-do-dia .nome-do-quadro').allInnerTexts()) {
    expect(nome, 'um quadro com um código por título').not.toMatch(/^[A-Z0-9_]+-[A-Z0-9]+$/);
  }
});

test('os quadros fechados abrem-se ao toque', async ({ page }) => {
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  // Primeiro deixa-se o navegador abrir os de hoje: depois disso, quem manda
  // é o toque.
  await expect(page.locator('section[aria-labelledby="a-seguir"]')).not.toContainText(
    'A ver o que passa',
  );
  const quadro = page.locator('details.quadro-do-dia').first();
  const aberto = await quadro.evaluate((d) => (d as HTMLDetailsElement).open);
  await quadro.locator('summary').click();
  await expect.poll(() => quadro.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(!aberto);
});

test('«Ver no mapa» abre o mapa do sítio nesta paragem, com o cartão dela', async ({ page }) => {
  // Era «39.463, -8.213525 ver no OpenStreetMap»: coordenadas cruas, que não
  // dizem nada a quem viaja, num sítio que tem o seu próprio mapa.
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  const nome = await page.locator('h1').innerText();
  await page.getByRole('link', { name: 'Ver no mapa', exact: true }).click();
  await expect(page).toHaveURL(/\?ponto=/);
  await expect(page.locator('.cartao-de-baixo h2')).toHaveText(nome, { timeout: 15_000 });
});
