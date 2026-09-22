/**
 * A FOLHA DE PARTIDAS: o que se lê primeiro, e o que não se sobrepõe.
 *
 * Estes testes existem por causa de um defeito que nem os tipos nem o axe
 * apanharam: a coluna da espera chamava-se `quando`, e já havia um `.quando`
 * no mesmo ficheiro de estilos — o dos campos de data das direções, com
 * `display: flex` e `width: 100%`. Ganhava por ser declarado mais acima, e a
 * espera saía DESENHADA POR CIMA do destino. A página compilava, os tipos
 * passavam, o axe passava, e o ecrã estava ilegível.
 *
 * Por isso o teste do meio mede caixas e não texto.
 */
import { test, expect } from '@playwright/test';

import { buscaDeUmaParagem, fusoDaRegiao, umaPartidaFutura } from './dados-da-regiao';

// A paragem com mais partidas desta região: é a que tem folha para ler, e sai
// dos dados em vez de estar escrita aqui (`dados-da-regiao.ts`).
const { busca: BUSCA } = buscaDeUmaParagem();

/**
 * O RELÓGIO PÕE-SE ONDE HÁ SERVIÇO, e não onde calhou correr o teste.
 *
 * Esta folha responde «falta quanto tempo», e isso depende da hora: numa rede
 * pequena as últimas partidas são ao fim da tarde, e às 19h não há nenhuma
 * para medir. O teste passava de manhã e falhava à noite — que é a pior
 * espécie de teste, porque a falha não é do código.
 *
 * Em vez de saltar meio dia, fixa-se o relógio do navegador cinco minutos
 * antes de uma partida a sério, no fuso da região (`dados-da-regiao.ts`).
 */
const PARTIDA = umaPartidaFutura();

test.use({ timezoneId: fusoDaRegiao() });

async function abrirParagem(page: import('@playwright/test').Page) {
  test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
  await page.clock.setFixedTime(PARTIDA!.quando);
  await page.goto(`/`);
  await page.getByRole('combobox').fill(BUSCA);
  await page.getByRole('option').first().click();
  const linhas = page.locator('.partidas li');
  await expect(linhas.first()).toBeVisible({ timeout: 10000 });
  return linhas;
}

test('cada partida diz quanto falta E a que horas', async ({ page }) => {
  // Quem está na paragem quer os minutos; quem planeia a tarde quer as horas.
  // São duas perguntas, e a folha responde às duas.
  const primeira = (await abrirParagem(page)).first();
  await expect(primeira.locator('.quando-passa strong')).toHaveText(/agora|\d+ min|\d+ h/);
  await expect(primeira.locator('.relogio')).toHaveText(/^\d{1,2}:\d{2}$/);
});

test('a espera não se sobrepõe ao destino', async ({ page }) => {
  // O defeito do cabeçalho deste ficheiro, medido: as duas caixas não se
  // podem tocar. Um teste de texto passava com o ecrã ilegível.
  const primeira = (await abrirParagem(page)).first();
  const destino = await primeira.locator('.destino').boundingBox();
  const quando = await primeira.locator('.quando-passa').boundingBox();
  expect(destino, 'o destino tem de ter caixa').not.toBeNull();
  expect(quando, 'a espera tem de ter caixa').not.toBeNull();
  expect(destino!.width, 'o destino não pode ficar com largura zero').toBeGreaterThan(20);
  expect(
    destino!.x + destino!.width,
    'o destino acaba antes de a espera começar',
  ).toBeLessThanOrEqual(quando!.x + 1);
});

test('o distintivo leva o número da linha e a cor dela', async ({ page }) => {
  const linhas = await abrirParagem(page);
  const dist = linhas.first().locator('.linha-distintivo');
  await expect(dist).toHaveText(/\S/);
  // A cor vem do `cores-das-linhas.json`. Se o ficheiro faltar, o distintivo
  // fica neutro e continua legível — o que NÃO pode é ficar sem fundo.
  const fundo = await dist.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fundo).not.toBe('rgba(0, 0, 0, 0)');
});

test('o fecho é discreto e continua a ter alvo de 44 px', async ({ page }) => {
  // Era um botão escuro do tamanho de um terço da folha, ao lado do nome da
  // paragem. Encolheu aos olhos e não ao dedo: o §4.5 pede 44 px.
  await abrirParagem(page);
  const fechar = page.locator('.cartao-de-baixo .fechar');
  const caixa = await fechar.boundingBox();
  expect(caixa!.width).toBeGreaterThanOrEqual(44);
  expect(caixa!.height).toBeGreaterThanOrEqual(44);
  await expect(fechar).toHaveAttribute('aria-label', 'Fechar');
});
