/**
 * As contas por pessoa (0009), COM A BASE: uma pessoa da região A não vê nem
 * escreve na região B — nem pelas páginas, nem chamando as ações do servidor
 * diretamente, com o formulário adulterado.
 *
 * Precisa de uma base do painel com as migrações todas, e do sítio levantado
 * contra ela (chave de serviço incluída). No CI não há base nos testes do
 * sítio — a base tem os seus no trabalho `Migrações` —, e este ficheiro salta
 * e diz porquê. Localmente, com a base de `docs/BASE-DE-DADOS.md`, corre
 * inteiro: é ele a prova de que a regra do lote se cumpre de ponta a ponta.
 *
 * As duas regiões são as que as migrações semeiam e que nenhum cliente tem:
 * A é a região de prova; B é a demonstração, que nasce com dois avisos de
 * exemplo de identificador conhecido (migração 0008) — os alvos do ataque.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { PRODUTO } from './anfitrioes';

const SENHA = process.env.PARAGEM_SENHA_DE_TESTE;
const A = 'prova';
const B = 'demo';
/** O segundo aviso de exemplo da demonstração (migração 0008), publicado. */
const AVISO_DE_B = 'd3e0a000-0000-4000-8000-000000000002';

async function entrar(page: Page, email: string, senha: string): Promise<void> {
  await page.goto(`${PRODUTO}/admin/entrar/`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Até a entrada acabar: saiu dela, ou voltou a ela com um erro.
  await page.waitForURL(
    (u) => !u.pathname.startsWith('/admin/entrar') || u.searchParams.has('erro'),
  );
}

/** O dono, com a base e as contas; ou a razão para não haver teste. */
async function donoComBase(browser: Browser): Promise<{ page: Page; razao: string | null }> {
  const page = await (await browser.newContext()).newPage();
  await entrar(page, 'dono@exemplo.pt', SENHA as string);
  await page.goto(`${PRODUTO}/admin/pessoas/`);
  if (await page.getByText('Falta SUPABASE_SERVICE_ROLE_KEY').count()) {
    return { page, razao: 'sem base do painel: no CI, a base prova-se no trabalho Migrações' };
  }
  if (await page.getByText('ainda não tem contas por pessoa').count()) {
    return { page, razao: 'a base não tem a migração 0009' };
  }
  return { page, razao: null };
}

/** O identificador da ação de servidor de um formulário, tal como o HTML o leva. */
async function idDaAcao(page: Page, formulario: string): Promise<string> {
  const nome = await page
    .locator(`${formulario} input[type="hidden"][name^="$ACTION_ID_"]`)
    .first()
    .getAttribute('name');
  if (!nome) throw new Error(`sem ação de servidor em ${formulario}`);
  return nome;
}

test('uma pessoa da região A não vê nem escreve na região B', async ({ browser }) => {
  // Dois convites, três entradas com scrypt, e as páginas todas: não cabe em 30 s.
  test.setTimeout(120_000);
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  const { page: dono, razao } = await donoComBase(browser);
  test.skip(razao !== null, razao ?? '');

  // O DONO CONVIDA: editora da região A, e mais nada.
  const email = `editora-${Date.now()}@exemplo.pt`;
  const nome = `Editora de Teste ${Date.now() % 100000}`;
  await dono.getByLabel('Nome').fill(nome);
  await dono.getByLabel('Email').fill(email);
  await dono.locator(`select[name="papel:${A}"]`).first().selectOption('editor');
  await dono.getByRole('button', { name: 'Convidar e gerar a ligação' }).click();
  const ligacao = await dono.getByLabel('A ligação').inputValue();
  expect(ligacao).toContain('/admin/ativar/?t=');

  // A PESSOA ABRE A LIGAÇÃO, escolhe a palavra-passe e entra — direta aos avisos de A.
  const senha = randomBytes(18).toString('base64url');
  const pessoa = await (await browser.newContext()).newPage();
  await pessoa.goto(ligacao);
  await expect(pessoa.getByRole('heading', { level: 1 })).toHaveText('Escolher a palavra-passe');
  await pessoa.getByLabel('Palavra-passe', { exact: true }).fill(senha);
  await pessoa.getByLabel('A mesma palavra-passe, outra vez').fill(senha);
  await pessoa.getByRole('button', { name: 'Guardar e entrar' }).click();
  await expect(pessoa).toHaveURL(`${PRODUTO}/admin/regioes/${A}/avisos/`);
  await expect(pessoa.locator('.painel-cabecalho .quem')).toContainText(nome);

  // A LIGAÇÃO SERVE UMA VEZ.
  const outra = await (await browser.newContext()).newPage();
  await outra.goto(ligacao);
  await expect(outra.locator('p[role="alert"]')).toContainText('já foi usada');

  // NÃO VÊ: as páginas de B, a ficha de A (é de gestor), as pessoas, a
  // auditoria e a região nova não existem para ela — 404, e não «sem
  // permissão», para nem confirmar que existem.
  for (const caminho of [
    `/admin/regioes/${B}/avisos/`,
    `/admin/regioes/${B}/`,
    `/admin/regioes/${A}/`,
    '/admin/pessoas/',
    '/admin/auditoria/',
    '/admin/regioes/nova/',
  ]) {
    const resposta = await pessoa.goto(`${PRODUTO}${caminho}`);
    expect(resposta?.status(), caminho).toBe(404);
  }

  // NÃO ESCREVE, nem com o formulário adulterado no navegador: o «Gravar» de
  // A com a região trocada para B.
  await pessoa.goto(`${PRODUTO}/admin/regioes/${A}/avisos/`);
  const titulo = `Teste de isolamento ${Date.now()}`;
  await pessoa.getByLabel('Título').fill(titulo);
  await pessoa.locator('textarea[name="texto"]').fill('Isto não pode chegar à região B.');
  await pessoa
    .locator('form:has(textarea[name="texto"]) input[name="regiao"]')
    .evaluate((el, b) => ((el as HTMLInputElement).value = b), B);
  await pessoa.locator('form:has(textarea[name="texto"]) button[type="submit"]').first().click();
  await expect(pessoa.getByText('não tens permissão para isto nesta região')).toBeVisible();

  // NEM CHAMANDO AS AÇÕES DIRETAMENTE, por HTTP, com a sessão dela: a ação de
  // apagar e a de publicar de A, com o aviso de B — primeiro com a região B,
  // depois com a A e o identificador de B.
  await pessoa.goto(`${PRODUTO}/admin/regioes/${A}/avisos/`);
  const html = await pessoa.content();
  const temAvisos = html.includes('name="publicar"');
  if (!temAvisos) {
    // Sem avisos em A, não há botões de publicar a copiar: grava-se um, legítimo.
    await pessoa.getByLabel('Título').fill(`${titulo} (legítimo)`);
    await pessoa.locator('textarea[name="texto"]').fill('Um aviso de A, de A.');
    await pessoa.locator('form:has(textarea[name="texto"]) button[type="submit"]').first().click();
    await expect(pessoa.locator('p[role="status"]').first()).toContainText('Aviso gravado');
  }
  const publicar = await idDaAcao(pessoa, 'form:has(input[name="publicar"])');
  for (const regiao of [B, A]) {
    const resposta = await pessoa.request.post(`${PRODUTO}/admin/regioes/${A}/avisos/`, {
      // A origem é a do próprio painel: o Next recusa ações de outra origem,
      // e o que se quer provar aqui é a guarda do papel, não essa.
      headers: { origin: PRODUTO },
      multipart: { [publicar]: '', regiao, id: AVISO_DE_B, publicar: '0' },
      maxRedirects: 0,
    });
    expect([303, 307, 200]).toContain(resposta.status());
    const destino = resposta.headers()['location'] ?? '';
    expect(decodeURIComponent(destino), `publicar com a região ${regiao}`).toMatch(
      /Não foi possível: (não tens permissão|não há aviso com esse identificador nesta região)/,
    );
  }

  // E O AVISO DE B CONTINUA COMO ESTAVA, publicado — visto pelo dono.
  await dono.goto(`${PRODUTO}/admin/regioes/${B}/avisos/`);
  await expect(dono.locator(`#aviso-${AVISO_DE_B}`)).toContainText('Publicado');
  await expect(dono.getByText(titulo, { exact: true })).toHaveCount(0);

  // A AUDITORIA ESCREVE QUEM: a ativação está em nome dela.
  await dono.goto(`${PRODUTO}/admin/auditoria/`);
  await expect(dono.locator('table.registo')).toContainText(nome);
  await expect(dono.locator('table.registo')).toContainText(email);

  // DESATIVAR TEM EFEITO NO CLIQUE SEGUINTE — a sessão aberta dela cai.
  await dono.goto(`${PRODUTO}/admin/pessoas/`);
  const ficha = dono.locator('li.pessoa', { hasText: email });
  await ficha.locator('summary', { hasText: 'Desativar' }).click();
  await ficha.getByRole('button', { name: `Desativar ${nome}` }).click();
  await expect(dono.locator('p[role="status"]').first()).toContainText('deixou de poder entrar');
  await pessoa.goto(`${PRODUTO}/admin/regioes/${A}/avisos/`);
  await expect(pessoa).toHaveURL(/\/admin\/entrar\//);
});
