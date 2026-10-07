/**
 * O tema à escolha (`lib/tema.ts`), no navegador.
 *
 * O `tema.test.mts` prova sem navegador que as cores do escuro escolhido são
 * as do escuro do aparelho. Isto prova o resto, que só um navegador vê: que a
 * escolha ganha ao aparelho nos dois sentidos — e com as cores TODAS do tema
 * escolhido, as da página e as da região —, que fica para a página seguinte
 * sem a página piscar, que «Como o aparelho» a apaga mesmo, que um separador
 * segue o outro, e que o mapa muda de tinta com a escolha e não só com o
 * aparelho.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRODUTO, PROVA, PROVA_MUNICIPIO } from './anfitrioes';
import { temMosaicos, SEM } from './dados-da-regiao';

const CHAVE = 'paragem-tema';
const CLARO = 'rgb(245, 247, 244)'; // o --fundo do claro, #f5f7f4
const ESCURO = 'rgb(15, 26, 32)'; // o --fundo do escuro, #0f1a20

const guardado = (page: Page) => page.evaluate((k) => localStorage.getItem(k), CHAVE);
const interruptor = (page: Page) =>
  page.getByRole('banner').getByRole('button', { name: 'Tema escuro' });
const escolhas = (page: Page) => page.getByRole('contentinfo').getByRole('group', { name: 'Tema' });

test('no produto, o interruptor ganha ao aparelho claro, e a escolha fica para a página seguinte', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`${PRODUTO}/`);
  await expect(page.locator('body')).toHaveCSS('background-color', CLARO);
  await expect(interruptor(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await guardado(page), 'sem escolha, nada guardado').toBeNull();

  await interruptor(page).click();
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(interruptor(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await guardado(page)).toBe('escuro');

  // SEM PISCAR: a página seguinte já nasce escura, e não por obra do React.
  // Sem os guiões do Next, só o pequeno do `<body>` corre — e chega.
  await page.route('**/_next/static/**/*.js', (r) => r.abort());
  await page.goto(`${PRODUTO}/contacto/`);
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await page.unroute('**/_next/static/**/*.js');

  // O painel é a mesma origem: a mesma escolha.
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(interruptor(page)).toHaveAttribute('aria-pressed', 'true');
  await interruptor(page).click();
  await expect(page.locator('body')).toHaveCSS('background-color', CLARO);
  expect(await guardado(page), 'desligar o interruptor é escolher o claro').toBe('claro');
});

test('numa região, «Claro» ganha ao aparelho escuro, e «Como o aparelho» apaga a escolha', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${PROVA}/rede/`);
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(escolhas(page).getByRole('radio', { name: 'Como o aparelho' })).toBeChecked();

  await escolhas(page).getByRole('radio', { name: 'Claro' }).check();
  await expect(page.locator('body')).toHaveCSS('background-color', CLARO);
  await expect(interruptor(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await guardado(page)).toBe('claro');

  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', CLARO);
  await expect(escolhas(page).getByRole('radio', { name: 'Claro' })).toBeChecked();

  await escolhas(page).getByRole('radio', { name: 'Como o aparelho' }).check();
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(page.locator('html')).not.toHaveAttribute('data-tema');
  expect(await guardado(page), '«Como o aparelho» apaga a escolha').toBeNull();
});

test('a escolha num separador passa aos outros do mesmo sítio', async ({ context }) => {
  const [a, b] = [await context.newPage(), await context.newPage()];
  for (const p of [a, b]) await p.emulateMedia({ colorScheme: 'light' });
  await a.goto(`${PROVA}/rede/`);
  await b.goto(`${PROVA}/rede/linhas/`);
  await expect(interruptor(b)).toHaveAttribute('aria-pressed', 'false');

  await interruptor(a).click();
  await expect(b.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(interruptor(b)).toHaveAttribute('aria-pressed', 'true');

  await escolhas(a).getByRole('radio', { name: 'Como o aparelho' }).check();
  await expect(b.locator('body')).toHaveCSS('background-color', CLARO);
  await expect(escolhas(b).getByRole('radio', { name: 'Como o aparelho' })).toBeChecked();
});

test('a escolha sobrevive a uma hidratação falhada, que redesenha a página toda', async ({
  page,
}) => {
  // Quando a hidratação falha fora de um `Suspense`, o React redesenha a
  // página no navegador e tira do `<html>` o `data-tema` (`lib/tema.ts`). Há
  // uma página que falha assim de vez em quando, sozinha; aqui provoca-se de
  // propósito, para não depender da sorte: a ligação de salto troca de
  // elemento antes de o React chegar.
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(String(e)));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript((k) => {
    try {
      localStorage.setItem(k, 'escuro');
    } catch {}
    new MutationObserver((_, vigia) => {
      const salto = document.querySelector('a.saltar');
      if (!salto) return;
      const outro = document.createElement('span');
      outro.textContent = salto.textContent;
      salto.replaceWith(outro);
      vigia.disconnect();
    }).observe(document, { childList: true, subtree: true });
  }, CHAVE);
  await page.goto(`${PROVA}/rede/`);
  await expect.poll(() => erros.some((e) => e.includes('418')), 'a hidratação falhou').toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);
  await expect(interruptor(page)).toHaveAttribute('aria-pressed', 'true');
});

test('o mapa muda de tinta com a escolha do menu, e não só com o aparelho', async ({ page }) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  type ComMapa = {
    __mapa?: { loaded(): boolean; getPaintProperty(c: string, p: string): unknown };
  };
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as ComMapa).__mapa?.loaded());
  const fundo = () =>
    page.evaluate(() =>
      (window as unknown as ComMapa).__mapa!.getPaintProperty('fundo', 'background-color'),
    );
  expect(await fundo()).toBe('#e6ebe3');

  // Aqui não há cabeçalho nem rodapé: a escolha está no menu.
  await page.getByRole('button', { name: 'Abrir o menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await menu.getByRole('radio', { name: 'Escuro' }).check();
  await expect.poll(fundo).toBe('#1b262c');
  await expect(page.locator('body')).toHaveCSS('background-color', ESCURO);

  // E com a página aberta numa escolha, o aparelho a mudar não a desfaz.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await fundo()).toBe('#1b262c');
});

/**
 * As cores que a página está a usar: o valor de TODAS as variáveis que o CSS
 * declara, lidas onde está o conteúdo — que é onde as da região já se
 * aplicaram —, e o `color-scheme`, que decide a cor dos controlos do
 * navegador.
 */
async function cores(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const nomes = new Set<string>();
    const percorrer = (regras: CSSRuleList) => {
      for (const r of Array.from(regras)) {
        if (r instanceof CSSStyleRule) {
          for (let i = 0; i < r.style.length; i++) {
            if (r.style[i].startsWith('--')) nomes.add(r.style[i]);
          }
        }
        if ('cssRules' in r) percorrer((r as CSSGroupingRule).cssRules);
      }
    };
    for (const folha of Array.from(document.styleSheets)) {
      try {
        percorrer(folha.cssRules);
      } catch {
        // uma folha de outra origem não se lê, e não é nossa
      }
    }
    const onde = getComputedStyle(document.querySelector('main') ?? document.body);
    const valores: Record<string, string> = {};
    for (const n of [...nomes].sort()) valores[n] = onde.getPropertyValue(n).trim();
    valores['color-scheme'] = getComputedStyle(document.documentElement).colorScheme;
    return valores;
  });
}

async function abrir(browser: Browser, aparelho: 'light' | 'dark', escolha?: string) {
  const contexto = await browser.newContext({ colorScheme: aparelho });
  if (escolha) {
    // A escolha já feita antes de a página abrir, em todas as origens — a do
    // produto e a de cada região guardam cada uma a sua.
    await contexto.addInitScript(
      ([k, v]) => {
        try {
          localStorage.setItem(k, v);
        } catch {}
      },
      [CHAVE, escolha],
    );
  }
  return contexto;
}

// O escolhido é EXATAMENTE o do aparelho: cada variável, no produto, numa
// região de cada tipo (as cores da região mudam no bloco dela) e no painel. E
// sem violações do axe, nos dois sentidos.
const PAGINAS = [
  `${PRODUTO}/`,
  `${PRODUTO}/admin/entrar/`,
  `${PROVA}/rede/`,
  `${PROVA_MUNICIPIO}/`,
  `/rede/paragens/`,
];
for (const [escolha, doAparelho, ao] of [
  ['escuro', 'dark', 'light'],
  ['claro', 'light', 'dark'],
] as const) {
  test(`o ${escolha} escolhido num aparelho ao contrário tem as cores do ${escolha} do aparelho, e passa o axe`, async ({
    browser,
    baseURL,
  }) => {
    const referencia = await (await abrir(browser, doAparelho)).newPage();
    const escolhido = await (await abrir(browser, ao, escolha)).newPage();
    for (const caminho of PAGINAS) {
      const endereco = new URL(caminho, baseURL).toString();
      await referencia.goto(endereco);
      await escolhido.goto(endereco);
      await expect(escolhido.locator('html'), caminho).toHaveAttribute('data-tema', escolha);
      expect(await cores(escolhido), `${escolha}: ${caminho}`).toEqual(await cores(referencia));

      const r = await new AxeBuilder({ page: escolhido })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const resumo = r.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes[0]?.html?.slice(0, 160)}`,
      );
      expect(resumo, `${escolha} ${caminho}\n  ${resumo.join('\n  ')}`).toEqual([]);
    }
    await referencia.context().close();
    await escolhido.context().close();
  });
}
