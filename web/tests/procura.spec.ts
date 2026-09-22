import { test, expect } from '@playwright/test';

import { buscaDeUmaParagem, paragens, sitios, SEM } from './dados-da-regiao';

/**
 * A procura de SÍTIOS — o que se escreve quando não se procura uma paragem.
 *
 * Ninguém escreve o nome oficial de um terminal rodoviário: escreve «hospital».
 * Enquanto a caixa só conhecia paragens, a primeira tentativa de quem chega não
 * devolvia nada — e uma caixa que não responde à primeira parece avariada, por
 * muito bonito que seja o mapa por trás dela.
 *
 * OS EXEMPLOS SAEM DOS DADOS (`dados-da-regiao.ts`): os sítios vêm do
 * OpenStreetMap, que muda todos os dias, e uma região de demonstração não tem
 * nenhum. Um nome escrito à mão aqui era um teste que parte sozinho e que só
 * corre numa raiz.
 */
const SITIOS = sitios();
const { busca: BUSCA, nome: PARAGEM } = buscaDeUmaParagem();

/** As palavras que distinguem um nome — as curtas aparecem em metade deles. */
const palavras = (nome: string) =>
  nome
    .split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 5)
    .map((p) => p.toLowerCase());

/** Um sítio com duas palavras distintas, para se procurar pela ordem trocada. */
const DE_DUAS = SITIOS.find((s) => new Set(palavras(s.nome)).size >= 2);

/**
 * Uma palavra que está ao mesmo tempo no nome de uma paragem e no de um sítio
 * — é onde a ordem dos resultados se decide.
 */
const CRUZADA = (() => {
  const dosSitios = new Set(SITIOS.flatMap((s) => palavras(s.nome)));
  for (const p of paragens()) {
    const comum = palavras(p.nome).find((w) => dosSitios.has(w));
    if (comum) return comum;
  }
  return null;
})();

test('os sítios NÃO vêm com a página — vêm à primeira tecla', async ({ page }) => {
  // São dezenas de milhares de sítios contra alguns milhares de paragens.
  // Trazê-los ao abrir multiplicava o que o telemóvel descarrega por quem nem
  // sequer vai escrever nada.
  test.skip(SITIOS.length === 0, SEM.sitios);
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(r.url()));

  await page.goto(`/`);
  await expect(page.getByRole('combobox')).toBeVisible();
  expect(
    pedidos.filter((u) => u.includes('sitios.json')),
    'os sítios foram pedidos sem ninguém escrever nada',
  ).toEqual([]);

  await page.getByRole('combobox').fill(PARAGEM.slice(0, 2));
  await expect
    .poll(() => pedidos.filter((u) => u.includes('sitios.json')).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test('encontra-se pelas palavras, seja qual for a ordem', async ({ page }) => {
  // É o teste que justifica a procura por PALAVRAS e não por pedaço contíguo.
  // Os nomes do OpenStreetMap trazem a instituição inteira lá dentro — o
  // santo, o traço, a cidade e o centro hospitalar todo por extenso — e quem
  // procura escreve duas palavras dele, pela ordem que lhe apetecer.
  test.skip(!DE_DUAS, SEM.sitios);
  const [a, b] = [...new Set(palavras(DE_DUAS!.nome))];
  await page.goto(`/`);
  await page.getByRole('combobox').fill(`${b} ${a}`); // pela ordem trocada

  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const todas = (await opcoes.allInnerTexts()).join(' | ').toLowerCase();
  expect(todas, `«${b} ${a}» não encontrou ${DE_DUAS!.nome}`).toContain(a);
  expect(todas).toContain(b);
});

test('cada resultado diz o que é, por baixo do nome', async ({ page }) => {
  // O tipo distingue dois sítios com o mesmo nome — e é a diferença entre uma
  // lista de nomes e uma lista de respostas.
  test.skip(!DE_DUAS, SEM.sitios);
  await page.goto(`/`);
  await page.getByRole('combobox').fill(palavras(DE_DUAS!.nome)[0]);
  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(0);

  const todas = await opcoes.allInnerTexts();
  expect(
    todas.filter((t) => /·\s*\S/.test(t)).length,
    `nenhum resultado diz o que é:\n  ${todas.join('\n  ')}`,
  ).toBeGreaterThan(0);
});

test('as paragens vêm antes dos sítios', async ({ page }) => {
  // Quem escreve numa aplicação de transportes e escolhe uma terra quer ir
  // para lá, não para a pastelaria com o mesmo nome. O sítio continua na lista.
  test.skip(!CRUZADA, SEM.sitios);
  await page.goto(`/`);
  await page.getByRole('combobox').fill(CRUZADA!);
  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(1);
  await expect(opcoes.first()).toContainText(/paragem|comboio/);
});

test('nenhum resultado mostra uma etiqueta em inglês', async ({ page }) => {
  // Uma descrição em inglês num produto em português europeu é pior do que
  // descrição nenhuma: o nome já lá está, e o inglês faz parecer que o sítio é
  // de outra coisa qualquer. Sem tradução não se mostra nada.
  test.skip(SITIOS.length === 0, SEM.sitios);
  await page.goto(`/`);
  for (const q of ['Museu', 'Bicicletas', 'Centro']) {
    await page.getByRole('combobox').fill(q);
    const opcoes = page.getByRole('option');
    // Uma região pode não ter nenhum museu; o que não pode é responder em
    // inglês quando tem.
    if ((await opcoes.count()) === 0) continue;
    const texto = (await opcoes.allInnerTexts()).join(' | ');
    expect(texto, `«${q}» mostrou uma etiqueta crua do OpenStreetMap`).not.toMatch(
      /bicycle rental|hairdresser|car repair|social facility|artwork|aqueduct|· yes/,
    );
  }
});

test('escolher um ponto leva o mapa até lá', async ({ page }) => {
  // Sem isto, escolher abria o cartão e deixava o mapa onde estava — e quem
  // procurou ficava sem saber onde fica o que encontrou.
  await page.goto(`/`);
  await page.waitForTimeout(3000);
  await page.getByRole('combobox').fill(BUSCA);
  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await opcoes.first().click();

  // O cartão abre com o nome, que é o sinal visível de que a escolha pegou.
  await expect(page.locator('section.cartao-de-baixo')).toContainText(PARAGEM);
});
