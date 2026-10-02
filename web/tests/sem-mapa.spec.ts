/**
 * UMA REGIÃO SEM MAPA ABRE NA VISTA SEM MAPA (P1-040, P2-041, P4-001).
 *
 * Abria num ecrã de mapa com o mapa em falta: uma caixa cinzenta a dizer que
 * faltava «o recorte do OpenStreetMap». Era o primeiro ecrã das duas regiões
 * de prova — o que se mostra a quem decide — e o de qualquer região real no
 * dia em que os mosaicos ainda não estão publicados.
 *
 * Agora abre no que serve sem mapa: a procura, «Para onde vais?» com o
 * planeador ali mesmo, e o «Perto de ti». A região escolhe-se pela
 * PROPRIEDADE — uma que esta corrida sirva sem mosaicos —, e não pelo nome.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { anfitriao } from './anfitrioes';
import { paragens, regiaoSemMapa } from './dados-da-regiao';

const SEM_MAPA = regiaoSemMapa();
const BASE = SEM_MAPA ? anfitriao(SEM_MAPA) : '';
const UMA = SEM_MAPA ? [...paragens(SEM_MAPA)].sort((a, b) => b.partidas - a.partidas)[0] : null;

test.skip(!SEM_MAPA, 'todas as regiões desta corrida têm mapa');

test('abre na procura e no planeador, e não numa caixa cinzenta', async ({ page }) => {
  await page.goto(`${BASE}/`);
  await expect(page.locator('h1')).toHaveText(/^Transportes /);
  await expect(page.getByRole('combobox', { name: 'Procurar' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'De', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Perto de ti' })).toBeVisible();
  // O que não pode voltar: a caixa vazia, e o jargão de quem constrói.
  await expect(page.locator('.mapa-caixa, canvas')).toHaveCount(0);
  await expect(page.getByText(/recorte do OpenStreetMap/)).toHaveCount(0);
  // E a navegação não promete o que não há: o início não se chama «Mapa».
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await expect(nav.getByRole('link', { name: 'Início' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Mapa' })).toHaveCount(0);
});

test('a procura leva à página da paragem, que é o cartão de quem não tem mapa', async ({
  page,
}) => {
  test.skip(!UMA, 'a região não tem paragens');
  await page.goto(`${BASE}/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill(UMA!.nome.replace(/\)\s*$/, ''));
  await page.getByRole('listbox').getByRole('option').first().click();
  await expect(page).toHaveURL(/\/rede\/paragens\//);
  await expect(page.locator('h1')).toHaveText(UMA!.nome);
  // E a página da paragem não oferece um mapa que a região não tem.
  await expect(page.getByRole('link', { name: /Ver no mapa/ })).toHaveCount(0);
});

test('a vista sem mapa não tem violações do axe', async ({ page }) => {
  await page.goto(`${BASE}/`);
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
