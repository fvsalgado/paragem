/**
 * Os contactos da declaração de acessibilidade e da privacidade, COM A BASE
 * (P4-024): escrevem-se na ficha, uma recusa devolve o que se escreveu, e as
 * duas páginas públicas passam a dizê-los — com o artigo que a região declara
 * para a autoridade.
 *
 * Mexe na Serra da Pedra Alta, e não no Baixo Sável: a ficha deste desliga-o
 * por instantes (`painel-ficha.spec.ts`), e as duas correm ao mesmo tempo.
 * Deixa os contactos como os encontrou — em branco.
 */
import { test, expect, type Page } from '@playwright/test';
import { PRODUTO, PROVA } from './anfitrioes';

const SENHA = process.env.PARAGEM_SENHA_DE_TESTE;
const FICHA = `${PRODUTO}/admin/regioes/prova/`;

async function entrarComoDono(page: Page): Promise<string | null> {
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await page.getByLabel('Email').fill('dono@exemplo.pt');
  await page.getByLabel('Palavra-passe').fill(SENHA as string);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/admin/entrar'));
  await page.goto(FICHA);
  if (await page.getByText('Falta SUPABASE_SERVICE_ROLE_KEY').count()) {
    return 'sem base do painel: no CI, a base prova-se no trabalho Migrações';
  }
  if (await page.getByText('ainda não guarda estes contactos').count()) {
    return 'a base não tem a migração 0010';
  }
  return null;
}

test('os contactos escrevem-se na ficha e aparecem na declaração e na privacidade', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  const razao = await entrarComoDono(page);
  test.skip(razao !== null, razao ?? '');

  const secao = page.locator('#contactos');
  const email = secao.getByLabel('Email para problemas de acessibilidade');
  const telefone = secao.getByLabel('Telefone (opcional)');
  const guardar = secao.getByRole('button', { name: 'Guardar os contactos' });

  // UMA RECUSA DEVOLVE O QUE SE ESCREVEU, e a mensagem fica na secção.
  await email.fill('acessibilidade@exemplo');
  await telefone.fill('800 000 000');
  await guardar.click();
  await expect(secao.locator('[role="status"]')).toContainText('não se lê como um email');
  await expect(telefone).toHaveValue('800 000 000');
  await expect(email).toHaveValue('acessibilidade@exemplo');

  // CORRIGIDO, GUARDA-SE — com a autoridade a responder pelos dados.
  await email.fill('acessibilidade@exemplo.pt');
  await secao.getByLabel('A Comunidade Intermunicipal da Serra da Pedra Alta').check();
  await secao.getByLabel('Email para questões de privacidade (opcional)').fill('dados@exemplo.pt');
  await guardar.click();
  await expect(secao.locator('[role="status"]')).toContainText('Contactos guardados');

  const publico = await (await browser.newContext()).newPage();
  await expect(async () => {
    await publico.goto(`${PROVA}/acessibilidade/`);
    await expect(publico.locator('main')).toContainText('acessibilidade@exemplo.pt');
  }).toPass({ timeout: 20_000 });
  await expect(publico.locator('main')).toContainText('liga para 800 000 000');
  await publico.goto(`${PROVA}/privacidade/`);
  await expect(publico.locator('main')).toContainText(
    'O responsável pelo tratamento é a Comunidade Intermunicipal da Serra da Pedra Alta.',
  );
  await expect(publico.locator('main')).toContainText('dados@exemplo.pt');

  // E VOLTA AO QUE ESTAVA: em branco, e a declaração diz «Por preencher».
  await page.goto(FICHA);
  await email.fill('');
  await telefone.fill('');
  await secao.getByLabel('Email para questões de privacidade (opcional)').fill('');
  await secao.getByLabel('Ainda não se sabe').check();
  await guardar.click();
  await expect(secao.locator('[role="status"]')).toContainText('Contactos guardados');
  await expect(async () => {
    await publico.goto(`${PROVA}/acessibilidade/`);
    await expect(publico.locator('main')).toContainText('Por preencher');
  }).toPass({ timeout: 20_000 });
});
