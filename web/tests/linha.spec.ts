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
  // O percurso de um sentido: pode vir partido em três listas, com o meio
  // fechado (#95), e as pontas continuam a ser uma de cada.
  const sentido = page.locator('main section[aria-labelledby^="sentido-"]').first();
  const percurso = sentido.locator('ol.percurso-da-linha');
  const paragens = percurso.locator('li a');
  expect(await paragens.count()).toBeGreaterThan(1);
  await expect(percurso.locator('li.primeira')).toHaveCount(1);
  await expect(percurso.locator('li.ultima')).toHaveCount(1);
  const href = await paragens.first().getAttribute('href');
  expect(href).toMatch(/\/rede\/paragens\//);
});

test('um percurso comprido mostra as pontas, e o meio abre-se num botão', async ({ page }) => {
  // O horário acabava aos 1 180 px e o percurso descia mais 2 500 (#95).
  await page.goto(`/rede/linhas/${LINHA.id}/`);
  const meio = page.locator('details.meio-do-percurso').first();
  test.skip((await meio.count()) === 0, 'o percurso da linha com mais viagens cabe inteiro');
  await expect(meio).not.toHaveAttribute('open', '');
  await meio.locator('summary').click();
  await expect(meio.locator('ol.percurso-da-linha li a').first()).toBeVisible();
});

test('o esquema desenha um sentido de cada vez, sem o traço por cima dos nomes', async ({
  page,
}) => {
  // Os dois sentidos sobrepostos pareciam um rabisco (#13).
  await page.goto(`/rede/linhas/${LINHA.id}/`);
  const esquemas = page.locator('figure.esquema-da-linha');
  test.skip((await esquemas.count()) === 0, 'a linha não tem paragens com sítio');
  for (const f of await esquemas.all()) {
    await expect(f.locator('polyline')).toHaveCount(1);
    // Os nomes das pontas não se cruzam com o traço: nenhum ponto do traço
    // cai dentro da caixa de um nome.
    const cruzam = await f.evaluate((fig) => {
      const svg = fig.querySelector('svg')!;
      const linha = svg.querySelector('polyline')!;
      const pontos = Array.from({ length: linha.points.numberOfItems }, (_, i) =>
        linha.points.getItem(i),
      );
      return Array.from(svg.querySelectorAll('text')).filter((t) => {
        const c = (t as SVGTextElement).getBBox();
        return pontos.some(
          (p) =>
            p.x > c.x + 1 && p.x < c.x + c.width - 1 && p.y > c.y + 1 && p.y < c.y + c.height - 1,
        );
      }).length;
    });
    expect(cruzam, 'um nome com uma paragem por baixo').toBe(0);
  }
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

test('a lista separa a rede das linhas de outros operadores, e diz de quem são', async ({
  page,
}) => {
  // Oito com o mesmo nome, de um terminal a outro, sem cor nem operador, no meio
  // das da rede, e o mesmo número duas vezes (auditoria de 1/11/2026, #97).
  const deFora = linhas().filter((l) => l.operador);
  test.skip(!deFora.length, 'todas as linhas desta região são da rede');
  await page.goto('/rede/linhas/');
  const outras = page.getByRole('region', { name: /^Outras linhas que entram na região/ });
  await expect(outras.locator('ul.lista > li')).toHaveCount(deFora.length);
  await expect(outras.locator('ul.lista > li').first()).toContainText(' · ');
  await expect(page.locator('main > p').first()).toContainText('de outros operadores');
});
