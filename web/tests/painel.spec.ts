/**
 * O painel, de fora: as barreiras, a entrada, e o que se vê sem base.
 *
 * Corre contra o sítio construído, como tudo o resto. A palavra-passe de
 * teste vem do ambiente (`PARAGEM_SENHA_DE_TESTE`, com o
 * `ADMIN_PASSWORD_HASH` correspondente no servidor): no CI gera-se uma por
 * corrida; sem ela, os testes que entram saltam e dizem porquê. Os que não
 * precisam de entrar correm sempre — e são os que provam que a porta está
 * fechada.
 *
 * Não há base nos testes, e é de propósito: o que se prova aqui é o código
 * do painel — as barreiras, a sessão, os formulários, a acessibilidade —, e
 * não a base, que tem os seus testes no CI (`Migrações`).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRODUTO, PROVA } from './anfitrioes';

const SENHA = process.env.PARAGEM_SENHA_DE_TESTE;

/**
 * O título espera-se ANTES do axe: numa navegação depois de uma ação, o Next
 * envia os metadados a seguir ao conteúdo, e há um instante em que o `<h1>`
 * novo já está e o `<title>` ainda não — o axe apanhava esse instante.
 */
async function semViolacoes(page: Page, titulo: RegExp): Promise<void> {
  await expect(page).toHaveTitle(titulo);
  const resultados = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(resultados.violations).toEqual([]);
}

/**
 * O dono entra com a palavra-passe do ambiente e QUALQUER email — no CI não
 * há `ADMIN_EMAIL`, e é assim que ele entrava antes das contas (0009).
 */
async function entrar(page: Page, senha: string, origem = PRODUTO): Promise<void> {
  await page.goto(`${origem}/admin/entrar/`);
  await page.getByLabel('Email').fill('dono@exemplo.pt');
  await page.getByLabel('Palavra-passe').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('sem sessão, o painel manda para a entrada — na montra e numa região', async ({ page }) => {
  for (const origem of [PRODUTO, PROVA]) {
    const resposta = await page.goto(`${origem}/admin/`);
    expect(resposta?.url()).toBe(`${origem}/admin/entrar/`);
    // E leva o destino consigo quando havia um.
    await page.goto(`${origem}/admin/auditoria/`);
    expect(page.url()).toBe(`${origem}/admin/entrar/?destino=%2Fadmin%2Fauditoria%2F`);
  }
});

test('o painel não se indexa nem se guarda em cache de ninguém', async ({ request }) => {
  const resposta = await request.get(`${PRODUTO}/admin/entrar/`);
  expect(resposta.headers()['x-robots-tag']).toContain('noindex');
  expect(resposta.headers()['cache-control']).toContain('no-store');
});

test('a entrada é acessível, com e sem configuração', async ({ page }) => {
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Entrar no painel|Painel por configurar/,
  );
  await semViolacoes(page, /Entrar · Painel · Paragem\.pt/);
});

test('uma palavra-passe errada não entra, e diz-o', async ({ page }) => {
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  await entrar(page, `${SENHA}-errada`);
  await expect(page).toHaveURL(`${PRODUTO}/admin/entrar/?erro=credenciais&email=dono%40exemplo.pt`);
  // O anunciador de rotas do Next também é um `role="alert"`; o nosso é o parágrafo.
  // A frase não diz se o email existe: é a mesma para os dois casos.
  await expect(page.locator('p[role="alert"]')).toHaveText('Email ou palavra-passe incorretos.');
  // E o email que se escreveu fica na caixa, para corrigir só a palavra-passe.
  await expect(page.getByLabel('Email')).toHaveValue('dono@exemplo.pt');
  await semViolacoes(page, /Entrar · Painel/);
});

test('com a palavra-passe certa entra-se, vê-se o painel sem base, e sai-se', async ({ page }) => {
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  await entrar(page, SENHA as string);
  await expect(page).toHaveURL(`${PRODUTO}/admin/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Regiões');
  // Sem chave de serviço o painel não lê nada — e diz isso, em vez de uma
  // lista vazia a fingir que não há regiões.
  await expect(page.getByText('Falta SUPABASE_SERVICE_ROLE_KEY')).toBeVisible();
  await semViolacoes(page, /Regiões · Painel · Paragem\.pt/);

  // A barra leva às outras páginas, e todas ficam de pé sem base.
  await page.getByRole('link', { name: 'Auditoria' }).click();
  await expect(page).toHaveURL(`${PRODUTO}/admin/auditoria/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Auditoria');
  await semViolacoes(page, /Auditoria · Painel · Paragem\.pt/);

  await page.goto(`${PRODUTO}/admin/regioes/nova/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nova região');
  await semViolacoes(page, /Nova região · Painel · Paragem\.pt/);

  // As pessoas são do dono, e a página também fica de pé sem base.
  await page.getByRole('link', { name: 'Pessoas' }).click();
  await expect(page).toHaveURL(`${PRODUTO}/admin/pessoas/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pessoas');
  await semViolacoes(page, /Pessoas · Painel · Paragem\.pt/);
  // Quem entrou diz-se no cabeçalho.
  await expect(page.locator('.painel-cabecalho .quem')).toHaveText('Entraste como dono');

  // Já com sessão, a entrada manda para o painel.
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await expect(page).toHaveURL(`${PRODUTO}/admin/`);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(`${PRODUTO}/admin/entrar/`);
  // E a sessão foi-se mesmo: o painel volta a mandar para a entrada.
  await page.goto(`${PRODUTO}/admin/`);
  await expect(page).toHaveURL(`${PRODUTO}/admin/entrar/`);
});

test('entrar leva ao destino que se tinha pedido', async ({ page }) => {
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  await page.goto(`${PRODUTO}/admin/auditoria/`);
  await page.getByLabel('Email').fill('dono@exemplo.pt');
  await page.getByLabel('Palavra-passe').fill(SENHA as string);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(`${PRODUTO}/admin/auditoria/`);
});

test('a sessão é do anfitrião onde se entrou: uma região não herda a da montra', async ({
  page,
}) => {
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  await entrar(page, SENHA as string);
  await expect(page).toHaveURL(`${PRODUTO}/admin/`);
  await page.goto(`${PROVA}/admin/`);
  await expect(page).toHaveURL(`${PROVA}/admin/entrar/`);
});

test('a ligação de ativação abre-se sem sessão, e diz o que está mal com ela', async ({ page }) => {
  const resposta = await page.goto(`${PRODUTO}/admin/ativar/?t=${'x'.repeat(43)}`);
  // Não manda para a entrada: é uma das duas portas do painel.
  expect(resposta?.url()).toBe(`${PRODUTO}/admin/ativar/?t=${'x'.repeat(43)}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Escolher a palavra-passe');
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  // O token não sai daqui para lado nenhum.
  expect(resposta?.headers()['referrer-policy']).toBe('no-referrer');
  await semViolacoes(page, /Escolher a palavra-passe · Painel · Paragem\.pt/);
});
