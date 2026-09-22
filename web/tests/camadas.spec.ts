import { test, expect } from '@playwright/test';

import { camadasDe } from '../src/lib/pontos-no-mapa.ts';
import {
  buscaDeUmaParagem,
  ondeHaParagens,
  paragens,
  pontosDaProcura,
  temMosaicos,
  tiposNoMapa,
  umaEstacaoDeBicicletas,
  estacoes,
  SEM,
} from './dados-da-regiao';

/**
 * O MAPA MOSTRA OS MODOS TODOS, e deixa escolher quais.
 *
 * Até aqui era um círculo azul para tudo: 2 392 paragens e 27 estações, e
 * mais nada. As 81 estações de bicicletas, as 9 praças de táxi e as 30
 * paragens dos urbanos municipais existiam nos dados e não existiam no mapa —
 * e quem abre um mapa de transportes à procura de uma bicicleta não vai a
 * `/modos/bicicleta/` adivinhar.
 *
 * O que estes testes guardam não é o desenho: é a diferença entre um ponto e
 * outro. Um mapa em que tudo é igual não responde a «onde está a bicicleta
 * mais perto», e um filtro que não filtra é pior do que filtro nenhum, porque
 * quem o carrega fica a pensar que já viu tudo.
 */

/**
 * O QUE ESTA REGIÃO PÕE NO MAPA, lido dos dados que a corrida construiu: um
 * tipo de ponto por camada, com o rótulo que o próprio módulo lhe dá. Nenhuma
 * lista escrita à mão — e é isso que faz este ficheiro correr em qualquer
 * região, incluindo uma sem comboio ou com um modo desligado no painel.
 */
const CAMADAS = camadasDe(tiposNoMapa());
const { busca: BUSCA, nome: PARAGEM } = buscaDeUmaParagem();
const BICICLETA = umaEstacaoDeBicicletas();

/**
 * Espera que o mapa esteja desenhado: sem isto os toques caem no vazio.
 *
 * E SÓ HÁ MAPA ONDE HÁ MOSAICOS. Uma região que se construa sem rede não tem
 * recorte do OpenStreetMap: a página diz «sem mapa» e desenha a lista, que é o
 * que se quer que ela faça. Não há aqui um defeito a apanhar — há um mapa que
 * não existe.
 */
async function mapaPronto(page: import('@playwright/test').Page) {
  test.skip(!temMosaicos(), SEM.mosaicos);
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
}

test('há um botão por modo, e não uma lista escrita à mão', async ({ page }) => {
  // Os botões derivam do que está nos dados. Uma região sem bicicletas não
  // ganha um botão «Bicicleta partilhada» que não liga a nada — e é por isso
  // que isto se verifica contra os tipos de ponto que a região tem, e não
  // contra uma lista de rótulos.
  await page.goto(`/`);
  await mapaPronto(page);
  const camadas = page.getByRole('group', { name: 'O que aparece no mapa' });
  await expect(camadas).toBeVisible();
  expect(CAMADAS.length, 'a região não põe um único ponto no mapa').toBeGreaterThan(0);
  for (const { rotulo } of CAMADAS) {
    await expect(camadas.getByRole('button', { name: rotulo })).toBeVisible();
  }
  expect(await camadas.getByRole('button').count(), 'botões a mais do que modos').toBe(
    CAMADAS.length,
  );
});

test('começam todos ligados, e carregar desliga', async ({ page }) => {
  // `aria-pressed` e não uma classe de CSS: é assim que um leitor de ecrã
  // anuncia «ligado» e «desligado». Sem ele o estado só existe para quem vê.
  await page.goto(`/`);
  await mapaPronto(page);
  const botao = page.getByRole('button', { name: CAMADAS[0].rotulo });
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
});

test('o botão desliga MESMO a camada do mapa', async ({ page }) => {
  // O teste que interessa. Os dois anteriores provam que o botão muda de
  // estado; este prova que a mudança chega ao mapa. Um interruptor que muda
  // de cor e não faz nada é a avaria mais fácil de não dar por ela.
  await page.goto(`/`);
  await mapaPronto(page);

  const camada = CAMADAS[0];
  const visibilidade = () =>
    page.evaluate((tipo) => {
      const m = (window as unknown as { __mapa?: maplibregl.Map }).__mapa;
      return m?.getLayoutProperty(`pontos-${tipo}`, 'visibility') ?? null;
    }, camada.tipo);

  await page.getByRole('button', { name: camada.rotulo }).click();
  await expect.poll(visibilidade).toBe('none');
  await page.getByRole('button', { name: camada.rotulo }).click();
  await expect.poll(visibilidade).toBe('visible');
});

test('cada modo tem a sua cor, e nenhuma se repete', async ({ page }) => {
  // As cores são as do §8 e vêm de `pontos-no-mapa.ts`. Se duas camadas
  // ficarem com a mesma, o mapa deixa de distinguir uma bicicleta de uma
  // paragem — e era exatamente essa a queixa.
  await page.goto(`/`);
  await mapaPronto(page);
  // QUANTAS CAMADAS HÁ NÃO SE CRAVA, e foi a lição de uma publicação
  // vermelha. Três destas camadas nascem do OpenStreetMap, que muda todos os
  // dias: um número exato aqui é um teste que parte sozinho daqui a uma
  // semana, num sítio onde partir bloqueia a publicação. O que se fixa é o
  // que tem de ser verdade sempre — há camadas a mais do que uma, e duas
  // camadas nunca partilham a cor.
  //
  // A tela aparece ANTES de as camadas entrarem — o estilo e os mosaicos
  // ainda vêm a caminho. Sem esperar por elas, isto mede um mapa vazio.
  const tipos = CAMADAS.map((c) => c.tipo);
  const lerCores = () =>
    page.evaluate((tipos) => {
      const m = (window as unknown as { __mapa?: maplibregl.Map }).__mapa;
      if (!m) return [];
      return tipos
        .filter((t) => m.getLayer(`pontos-${t}`))
        .map((t) => String(m.getPaintProperty(`pontos-${t}`, 'circle-color')));
    }, tipos);
  await expect.poll(async () => (await lerCores()).length, { timeout: 30_000 }).toBe(tipos.length);
  const cores = await lerCores();
  expect(new Set(cores).size, `cores repetidas: ${cores.join(', ')}`).toBe(cores.length);
});

test('uma estação de bicicletas abre o cartão dela, e não o de uma paragem', async ({ page }) => {
  // Pelo nome, que é o caminho que uma pessoa faz — e que prova de caminho a
  // caminho que o ponto existe no índice, abre cartão, e que o cartão sabe o
  // que ele é. Uma estação de bicicletas com o rótulo «Paragem de autocarro» e
  // uma ligação para um horário que não existe era o que acontecia antes.
  test.skip(!BICICLETA, SEM.modo('bicicleta'));
  await page.goto(`/`);
  await page.getByRole('combobox').fill(BICICLETA!.nome);
  await page.getByRole('option').first().click();

  const cartao = page.locator('.cartao-de-baixo');
  await expect(cartao).toContainText('Bicicleta partilhada');
  await expect(cartao.getByRole('link', { name: 'Ver este serviço' })).toHaveAttribute(
    'href',
    `/modos/bicicleta/`,
  );
  // E NÃO promete horário nenhum: numa estação de bicicletas não há partidas
  // para planear, e a nota dos horários planeados só confundia.
  await expect(cartao).not.toContainText('Horários planeados');
});

test('uma paragem continua a abrir as horas', async ({ page }) => {
  // A regressão que isto guarda: ao dar cartão aos outros modos, é fácil
  // partir o caso que já funcionava.
  await page.goto(`/`);
  await page.getByRole('combobox').fill(BUSCA);
  await page.getByRole('option').first().click();

  const cartao = page.locator('.cartao-de-baixo');
  await expect(cartao).toContainText(PARAGEM);
  await expect(cartao).toContainText('Paragem de autocarro');
  await expect(cartao).toContainText('Horários planeados');
  await expect(cartao.getByRole('link', { name: 'Horário completo' })).toBeVisible();
});

test('«Perto de ti» continua a ser só paragens e estações', async ({ page }) => {
  // O índice passou a trazer bicicletas, táxis e urbanos. Aqui não servem:
  // este bloco responde «a que horas passa o próximo», e nenhum deles tem
  // partidas — entravam como sítios mudos a empurrar para fora as paragens
  // que respondem, e com a ligação partida por cima.
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation(ondeHaParagens());
  await page.goto(`/rede/`);
  await page.getByRole('button', { name: /paragens perto de mim/i }).click();

  const lista = page.locator('li', { has: page.locator('a[href*="/rede/"]') });
  await expect(lista.first()).toBeVisible({ timeout: 15_000 });
  const destinos = await page
    .locator('a[href*="/rede/"]')
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''));
  const doBloco = destinos.filter(
    (h) => h.includes('/rede/paragens/') || h.includes('/rede/estacoes/'),
  );
  expect(doBloco.length).toBeGreaterThan(0);

  // E CADA UMA EXISTE. É a parte que interessa: um ponto de outro modo que
  // entrasse aqui levava a uma página de paragem que não há — uma ligação
  // partida por baixo de uma hora que ninguém vai apanhar.
  const conhecidos = new Set([...paragens().map((p) => p.id), ...estacoes().map((e) => e.id)]);
  /** O identificador, quando a ligação é de uma paragem e não do índice delas. */
  const idDe = (href: string) => {
    const partes = href.split('/').filter(Boolean);
    const i = partes.findIndex((x) => x === 'paragens' || x === 'estacoes');
    return i >= 0 ? (partes[i + 1] ?? '') : '';
  };
  const inventados = doBloco.map(idDe).filter((id) => id && !conhecidos.has(id));
  expect(inventados, 'ligações para paragens que não existem').toEqual([]);

  // Nem os pontos dos outros modos, que não têm partidas nenhumas.
  const outros = new Set(
    pontosDaProcura()
      .filter((p) => !['paragem', 'estacao'].includes(p.tipo))
      .map((p) => p.id),
  );
  expect(
    destinos.filter((h) => outros.has(idDe(h))),
    'um ponto sem partidas entrou no «Perto de ti»',
  ).toEqual([]);
});
