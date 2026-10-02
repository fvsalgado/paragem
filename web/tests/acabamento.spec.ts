/**
 * O ACABAMENTO: o que a auditoria visual mediu e que um teste de violações não
 * vê (P1-014, P1-015, P1-022, P1-029, P1-046).
 *
 * Nenhum destes é uma violação WCAG; todos são o sítio a parecer mal feito a
 * quem decide se o contrata. Medem-se pelo que o navegador calcula, e não
 * pelo que o CSS diz, que é o que já os tinha deixado passar uma vez.
 */
import { test, expect } from '@playwright/test';
import { linhaComMaisViagens, paragemComMaisPartidas } from './dados-da-regiao';

test('o texto secundário é secundário: mais pequeno, e na cor do §6', async ({ page }) => {
  // A classe aparecia setenta vezes e não tinha regra fora das listas: as
  // notas do tarifário saíam iguais ao preço ao lado (P1-029).
  await page.goto('/rede/tarifario/');
  const nota = page.locator('main p.secundario, main span.secundario').first();
  await expect(nota).toHaveCSS('color', 'rgb(74, 92, 102)');
  const [daNota, doTexto] = await Promise.all([
    nota.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    page
      .locator('main p')
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ]);
  expect(daNota).toBeLessThan(doTexto);
});

test('o título não se cola ao cabeçalho', async ({ page }) => {
  // Media 0 px entre a faixa e a caixa do título (P1-015).
  for (const caminho of [
    '/rede/',
    '/rede/tarifario/',
    `/rede/linhas/${linhaComMaisViagens().id}/`,
  ]) {
    await page.goto(caminho);
    const ar = await page.evaluate(() => {
      const fim = document.querySelector('header.cabecalho')!.getBoundingClientRect().bottom;
      const primeiro = document.querySelector('main#conteudo > *')!.getBoundingClientRect().top;
      return primeiro - fim;
    });
    expect(ar, `${caminho}: o conteúdo começa a ${ar} px do cabeçalho`).toBeGreaterThanOrEqual(20);
  }
});

test('a ligação no meio de uma frase do rodapé não estica a linha', async ({ page }) => {
  // Os 44 px eram de todas as ligações do rodapé, e a do «OpenStreetMap», no
  // meio da atribuição, fazia uma linha mais alta do que as outras (P1-022).
  await page.goto('/rede/');
  const naFrase = page.locator('footer p a');
  for (const a of await naFrase.all()) await expect(a).toHaveCSS('display', 'inline');
  for (const a of await page.locator('footer nav a').all()) {
    expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('os dados abertos escrevem as datas como o resto do sítio, e o código em pequeno', async ({
  page,
}) => {
  await page.goto('/dados-abertos/');
  const principal = page.getByRole('main');
  await expect(principal).not.toContainText(/\b\d{4}-\d{2}-\d{2}\b/);
  const codigo = principal.locator('code').first();
  if (await codigo.count()) {
    const [doCodigo, doTexto] = await Promise.all([
      codigo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      codigo.evaluate((e) => parseFloat(getComputedStyle(e.parentElement!).fontSize)),
    ]);
    expect(doCodigo).toBeLessThan(doTexto);
  }
});

test('num ecrã largo, o «A seguir» fica ao lado do horário, e não por cima dele', async ({
  page,
}) => {
  // Uma coluna de 608 px num ecrã de 1440, com 400 px vazios de cada lado
  // (P1-014). No telemóvel continuam um a seguir ao outro.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/rede/paragens/${paragemComMaisPartidas().id}/`);
  const seguir = (await page.locator('section.a-seguir').boundingBox())!;
  const horario = (await page.locator('section[aria-labelledby="horario"]').boundingBox())!;
  expect(seguir.x, 'o «A seguir» à direita do horário').toBeGreaterThanOrEqual(
    horario.x + horario.width,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const seguirNoTelemovel = (await page.locator('section.a-seguir').boundingBox())!;
  const horarioNoTelemovel = (await page
    .locator('section[aria-labelledby="horario"]')
    .boundingBox())!;
  expect(horarioNoTelemovel.y).toBeGreaterThan(seguirNoTelemovel.y);
});
