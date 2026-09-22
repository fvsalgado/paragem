/**
 * A consulta de preços de expresso, no navegador.
 *
 * AO CONTRÁRIO DA PROVA DA DISPONIBILIDADE, esta corre sozinha: o serviço é
 * substituído por `page.route`, e por isso não é preciso alinhar três
 * processos. O que se testa é o que o navegador faz — desenhar a tabela,
 * dizer a verdade quando a consulta falha, e não apagar o que já lá estava.
 *
 * Salta quando o sítio foi construído SEM serviço configurado: aí o
 * formulário não existe de propósito, e é isso que a página promete.
 */
import { test, expect } from '@playwright/test';

const RESPOSTA = {
  data: '2099-07-02',
  lido: Date.now(),
  falhou: false,
  viagens: [
    {
      partida: '2099-07-02T07:15:00+01:00',
      chegada: '2099-07-02T09:00:00+01:00',
      paragemPartida: 'Pedra Alta (Terminal)',
      paragemChegada: 'Vale Escuro (Norte)',
      duracaoMin: 105,
      preco: 7.25,
      lugares: 21,
      direto: true,
      estado: 'available',
    },
    {
      partida: '2099-07-02T21:40:00+01:00',
      chegada: '2099-07-03T01:10:00+01:00',
      paragemPartida: 'Pedra Alta (Terminal)',
      paragemChegada: 'Vale Escuro (Norte)',
      duracaoMin: 210,
      preco: null,
      lugares: 0,
      direto: false,
      estado: 'sold_out',
    },
  ],
};

async function abrir(page: import('@playwright/test').Page) {
  await page.goto('/modos/expresso/');
  const forms = page.locator('form.precos-de-expresso');
  const quantos = await forms.count();
  test.skip(quantos === 0, 'o sítio foi construído sem serviço de expressos configurado');
  return forms.first();
}

test('escolher um destino traz preço, lugares e a paragem certa', async ({ page }) => {
  await page.route('**/expressos*', (rota) =>
    rota.fulfill({ json: RESPOSTA, headers: { 'access-control-allow-origin': '*' } }),
  );
  const form = await abrir(page);

  // A lista de destinos vem do feed, estática: existe antes de se perguntar.
  await form.locator('select').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Procurar' }).click();

  await expect(form.getByRole('table')).toBeVisible({ timeout: 8000 });
  await expect(form.getByRole('cell', { name: '7,25 €' })).toBeVisible();
  await expect(form.getByRole('cell', { name: '1 h 45', exact: false })).toBeVisible();
  // «Esgotado» e não «0,00 €»: sem preço não se escreve um zero.
  await expect(form.getByRole('cell', { name: 'Esgotado' })).toBeVisible();
  // A paragem exacta de cada ponta — «(Norte)» e «(Sul)» não são o mesmo sítio.
  await expect(form.getByText('Vale Escuro (Norte)').first()).toBeVisible();
  await expect(form.getByText(/consultados ao operador/)).toBeVisible();
});

test('quando a consulta falha, diz-se — e o horário planeado fica', async ({ page }) => {
  await page.route('**/expressos*', (rota) => rota.fulfill({ status: 500, body: 'não' }));
  const form = await abrir(page);

  await form.locator('select').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Procurar' }).click();

  await expect(form.getByText(/Não foi possível saber os preços/)).toBeVisible({ timeout: 8000 });
  // O QUE JÁ LÁ ESTAVA NÃO DESAPARECE: as linhas do feed continuam na página.
  await expect(page.getByRole('heading', { name: 'Onde param, e para onde vão' })).toBeVisible();
});

test('o formulário é utilizável sem rato e tem rótulo a sério', async ({ page }) => {
  const form = await abrir(page);
  const select = form.locator('select');
  // Um `<label for>` a sério, e não um placeholder a fingir de rótulo.
  const id = await select.getAttribute('id');
  await expect(form.locator(`label[for="${id}"]`)).toBeVisible();
  // O botão fica desativado enquanto não houver destino: não se pergunta o vazio.
  await expect(form.getByRole('button', { name: 'Procurar' })).toBeDisabled();
  await select.selectOption({ index: 1 });
  await expect(form.getByRole('button', { name: 'Procurar' })).toBeEnabled();
});
