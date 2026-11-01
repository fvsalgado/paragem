/**
 * AS LISTAS DAS PARAGENS: o índice e as páginas de cada inicial.
 *
 * Auditoria de 1/11/2026: as iniciais eram uma lista de dois ecrãs que não
 * parecia carregável (#104); a abertura tinha quatro números (#105); a página
 * de uma letra repetia nomes sem forma de os distinguir (#15), misturava as de
 * fora da região com as de dentro (#106) e acabava sem caminho para a letra
 * seguinte (#108).
 */
import { test, expect } from '@playwright/test';

import { paragens } from './dados-da-regiao';

const letraDe = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .trim()
    .charAt(0)
    .toUpperCase();
// A inicial com mais paragens, que é onde as repetições se veem.
const porLetra = new Map<string, number>();
for (const p of paragens()) {
  const l = letraDe(p.nome);
  if (/[A-Z]/.test(l)) porLetra.set(l, (porLetra.get(l) ?? 0) + 1);
}
const LETRA = [...porLetra.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'A';
const temFora = paragens().some((p) => !p.concelho && letraDe(p.nome) === LETRA);

test('as iniciais são uma grelha de botões, e cada um leva à sua letra', async ({ page }) => {
  await page.goto('/rede/paragens/');
  const grelha = page.getByRole('navigation', { name: 'Por inicial' });
  const botao = grelha.getByRole('link', { name: new RegExp(`^${LETRA} `) });
  await expect(botao).toBeVisible();
  expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await botao.click();
  await expect(page).toHaveURL(new RegExp(`/rede/paragens/letra/${LETRA.toLowerCase()}/$`));
});

test('na página de uma letra, nenhuma linha se repete', async ({ page }) => {
  await page.goto(`/rede/paragens/letra/${LETRA.toLowerCase()}/`);
  // `textContent` e não `innerText`: as de fora estão num grupo fechado, e o
  // texto de um elemento que não se vê sai vazio.
  const linhas = (await page.locator('main ul.lista > li > a').allTextContents()).map((t) =>
    t.replace(/\s+/g, ' ').trim(),
  );
  expect(linhas.length).toBeGreaterThan(0);
  const repetidas = linhas.filter((t, i) => linhas.indexOf(t) !== i);
  expect(repetidas, 'duas linhas iguais na lista').toEqual([]);
});

test('as de fora da região ficam à parte, no fim e fechadas', async ({ page }) => {
  test.skip(!temFora, `a letra ${LETRA} não tem paragens fora da região`);
  await page.goto(`/rede/paragens/letra/${LETRA.toLowerCase()}/`);
  const fora = page.locator('details.fora-da-regiao');
  await expect(fora).toBeVisible();
  await expect(fora).not.toHaveAttribute('open', '');
  // Lá dentro, só as de fora; cá fora, nenhuma.
  await expect(page.locator('main > ul.lista').getByText('fora da região')).toHaveCount(0);
});

test('a letra tem a barra das iniciais em cima e a seguinte no fim', async ({ page }) => {
  await page.goto(`/rede/paragens/letra/${LETRA.toLowerCase()}/`);
  const barra = page.getByRole('navigation', { name: 'Iniciais' });
  await expect(barra.locator('a[aria-current="page"]')).toHaveText(LETRA);
  // A de agora está à vista, mesmo numa fila que desliza.
  await expect(barra.locator('a[aria-current="page"]')).toBeInViewport();
  const fim = page.getByRole('navigation', { name: 'Outras iniciais' });
  await expect(fim.getByRole('link', { name: 'Todas as iniciais' })).toBeVisible();
  // A seguinte ou a anterior — numa região com paragens de uma letra só, nenhuma.
  if (porLetra.size > 1) {
    await expect(fim.locator('a[rel="next"], a[rel="prev"]').first()).toBeVisible();
  }
});
