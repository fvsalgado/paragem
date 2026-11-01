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

import {
  fusoDaRegiao,
  paragemComMaisPartidas,
  temMosaicos,
  umaPartidaFutura,
  SEM,
} from './dados-da-regiao';

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

  // A resposta antes do pormenor: o «A seguir» vem antes das partidas do dia.
  const horario = page.getByRole('heading', { name: 'Partidas do dia' });
  expect((await aSeguir.boundingBox())!.y).toBeLessThan((await horario.boundingBox())!.y);
});

test('o horário vem por tipo de dia, e o de hoje abre-se e diz «hoje»', async ({ page }) => {
  test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
  await page.clock.setFixedTime(PARTIDA!.quando);
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);

  const quadros = page.locator('details.quadro-do-dia');
  await expect(quadros.first()).toBeAttached();
  // Os quadros da operadora ficam por baixo da lista do dia, fechados (#14).
  await page.locator('details.todos-os-quadros > summary').click();
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
  await page.locator('details.todos-os-quadros > summary').click();
  const quadro = page.locator('details.quadro-do-dia').first();
  const aberto = await quadro.evaluate((d) => (d as HTMLDetailsElement).open);
  await quadro.locator('summary').click();
  await expect.poll(() => quadro.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(!aberto);
});

test('as partidas do dia vêm numa lista só, pela hora, e mudam com o dia', async ({ page }) => {
  // Para saber o que passa numa segunda era preciso somar três quadros
  // (auditoria de 1/11/2026, #14). A lista junta os que valem no dia.
  test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
  await page.clock.setFixedTime(PARTIDA!.quando);
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  const doDia = page.locator('section[aria-labelledby="horario"] .partidas-do-dia');
  await expect(doDia.locator('.dia-escolhido')).toContainText(/^Hoje, /);
  // A PRIMEIRA PINTURA É A DO SERVIDOR, com o dia dele; o relógio do teste é
  // outro, e a lista passa ao dia do navegador quando a tabela dos dias chega.
  // Lida a meio dessa troca, vinha vazia (CI, 1/11/2026): espera-se pela hora
  // que tem de lá estar.
  await expect(
    doDia.locator('tbody td .hora').filter({ hasText: new RegExp(`^${PARTIDA!.hora}$`) }),
  ).not.toHaveCount(0);
  const horas = await doDia.locator('tbody td .hora').allInnerTexts();
  expect(horas.length).toBeGreaterThan(0);
  expect(horas, 'pela hora').toEqual([...horas].sort());
  expect(horas).toContain(PARTIDA!.hora);
  // Os quadros ficam, fechados, por baixo.
  await expect(page.locator('details.todos-os-quadros')).not.toHaveAttribute('open', '');

  await doDia.getByRole('radio', { name: 'Amanhã' }).check();
  // Amanhã, ou a frase que diz que os horários não chegam lá — nunca o vazio.
  await expect(doDia.locator('[aria-live]')).toContainText(/Amanhã|horários carregados/);
  await doDia.getByRole('radio', { name: 'Outro dia' }).check();
  await expect(doDia.getByLabel('Data')).toBeVisible();
});

test('as linhas que param aqui levam à página de cada uma', async ({ page }) => {
  // Para saber se a linha X passa ali era preciso abrir os quadros (#100).
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  const linhas = page.getByRole('region', { name: /linhas? que para/ });
  const primeira = linhas.getByRole('link').first();
  await expect(primeira).toBeVisible();
  await expect(primeira).toHaveAttribute('href', /\/rede\/linhas\/[^/]+\/$/);
  expect(await linhas.getByRole('link').count()).toBeGreaterThanOrEqual(
    Math.min(PARAGEM.linhas.length, 1),
  );
});

test('«Ver no mapa» abre o mapa do sítio nesta paragem, com o cartão dela', async ({ page }) => {
  // Era «39.463, -8.213525 ver no OpenStreetMap»: coordenadas cruas, que não
  // dizem nada a quem viaja, num sítio que tem o seu próprio mapa.
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  const nome = await page.locator('h1').innerText();
  await page.getByRole('link', { name: 'Ver no mapa', exact: true }).click();
  await expect(page).toHaveURL(/\?ponto=/);
  await expect(page.locator('.cartao-de-baixo h2')).toHaveText(nome, { timeout: 15_000 });
});
