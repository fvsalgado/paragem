/**
 * As caixas para os sítios das câmaras (P4-007): a página que dá o código, e
 * as caixas — sem o invólucro da região, acessíveis, e sem cookies.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PROVA } from './anfitrioes';

/** O contraste entre o texto e o fundo de um elemento, como o navegador os pinta. */
async function contraste(l: import('@playwright/test').Locator): Promise<number> {
  return l.evaluate((e) => {
    const s = getComputedStyle(e);
    const lum = (cor: string) => {
      const [r, g, b] = (cor.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => Number(x) / 255);
      const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

test('a página «Para o seu sítio» abre com a caixa montada e dá a linha para colar', async ({
  page,
}) => {
  await page.goto(`${PROVA}/levar/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Os transportes no seu sítio');

  // ABRE JÁ COM UMA PARAGEM, a que os dados escolhem — a que mais linhas junta
  // e, entre essas, a de mais partidas: na prova, a do Mercado. Abria vazia,
  // com a pré-visualização a pedir uma paragem e os botões desligados.
  const codigo = page.locator('pre.codigo-para-copiar code').first();
  await expect(codigo).toContainText('/widget/embed.js');
  await expect(codigo).toContainText('data-paragem="pa_mercado"');
  const caixa = page.frameLocator('iframe.previa-da-caixa');
  await expect(caixa.getByRole('heading', { level: 1 })).toContainText('Mercado');
  const copiar = page.getByRole('button', { name: 'Copiar o código' });
  await expect(copiar).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Copiar o iframe' })).toBeEnabled();

  // Quem quiser outra, muda.
  await page.getByRole('combobox', { name: 'Paragem' }).fill('term');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByLabel('Quantas partidas').selectOption('3');
  await expect(codigo).toContainText('data-paragem="pa_terminal"');
  await expect(codigo).toContainText('data-quantas="3"');
  // A pré-visualização é a caixa verdadeira.
  await expect(caixa.getByRole('heading', { level: 1 })).toContainText('Terminal');

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  // SEM PARAGEM, os botões desligam-se — legíveis, e a dizer porquê. O axe
  // não mede o contraste de um controlo desligado, e foi assim que um
  // secundário desligado chegou a 1,1:1: mede-se aqui.
  await page.getByRole('button', { name: /^Tirar / }).click();
  await expect(copiar).toBeDisabled();
  await expect(copiar).toHaveAccessibleDescription(/Escolha primeiro a paragem/);
  await expect(page.getByText('Escolha primeiro a paragem, lá em cima.').first()).toBeVisible();
  expect(await contraste(copiar)).toBeGreaterThanOrEqual(4.5);
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

test('«Para onde quer ir?» é um formulário que abre o planeador da região', async ({ page }) => {
  await page.goto(`${PROVA}/widget/viagem/`);
  const formulario = page.locator('form.caixa-da-viagem');
  await expect(formulario).toHaveAttribute('action', '/viagem/');
  await expect(formulario).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('textbox', { name: 'Para onde quer ir?' })).toBeVisible();
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
