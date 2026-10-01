/**
 * AS PÁGINAS DO PRODUTO — o que um decisor vê quando lhe mandam o endereço.
 *
 * Era uma página só, que parecia um README: sem contacto, sem uma ligação para
 * o código, com o nome do produto em texto corrido e o título colado ao
 * cabeçalho; e `/contacto/`, `/privacidade/` e `/acessibilidade/` davam 404
 * — numa página que vende acessibilidade. Cada teste aqui é uma dessas faltas
 * que não pode voltar.
 */
import { test, expect } from '@playwright/test';
import { PRODUTO } from './anfitrioes';

const PAGINAS: [string, string][] = [
  ['/contacto/', 'Falar connosco'],
  ['/privacidade/', 'Privacidade'],
  ['/acessibilidade/', 'Declaração de acessibilidade'],
];

test('as páginas do produto existem, com a casa do produto à volta', async ({ page }) => {
  for (const [caminho, titulo] of PAGINAS) {
    const r = await page.goto(`${PRODUTO}${caminho}`);
    expect(r?.status(), caminho).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    // «Falar connosco» à vista em todas, também no telemóvel.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Falar connosco' }),
    ).toBeVisible();
    // E o rodapé diz onde está o código e para onde se escreve.
    const rodape = page.getByRole('contentinfo');
    await expect(rodape.getByRole('link', { name: 'O código' })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\//,
    );
    await expect(rodape.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
  }
});

test('o contacto escreve o endereço por extenso, e os botões levam o assunto', async ({ page }) => {
  await page.goto(`${PRODUTO}/contacto/`);
  // Por extenso, e não só ligado: um `mailto:` sem programa de correio não
  // abre nada, e quem carrega fica sem saber para onde escrever.
  const endereco = (await page.locator('.correio-por-extenso').innerText()).trim();
  expect(endereco).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  for (const [nome, assunto] of [
    ['Marcar uma demonstração', 'Marcar uma demonstração do Paragem.pt'],
    ['Pedir proposta', 'Pedido de proposta do Paragem.pt'],
  ]) {
    await expect(page.getByRole('main').getByRole('link', { name: nome })).toHaveAttribute(
      'href',
      `mailto:${endereco}?subject=${encodeURIComponent(assunto)}`,
    );
  }
});

test('a declaração de acessibilidade do produto tem contacto, e nada «por preencher»', async ({
  page,
}) => {
  // A de cada região é da autoridade de transportes, e o contacto dela ainda
  // está por indicar. A do produto é do produto — e o contacto dele existe.
  await page.goto(`${PRODUTO}/acessibilidade/`);
  const principal = page.getByRole('main');
  await expect(principal).toContainText('WCAG 2.1');
  await expect(principal.getByRole('link', { name: /@/ })).toHaveAttribute('href', /^mailto:/);
  await expect(principal).not.toContainText(/por preencher/i);
});

test('a marca do produto parece a marca, e o título não se cola ao cabeçalho', async ({ page }) => {
  for (const caminho of ['/', '/contacto/']) {
    await page.goto(`${PRODUTO}${caminho}`);
    const marca = page.getByRole('banner').getByRole('link', { name: /Paragem/ });
    await expect(marca).toHaveCSS('font-weight', '700');
    await expect(marca).toHaveCSS('color', 'rgb(10, 92, 122)');
    const ar = await page.evaluate(() => {
      const fim = document.querySelector('header')!.getBoundingClientRect().bottom;
      return document.querySelector('h1')!.getBoundingClientRect().top - fim;
    });
    expect(ar, `${caminho}: o título está a ${ar} px do cabeçalho`).toBeGreaterThanOrEqual(24);
  }
});
