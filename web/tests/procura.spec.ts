import { test, expect } from '@playwright/test';

import {
  buscaDeUmaParagem,
  concelhos,
  linhaComMaisViagens,
  linhas,
  paragens,
  pontosDaProcura,
  sitios,
  temMosaicos,
  SEM,
} from './dados-da-regiao';

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

test('as paragens vêm antes dos sítios — salvo a terra com o nome exato', async ({ page }) => {
  // Quem escreve numa aplicação de transportes e escolhe uma terra quer ir
  // para lá, não para a pastelaria com o mesmo nome. O sítio continua na lista.
  //
  // A EXCEÇÃO É A TERRA (P2-008): quem escreve o nome de uma vila, tal e
  // qual, quer a vila — e ela não aparecia entre as doze primeiras. Vem à
  // cabeça; a seguir, as paragens antes dos outros sítios.
  test.skip(!CRUZADA, SEM.sitios);
  await page.goto(`/`);
  const caixa = page.getByRole('combobox', { name: 'Procurar' });
  // A ORDEM SÓ SE DECIDE COM OS SÍTIOS, que chegam à primeira tecla. O «nada»
  // só se diz depois de eles chegarem — e é o sinal de que chegaram.
  await caixa.fill('xqzwv');
  await expect(page.getByText(/^Nada com «xqzwv»/)).toBeVisible({ timeout: 15_000 });
  await caixa.fill(CRUZADA!);
  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(1);
  const textos = await opcoes.allInnerTexts();
  const exato = (t: string) => simples(t.split(/\s*·\s*/)[0].trim()) === simples(CRUZADA!);
  const resto = textos.filter((t) => !exato(t));
  expect(resto[0], `a ordem foi:\n  ${textos.join('\n  ')}`).toMatch(/paragem|comboio/);
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
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto(`/`);
  await page.waitForTimeout(3000);
  await page.getByRole('combobox').fill(BUSCA);
  const opcoes = page.getByRole('option');
  await expect.poll(() => opcoes.count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await opcoes.first().click();

  // O cartão abre com o nome, que é o sinal visível de que a escolha pegou.
  await expect(page.locator('section.cartao-de-baixo')).toContainText(PARAGEM);
});

/** Sem acentos e em minúsculas — como a procura compara. */
const simples = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();

/**
 * Uma palavra de uma paragem com UMA LETRA A MENOS, e que não esteja dentro de
 * nome nenhum que a procura conheça — senão a procura exata acha-a, e o que se
 * mede deixa de ser a tolerância.
 */
const COM_ERRO = (() => {
  const conhecidos = [
    ...pontosDaProcura().map((p) => p.nome),
    ...SITIOS.map((s) => s.nome),
    ...linhas().map((l) => `${l.codigo} ${l.nome}`),
  ].map(simples);
  for (const p of [...paragens()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const w of palavras(p.nome).map(simples)) {
      if (w.length < 6) continue;
      const erro = w.slice(0, 2) + w.slice(3);
      if (!conhecidos.some((n) => n.includes(erro))) return { palavra: w, erro };
    }
  }
  return null;
})();

test('uma letra a menos ainda encontra, e diz que é parecido', async ({ page }) => {
  // «Corvalnho» não devolvia nada, e a lista nem abria (P2-006): quem escreve
  // com o polegar concluía que o sítio não existia.
  test.skip(!COM_ERRO, 'a região não tem um nome com que se faça o erro');
  await page.goto(`/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill(COM_ERRO!.erro);
  await expect(page.getByText(`Nomes parecidos com «${COM_ERRO!.erro}»:`)).toBeVisible({
    timeout: 15_000,
  });
  const primeira = await page.getByRole('option').first().innerText();
  expect(simples(primeira)).toContain(COM_ERRO!.palavra);
});

test('nada encontrado diz-se à vista, e diz o que a procura conhece', async ({ page }) => {
  // A lista simplesmente não abria (P2-006) — nem «sem resultados», nem a
  // explicação de que a procura só conhece o que é desta região.
  await page.goto(`/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill('xqzwv');
  const nada = page.getByText(/^Nada com «xqzwv» aqui\. A procura conhece as paragens/);
  await expect(nada).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('a procura do mapa encontra uma linha pelo número, e abre o horário dela', async ({
  page,
}) => {
  // Quem conhece o número da carreira escreve o número: a caixa só conhecia
  // paragens e sítios, e «11» não dava nada (P2-019).
  test.skip(!temMosaicos(), SEM.mosaicos);
  const l = linhaComMaisViagens();
  await page.goto(`/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill(l.codigo);
  const opcao = page.getByRole('option').filter({ hasText: '· linha' }).first();
  await expect(opcao).toBeVisible({ timeout: 15_000 });
  await expect(opcao).toContainText(l.nome);
  await opcao.click();
  await expect(page).toHaveURL(
    new RegExp(`/rede/linhas/${l.id.replace(/[^a-zA-Z0-9\-_]/g, '-')}/$`),
  );
});

test('dois sítios com o mesmo nome dizem de que concelho são', async ({ page }) => {
  // O mesmo «<nome> · lugar», duas vezes, a 37 km uma da outra (P2-037): não havia
  // como saber qual era qual. O caso não existe em todas as regiões, e por
  // isso PÕE-SE: o índice dos sítios que o navegador recebe ganha dois homónimos,
  // em dois concelhos da região — o que se mede é a página, não os dados.
  const [a, b] = concelhos();
  test.skip(!a || !b, 'a região tem um concelho só');
  const nome = 'Lugar Homónimo de Ensaio';
  await page.route('**/sitios.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        campos: ['nome', 'lat', 'lon', 'tipo', 'classe', 'concelho'],
        sitios: [
          [nome, 0, 0, 'Lugar', 'place=hamlet', a.id],
          [nome, 0.5, 0.5, 'Lugar', 'place=hamlet', b.id],
        ],
      }),
    }),
  );
  await page.goto(`/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill('Homónimo de Ensaio');
  const opcoes = page.getByRole('option');
  await expect(opcoes).toHaveCount(2, { timeout: 15_000 });
  await expect(opcoes.nth(0)).toContainText(`· ${a.nome}`);
  await expect(opcoes.nth(1)).toContainText(`· ${b.nome}`);
});
