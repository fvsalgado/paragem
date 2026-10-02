/**
 * A PÁGINA DA LINHA RESPONDE A «QUAL É O HORÁRIO DA LINHA X?».
 *
 * Não tinha uma única hora: era a lista das paragens do percurso mais servido,
 * com os sentidos chamados «Ida» e «Volta». Estes testes fixam o que passou a
 * ter — o sentido escrito pelo destino, as horas de cada viagem por tipo de
 * dia, e o percurso desenhado na cor da linha com uma ligação por paragem.
 */
import { test, expect } from '@playwright/test';

import { fusoDaRegiao, linhaComMaisViagens, linhas } from './dados-da-regiao';

const LINHA = linhaComMaisViagens();

test.use({ timezoneId: fusoDaRegiao() });

test('cada sentido diz para onde vai, e não «Ida» ou «Volta»', async ({ page }) => {
  await page.goto(`/rede/linhas/${LINHA.id}/`);
  const sentidos = await page.locator('main h2').allInnerTexts();
  expect(sentidos.length).toBeGreaterThan(0);
  for (const s of sentidos) {
    expect(s).toMatch(/^(Para |Circular, a partir de )/);
  }
  await expect(page.locator('dl.pontas-do-sentido').first()).toContainText('De');
});

test('o horário tem as horas de cada viagem, por tipo de dia', async ({ page }) => {
  await page.goto(`/rede/linhas/${LINHA.id}/`);
  const quadros = page.locator('details.quadro-do-dia');
  await expect(quadros.first()).toBeAttached();
  // Os nomes dos quadros são por extenso — nunca um código.
  for (const nome of await page.locator('details.quadro-do-dia .nome-do-quadro').allInnerTexts()) {
    expect(nome).not.toMatch(/^[A-Z0-9_]+-[A-Z0-9]+$/);
  }
  const primeiro = quadros.first();
  if (!(await primeiro.evaluate((d) => (d as HTMLDetailsElement).open))) {
    await primeiro.locator('summary').click();
  }
  const horas = primeiro.locator('tbody td');
  await expect(horas.filter({ hasText: /^(cerca das )?\d{2}:\d{2}/ }).first()).toBeVisible();
});

test('o percurso liga a cada paragem, e as pontas destacam-se', async ({ page }) => {
  await page.goto(`/rede/linhas/${LINHA.id}/`);
  const percurso = page.locator('ol.percurso-da-linha').first();
  const paragens = percurso.locator('li a');
  expect(await paragens.count()).toBeGreaterThan(1);
  await expect(percurso.locator('li.primeira')).toHaveCount(1);
  await expect(percurso.locator('li.ultima')).toHaveCount(1);
  const href = await paragens.first().getAttribute('href');
  expect(href).toMatch(/\/rede\/paragens\//);
});

test('a lista das linhas filtra-se pelo número, e diz quando não sobra nenhuma', async ({
  page,
}) => {
  // Cento e tal linhas numa coluna, sem maneira de chegar à que se quer sem
  // rolar até ela (P2-019). Uma lista que cabe num ecrã não tem filtro.
  const todas = linhas();
  test.skip(todas.length < 9, 'a região tem poucas linhas: a lista cabe num ecrã');
  await page.goto('/rede/linhas/');
  const filtro = page.getByLabel('Filtrar pelo número ou pelo nome');
  const itens = page.locator('main ul.lista > li');
  await expect(itens).toHaveCount(todas.length);

  await filtro.fill(LINHA.codigo);
  // O número exato primeiro: quem escreve «1» quer a 1, e não a 11.
  await expect(itens.first()).toContainText(LINHA.nome);
  expect(await itens.count()).toBeLessThan(todas.length);

  await filtro.fill('xqzwv');
  await expect(itens).toHaveCount(0);
  await expect(page.getByText(/^Nenhuma linha com «xqzwv»/)).toBeVisible();
});
