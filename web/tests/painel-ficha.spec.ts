/**
 * A ficha de uma região, COM A BASE: os gestos que tiram um sítio do ar pedem
 * confirmação, os endereços colados da barra do navegador ficam só domínio, e
 * o endereço principal não muda para um que ainda não responde (P4-011,
 * P4-012, P4-013, P4-014, P4-015).
 *
 * Como `painel-contas.spec.ts`: precisa da base do painel, e sem ela salta e
 * diz porquê. Mexe no Baixo Sável — a região de prova municipal, que nenhum
 * cliente tem — e deixa-o como o encontrou.
 */
import { test, expect, type Page } from '@playwright/test';
import { PRODUTO } from './anfitrioes';

const SENHA = process.env.PARAGEM_SENHA_DE_TESTE;
const REGIAO = 'prova-municipio';
const NOME = 'Baixo Sável';
const FICHA = `${PRODUTO}/admin/regioes/${REGIAO}/`;
const PRINCIPAL = 'prova-municipio.paragem.pt';
const NOVO = 'www.prova-municipio.paragem.pt';

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
  return null;
}

/** A mensagem que a ação deixou, dentro da secção onde se mexeu. */
function mensagem(page: Page, secao: string) {
  return page.locator(`#${secao} [role="status"]`);
}

test('a ficha protege os gestos que tiram o sítio do ar', async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!SENHA, 'sem PARAGEM_SENHA_DE_TESTE o servidor não tem palavra-passe configurada');
  const razao = await entrarComoDono(page);
  test.skip(razao !== null, razao ?? '');

  // O que uma corrida interrompida tenha deixado, sai antes de começar.
  async function retirarONovo(): Promise<void> {
    const alias = page.locator('#endereco li', { hasText: NOVO });
    if ((await alias.count()) === 0) return;
    await alias.locator('summary', { hasText: 'Retirar' }).click();
    await alias.getByRole('button', { name: `Retirar ${NOVO}` }).click();
    await expect(mensagem(page, 'endereco')).toContainText('deixou de levar');
  }
  await retirarONovo();

  // A ORDEM DE QUEM USA: os avisos antes de tudo, a zona de perigo no fim.
  const secoes = await page.locator('main section[id]').evaluateAll((els) => els.map((e) => e.id));
  expect(secoes.indexOf('avisos')).toBeLessThan(secoes.indexOf('endereco'));
  expect(secoes.at(-1)).toBe('perigo');
  // E a língua de quem usa: nada de «montra», «canónico» ou «(308)» à vista.
  const visivel = await page.locator('main').innerText();
  for (const jargao of ['montra', 'canónico', '(308)', 'armazém', 'FlixBus']) {
    expect(visivel, jargao).not.toContain(jargao);
  }

  // UM MODO: desligar pede confirmação, a mensagem fica na secção, e desfaz-se.
  const modo = page.locator('#modulos .interruptores > li').first();
  const nomeDoModo = (await modo.locator('strong').first().innerText()).trim();
  await modo.locator('summary', { hasText: 'Desligar' }).click();
  await modo.getByRole('button', { name: `Desligar ${nomeDoModo.toLowerCase()}` }).click();
  await expect(mensagem(page, 'modulos')).toContainText(`${nomeDoModo}: desligado`);
  await expect(page).toHaveURL(/secao=modulos/);
  // O ecrã foi para lá, e o foco também (P4-014).
  await expect(mensagem(page, 'modulos')).toBeFocused();
  await page.getByRole('button', { name: /Desfazer: voltar a ligar/ }).click();
  await expect(mensagem(page, 'modulos')).toContainText(`${nomeDoModo}: ligado`);

  // UM ENDEREÇO COLADO DA BARRA DO NAVEGADOR fica só o domínio (P4-012).
  await page
    .getByLabel('Acrescentar um endereço que leve ao principal')
    .fill(`https://WWW.${PRINCIPAL}/horarios/`);
  await page.getByRole('button', { name: 'Acrescentar', exact: true }).click();
  await expect(mensagem(page, 'endereco')).toContainText(`Fica ${NOVO}`);
  await expect(page.locator('#endereco')).toContainText(NOVO);

  // MUDAR O PRINCIPAL PARA UM ENDEREÇO QUE AINDA NÃO RESPONDE: recusa, e diz
  // porquê — mesmo com o nome bem escrito (P4-013).
  const perigo = page.locator('#perigo');
  await perigo.locator('summary', { hasText: 'Mudar o endereço principal' }).click();
  await perigo.getByLabel('O endereço novo', { exact: true }).selectOption(NOVO);
  await perigo.locator('#confirmar-dominio').fill(NOME);
  await perigo.getByRole('button', { name: 'Mudar o endereço principal' }).click();
  await expect(mensagem(page, 'perigo')).toContainText('Não foi possível');
  await expect(mensagem(page, 'perigo')).toContainText('o sítio sem responder');
  await expect(page.locator('#estado')).toContainText(PRINCIPAL);

  // DESLIGAR COM O NOME ERRADO não desliga.
  await perigo.locator('summary', { hasText: 'Desligar' }).click();
  await perigo.locator('#confirmar-desligar').fill('Serra da Pedra Alta');
  await perigo.getByRole('button', { name: /^Desligar o Baixo Sável$/ }).click();
  await expect(mensagem(page, 'perigo')).toContainText('escreve o nome da região');
  await expect(page.locator('#estado')).toContainText('No ar');

  // COM O NOME CERTO, desliga — e liga-se outra vez no topo, porque há dados.
  await perigo.locator('summary', { hasText: 'Desligar' }).click();
  await perigo.locator('#confirmar-desligar').fill('baixo savel');
  await perigo.getByRole('button', { name: /^Desligar o Baixo Sável$/ }).click();
  await expect(mensagem(page, 'estado')).toContainText('O Baixo Sável está desligado');
  await page.getByRole('button', { name: 'Ligar o Baixo Sável' }).click();
  await expect(mensagem(page, 'estado')).toContainText('O Baixo Sável está no ar');

  // E O ENDEREÇO A MAIS SAI, como entrou.
  await retirarONovo();
  await expect(page.locator('#endereco dl dd').nth(1)).toHaveText('nenhum');
});
