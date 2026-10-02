/**
 * As caixas para os sítios das câmaras (P4-007): a página que dá o código, e
 * as caixas — sem o invólucro da região, acessíveis, e sem cookies.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PROVA } from './anfitrioes';

test('a página «Para o seu sítio» monta a caixa e dá a linha para colar', async ({ page }) => {
  await page.goto(`${PROVA}/levar/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Os transportes no seu sítio');
  await page.getByRole('combobox', { name: 'Paragem' }).fill('merc');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByLabel('Quantas partidas').selectOption('3');

  const codigo = page.locator('pre.codigo-para-copiar code').first();
  await expect(codigo).toContainText('/widget/embed.js');
  await expect(codigo).toContainText('data-paragem="pa_mercado"');
  await expect(codigo).toContainText('data-quantas="3"');

  // A pré-visualização é a caixa verdadeira.
  const caixa = page.frameLocator('iframe.previa-da-caixa');
  await expect(caixa.getByRole('heading', { level: 1 })).toContainText('Mercado');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
});

test('a caixa das partidas é só a caixa, acessível, e não guarda nada', async ({
  page,
  context,
}) => {
  await page.goto(`${PROVA}/widget/paragem/pa_mercado/?quantas=2`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mercado');
  // Sem o invólucro da região: nem cabeçalho, nem rodapé, nem a faixa da demonstração.
  await expect(page.locator('header, footer, .rodape')).toHaveCount(0);
  // As ligações abrem noutro separador, e dizem-no.
  const ligacao = page.getByRole('link', { name: /Horário completo/ });
  await expect(ligacao).toHaveAttribute('target', '_blank');
  await expect(ligacao).toContainText('abre noutro separador');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('«Para onde vais?» é um formulário que abre o planeador da região', async ({ page }) => {
  await page.goto(`${PROVA}/widget/viagem/`);
  const formulario = page.locator('form.caixa-da-viagem');
  await expect(formulario).toHaveAttribute('action', '/viagem/');
  await expect(formulario).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('textbox', { name: 'Para onde vais?' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  // E o planeador encontra o destino escrito à mão, sem acentos nem maiúsculas.
  await page.goto(`${PROVA}/viagem/?para=${encodeURIComponent('pedra alta (mercado)')}`);
  await expect(page.getByRole('combobox', { name: 'Para' })).toHaveValue('Pedra Alta (Mercado)');
});

test('a linha para colar é JavaScript, e a caixa só existe nos domínios das regiões', async ({
  page,
}) => {
  const resposta = await page.request.get('http://127.0.0.1:4321/widget/viagem/');
  expect(resposta.status()).toBe(404);
  await page.goto(`${PROVA}/levar/`);
  const tipo = await page.evaluate(async () => {
    const r = await fetch('/widget/embed.js');
    return r.headers.get('content-type');
  });
  expect(tipo).toMatch(/javascript/);
});
