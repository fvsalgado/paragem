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
import { DEMONSTRACOES, PRODUTO, anfitriao } from './anfitrioes';

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

test('a marca do produto é o feixe a cores, e o título não se cola ao cabeçalho', async ({
  page,
}) => {
  for (const caminho of ['/', '/contacto/']) {
    await page.goto(`${PRODUTO}${caminho}`);
    // O nome para quem ouve; o desenho para quem vê (§6): uma das duas
    // versões à vista, com o vermelho do produto por fora.
    const marca = page.getByRole('banner').getByRole('link', { name: 'Paragem.pt' });
    await expect(marca).toHaveAttribute('href', /\/$/);
    const feixe = marca.locator('svg.marca-do-produto:visible');
    await expect(feixe).toHaveCount(1);
    await expect(feixe.locator('.l0').first()).toHaveCSS('stroke', 'rgb(194, 40, 28)');
    await expect(feixe.locator('.ponto')).toHaveCSS('fill', 'rgb(194, 40, 28)');
    expect((await marca.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const ar = await page.evaluate(() => {
      const fim = document.querySelector('header')!.getBoundingClientRect().bottom;
      return document.querySelector('h1')!.getBoundingClientRect().top - fim;
    });
    expect(ar, `${caminho}: o título está a ${ar} px do cabeçalho`).toBeGreaterThanOrEqual(24);
  }
});

test('a montra vende: o produto a funcionar, para quem é, e com quem se fala', async ({ page }) => {
  await page.goto(`${PRODUTO}/`);
  const principal = page.getByRole('main');
  await expect(
    page.getByRole('heading', { level: 1, name: /Os transportes do seu território/ }),
  ).toBeVisible();
  await expect(principal).toContainText(
    'Para comunidades intermunicipais, áreas metropolitanas e câmaras',
  );

  // As duas chamadas no primeiro ecrã: marcar (por correio, com o assunto) e
  // experimentar (numa demonstração, que é do produto — nunca num cliente).
  const marcar = principal.getByRole('link', { name: 'Marcar uma demonstração' }).first();
  await expect(marcar).toBeInViewport();
  await expect(marcar).toHaveAttribute('href', /^mailto:[^?]+\?subject=Marcar%20uma%20demonstra/);
  const experimentar = principal.getByRole('link', { name: 'Experimentar a demonstração' });
  await expect(experimentar).toBeInViewport();
  const destino = await experimentar.getAttribute('href');
  expect(
    DEMONSTRACOES.map((id) => `${anfitriao(id)}/`),
    `«Experimentar» leva a ${destino}, que não é uma demonstração`,
  ).toContain(destino);

  // O telemóvel: uma captura que carrega, com o texto alternativo a dizer o
  // que mostra.
  const captura = page.getByRole('img', { name: /A página de uma paragem no telemóvel/ });
  await expect(captura).toBeVisible();
  expect(await captura.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(
    true,
  );

  // Os cartões de «Ver a funcionar» são demonstrações, e só demonstrações:
  // a página do produto não nomeia clientes.
  const cartoes = page.locator('#demonstracao .produto-regioes > li');
  expect(await cartoes.count()).toBeGreaterThan(0);
  await expect(cartoes.filter({ hasNotText: 'Demonstração.' })).toHaveCount(0);

  // As âncoras do cabeçalho levam a secções que existem.
  for (const ancora of ['demonstracao', 'para-quem', 'entrada']) {
    await expect(page.locator(`#${ancora}`), ancora).toHaveCount(1);
  }
  // E nada de preços inventados: pede-se uma proposta.
  await expect(principal.getByRole('link', { name: 'Pedir proposta' }).first()).toHaveAttribute(
    'href',
    /^mailto:/,
  );
  await expect(principal).not.toContainText('€');
});
