/**
 * Um aviso, do painel até onde o utente olha — COM A BASE (P4-017, P4-018,
 * P4-019, P2-025).
 *
 * Escreve-se na região de prova como uma autoridade o faria: a linha pelo
 * número que está no autocarro, e não pelo identificador do GTFS; uma recusa
 * que não apaga o que se escreveu; a pré-visualização com o aspeto público; a
 * página da linha e a da paragem a mostrá-lo; e apagar a pedir confirmação.
 *
 * Como `painel-contas.spec.ts`: precisa da base do painel, e sem ela salta e
 * diz porquê. Deixa a região como a encontrou — o aviso apaga-se no fim.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRODUTO, PROVA } from './anfitrioes';

const SENHA = process.env.PARAGEM_SENHA_DE_TESTE;
const AVISOS = `${PRODUTO}/admin/regioes/prova/avisos/`;

async function entrarComoDono(page: Page): Promise<string | null> {
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await page.getByLabel('Email').fill('dono@exemplo.pt');
  await page.getByLabel('Palavra-passe').fill(SENHA as string);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/admin/entrar'));
  await page.goto(AVISOS);
  if (await page.getByText('Falta SUPABASE_SERVICE_ROLE_KEY').count()) {
    return 'sem base do painel: no CI, a base prova-se no trabalho Migrações';
  }
  return null;
}

/** A página pública, até mostrar (ou deixar de mostrar) o que se espera. */
async function ate(page: Page, endereco: string, titulo: string, presente: boolean) {
  await expect(async () => {
    await page.goto(endereco);
    await expect(page.getByRole('heading', { name: titulo })).toHaveCount(presente ? 1 : 0);
  }).toPass({ timeout: 20_000 });
}

test('um aviso escreve-se pelo número da linha, e aparece onde o utente olha', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  const razao = await entrarComoDono(page);
  test.skip(razao !== null, razao ?? '');

  const titulo = `Linha 1 desviada no Mercado ${Date.now() % 100000}`;
  const texto = 'Por obras, a linha 1 não para no Mercado. Apanhe-a no Centro de Saúde.';

  // A LINHA ESCOLHE-SE PELO NÚMERO QUE O PÚBLICO VÊ — «1», e não «RA1».
  await page.getByLabel('Desvio').check();
  await page.getByLabel('Título').fill(titulo);
  await page.locator('#aviso-texto').fill(texto);
  await page.getByRole('combobox', { name: 'Linhas afetadas' }).fill('1');
  await expect(page.getByRole('option').first()).toContainText('Pedra Alta');
  await page.keyboard.press('Enter');
  const escolhidas = page.getByRole('list', { name: 'Linhas afetadas: escolhidas' });
  await expect(escolhidas).toContainText('Pedra Alta');
  await expect(page.getByRole('button', { name: 'Tirar a linha 1' })).toBeVisible();

  // A PRÉ-VISUALIZAÇÃO É O CARTÃO PÚBLICO: o efeito em cima, o número da
  // linha, e nada de «causa não declarada».
  const previa = page.locator('.pre-visualizacao');
  await expect(previa.locator('.etiqueta-do-aviso')).toHaveText('Desvio');
  await expect(previa.getByRole('heading', { name: titulo })).toBeVisible();
  await expect(previa.locator('.distintivo')).toHaveText('1');
  await expect(previa).not.toContainText('não declarada');
  await expect(previa).toContainText('na página da linha 1');
  // E O EDITOR INTEIRO PASSA NO AXE, com a lista de sugestões e a pré-visualização à vista.
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);

  // UMA RECUSA NÃO APAGA NADA: o endereço errado volta com tudo o resto lá,
  // e o foco vai para o campo que tem de mudar.
  await page.getByLabel('Mais informação (opcional)').fill('isto não é um endereço');
  await page.getByRole('button', { name: 'Guardar rascunho' }).click();
  await expect(page.locator('#erro-em-url')).toContainText('tem de ser completo');
  await expect(page.getByLabel('Mais informação (opcional)')).toBeFocused();
  await expect(page.getByLabel('Título')).toHaveValue(titulo);
  await expect(page.locator('#aviso-texto')).toHaveValue(texto);
  await expect(escolhidas).toContainText('Pedra Alta');

  // CORRIGIDO, PUBLICA-SE.
  await page.getByLabel('Mais informação (opcional)').fill('');
  await page.getByRole('button', { name: 'Publicar agora' }).click();
  await page.waitForURL(/aviso=/);
  const item = page.locator('.lista-de-avisos > li', { hasText: titulo });
  await expect(item.locator('[data-mensagem]')).toContainText('Aviso publicado');
  await expect(item.locator('.estado-do-aviso')).toContainText('Publicado · no ar');

  // ONDE O UTENTE OLHA: a página da linha e a de uma paragem dela.
  const publico = await (await browser.newContext()).newPage();
  await ate(publico, `${PROVA}/rede/linhas/RA1/`, titulo, true);
  await expect(publico.locator('.avisos-da-pagina')).toContainText('Avisos nesta linha');
  await ate(publico, `${PROVA}/rede/paragens/pa_mercado/`, titulo, true);
  await expect(publico.locator('.avisos-da-pagina .distintivo').first()).toHaveText('1');
  const axePublico = await new AxeBuilder({ page: publico })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(axePublico.violations).toEqual([]);

  // APAGAR CONFIRMA: o botão só existe depois de se abrir «Apagar…».
  await expect(item.getByRole('button', { name: 'Apagar este aviso' })).toBeHidden();
  await item.locator('summary', { hasText: 'Apagar' }).click();
  await item.getByRole('button', { name: 'Apagar este aviso' }).click();
  await expect(page.locator('[data-mensagem]').first()).toContainText('Aviso apagado');
  await expect(page.locator('.lista-de-avisos > li', { hasText: titulo })).toHaveCount(0);
  await ate(publico, `${PROVA}/rede/linhas/RA1/`, titulo, false);
});
