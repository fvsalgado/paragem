/**
 * A MARCA BRANCA: o sítio de cada região é da autoridade, e não do fornecedor.
 *
 * O cabeçalho abria com «Paragem.pt», a levar à página de vendas do produto,
 * e a região vinha a seguir numa pastilha (P4-008, P1-007, P2-029, P3-029). O
 * primeiro ecrã do mapa não tinha marca nenhuma (P1-008), e um nome comprido
 * partia o cabeçalho (P1-043). O que se prova aqui:
 *
 * - o cabeçalho é a assinatura da região — o endereço dela em feixe, que é o
 *   logótipo dela (§6) —, a levar ao início DA REGIÃO;
 * - o logótipo, as réguas, os botões e as ligações levam os tons tirados da
 *   cor que ela declara, sobre o fundo claro do sítio;
 * - «Paragem.pt» só aparece discreto, no fim, a levar ao produto;
 * - a assinatura está no primeiro ecrã do mapa e no menu;
 * - um nome ou um endereço comprido não muda a altura do cabeçalho, nem
 *   empurra a página.
 *
 * NENHUM CLIENTE ESTÁ AQUI: a cor, o endereço e o logótipo esperados leem-se
 * do `regiao.json` que a construção publicou, e as regiões de prova provam o
 * caso de quem não declara marca nenhuma.
 */
import { test, expect, type Page } from '@playwright/test';
import { PORTA, PRODUTO, PROVA, PROVA_MUNICIPIO, REGIAO, anfitriao } from './anfitrioes';
import { corDaMarca, declaracao, temMosaicos } from './dados-da-regiao';
import { desenhavel, desenharEndereco } from '../src/lib/feixe.ts';
import { COR_DO_PRODUTO, feixeDaRegiao } from '../src/lib/marca.ts';

/** A cor de um elemento como `#rrggbb`. */
async function cor(page: Page, seletor: string, propriedade: 'color' | 'background-color') {
  return await page
    .locator(seletor)
    .first()
    .evaluate((e, p) => {
      const [r, g, b] = getComputedStyle(e)
        .getPropertyValue(p)
        .match(/\d+(\.\d+)?/g)!
        .map(Number);
      return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
    }, propriedade);
}

const nomeDaRede = (id: string) =>
  declaracao(id)?.rede?.nome ?? `Transportes ${declaracao(id)!.de}`;

/** O endereço que o logótipo da região escreve, se ela o declara e o feixe o sabe desenhar. */
const enderecoDe = (id: string) => {
  const d = declaracao(id)?.dominio;
  return desenhavel(d) ? d : null;
};

/**
 * Quantos píxeis de cada tom o logótipo pinta DE FACTO no ecrã. O desenho vem
 * por `<use>` de um ficheiro à parte, e o que lá está dentro não se lê da
 * página: fotografa-se. Espera-se que o ficheiro chegue, e conta-se — num
 * telemóvel, cada linha tem píxeis cheios da cor dela, além das bordas.
 */
async function pintados(page: Page, tons: readonly string[]): Promise<number[]> {
  const logotipo = page.locator('header .endereco-em-feixe');
  await expect(logotipo).toBeVisible();
  const contar = async () => {
    const png = await logotipo.screenshot();
    return page.evaluate(
      async ({ b64, tons }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const tela = document.createElement('canvas');
        tela.width = img.width;
        tela.height = img.height;
        const ctx = tela.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
        return tons.map((h) => {
          const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
          let n = 0;
          for (let i = 0; i < data.length; i += 4)
            if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 12)
              n++;
          return n;
        });
      },
      { b64: png.toString('base64'), tons: [...tons] },
    );
  };
  await expect.poll(async () => Math.min(...(await contar()))).toBeGreaterThan(40);
  return contar();
}

/** `#rrggbb` como o navegador o escreve num valor calculado. */
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('o cabeçalho é a assinatura da região, e leva ao início dela', async ({ page }) => {
  for (const id of [REGIAO, 'prova', 'prova-municipio']) {
    if (!declaracao(id)) continue;
    await page.goto(`${anfitriao(id)}/rede/`);
    const cabecalho = page.getByRole('banner');
    const primeira = cabecalho.getByRole('link').first();
    const endereco = enderecoDe(id);
    if (endereco) {
      // O logótipo é o endereço, e lê-se como o que mostra; por baixo, o que
      // a região é.
      await expect(primeira.getByRole('img', { name: endereco }), id).toBeVisible();
      await expect(primeira, id).toContainText(`Transportes ${declaracao(id)!.de}`);
    } else {
      await expect(primeira, id).toContainText(nomeDaRede(id));
    }
    await expect(primeira, id).toHaveAttribute('href', '/');
    // O produto não está no cabeçalho de uma região.
    await expect(cabecalho.locator(`a[href^="${PRODUTO}"]`), id).toHaveCount(0);
    await expect(cabecalho.getByRole('link', { name: 'Paragem.pt', exact: true }), id).toHaveCount(
      0,
    );
  }
});

test('o cabeçalho é claro, e o logótipo, a régua e as ligações levam os tons da região', async ({
  page,
}) => {
  for (const id of [REGIAO, 'prova']) {
    if (!declaracao(id)) continue;
    await page.goto(`${anfitriao(id)}/rede/`);
    // A superfície do sítio, e não uma faixa: o feixe só se vê a cores
    // sobre um fundo claro (§6).
    expect(await cor(page, 'header.cabecalho', 'background-color'), id).toBe('#ffffff');
    const tons = feixeDaRegiao(corDaMarca(id)).claro;
    if (enderecoDe(id)) {
      // As três linhas do logótipo, cada uma no seu tom da região.
      for (const [i, n] of (await pintados(page, tons)).entries()) {
        expect(n, `${id}: ${tons[i]}`).toBeGreaterThan(40);
      }
    }
    // A régua: a linha do meio é o traço, e as de fora e de dentro as sombras.
    const regua = page.locator('header .regua-do-feixe');
    expect(await cor(page, 'header .regua-do-feixe', 'background-color'), id).toBe(tons[1]);
    const sombras = await regua.evaluate((e) => getComputedStyle(e).boxShadow);
    expect(sombras, id).toContain(rgb(tons[0]));
    expect(sombras, id).toContain(rgb(tons[2]));
    // As ligações da região são da linha de fora, que se lê como texto.
    expect(await cor(page, 'header nav a', 'color'), id).toBe(tons[0]);
    // O rodapé fecha com a mesma régua.
    await expect(page.locator('footer .regua-do-feixe'), id).toHaveCount(1);
  }
});

test('as provas não têm marca própria: o feixe sai do azul do §6, sem logótipo', async ({
  page,
}) => {
  const tons = feixeDaRegiao(COR_DO_PRODUTO).claro;
  for (const host of [PROVA, PROVA_MUNICIPIO]) {
    await page.goto(`${host}/rede/`);
    const [deFora] = await pintados(page, tons);
    expect(deFora, host).toBeGreaterThan(40);
    await expect(page.locator('header img.logotipo'), host).toHaveCount(0);
  }
});

test('o desenho do logótipo é um ficheiro da região, para sempre na cache, e só o de agora', async ({
  page,
  request,
}) => {
  const id = ['prova', 'prova-municipio', REGIAO].find((r) => enderecoDe(r))!;
  const desenho = desenharEndereco(enderecoDe(id))!;
  await page.goto(`${anfitriao(id)}/rede/`);
  // A página leva só a referência: o desenho não vem no HTML.
  const usos = page.locator('header .endereco-em-feixe use');
  await expect(usos).toHaveCount(2);
  await expect(usos.first()).toHaveAttribute('href', `/logotipo/${desenho.versao}.svg#inteira`);
  expect(await page.locator('header .endereco-em-feixe path').count(), id).toBe(0);

  const pedir = (caminho: string) =>
    request.get(`http://127.0.0.1:${PORTA}${caminho}`, {
      headers: { host: `${id}.localhost:${PORTA}` },
    });
  const r = await pedir(`/logotipo/${desenho.versao}.svg`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/svg+xml');
  expect(r.headers()['cache-control']).toContain('immutable');
  expect(await r.text()).toContain('<g id="reduzida"');
  // Uma versão que não é a de agora não se serve: seria o desenho errado
  // guardado para sempre com o nome de outro.
  expect((await pedir('/logotipo/00000000.svg')).status()).toBe(404);
});

test('a região que declara um logótipo mostra-o, sem saltar quando chega', async ({ page }) => {
  const logotipo = declaracao()?.marca?.logotipo;
  test.skip(!logotipo, 'a região em teste não declara logótipo');
  await page.goto('/rede/');
  const img = page.locator('header img.logotipo');
  await expect(img).toHaveAttribute('src', new RegExp(`${logotipo!.replace(/\./g, '\\.')}$`));
  // A largura e a altura vêm no HTML: o lugar está guardado antes de a imagem chegar.
  await expect(img).toHaveAttribute('width', /^\d+$/);
  await expect(img).toHaveAttribute('height', /^\d+$/);
  expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
  // Decorativo: o nome está escrito ao lado.
  await expect(img).toHaveAttribute('alt', '');
});

test('«Feito com Paragem.pt» discreto, no fim, a levar ao produto', async ({ page }) => {
  await page.goto('/rede/');
  const feito = page.getByRole('contentinfo').locator('.feito-com');
  await expect(feito).toHaveText('Feito com Paragem.pt');
  // A montra do produto, noutro anfitrião (a construção dos testes leva-a a
  // `NEXT_PUBLIC_PARAGEM_PRODUTO`, que é este).
  await expect(feito.getByRole('link', { name: 'Paragem.pt' })).toHaveAttribute('href', PRODUTO);
});

test('a marca da região está no primeiro ecrã do mapa, e no menu', async ({ page }) => {
  test.skip(!temMosaicos(), 'a região em teste não tem mapa');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const endereco = enderecoDe(REGIAO);
  const assinada = async (onde: ReturnType<Page['locator']>) => {
    if (endereco) await expect(onde.getByRole('img', { name: endereco })).toBeVisible();
    else await expect(onde).toContainText(nomeDaRede(REGIAO));
  };
  const folha = page.locator('.folha-de-abertura');
  await assinada(folha.locator('.assinatura'));
  await expect(folha.locator('.assinatura')).toBeInViewport();

  await page.getByRole('button', { name: 'Abrir o menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await assinada(menu.locator('.assinatura'));
  await expect(menu.locator('.feito-com')).toHaveText('Feito com Paragem.pt');
});

test('um nome ou um endereço comprido não muda a altura do cabeçalho, nem empurra a página', async ({
  page,
}) => {
  // O nome de uma comunidade intermunicipal tem facilmente sessenta letras, e
  // o endereço mais comprido das provas tem vinte e seis. Mede-se com o nome
  // da região e com um assim, escrito por cima.
  for (const id of [REGIAO, 'prova-municipio']) {
    for (const largura of [320, 390, 1280]) {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto(`${anfitriao(id)}/rede/`);
      const altura = async () => (await page.locator('header.cabecalho').boundingBox())!.height;
      const antes = await altura();
      await page.evaluate(() => {
        const longo =
          'Comunidade Intermunicipal das Terras Altas do Vale do Rio Comprido e Serras Vizinhas';
        for (const e of document.querySelectorAll(
          'header .nome-principal, header .nome-secundario',
        ))
          e.textContent = longo;
      });
      expect(await altura(), `${id}, ${largura} px`).toBe(antes);
      const larga = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(larga, `${id}, ${largura} px: a página desliza para o lado`).toBeLessThanOrEqual(0);
      // O logótipo cabe inteiro no ecrã: encolhe, não se corta.
      const logotipo = page.locator('header .endereco-em-feixe');
      if (await logotipo.count()) {
        const caixa = (await logotipo.boundingBox())!;
        expect(caixa.x, `${id}, ${largura} px`).toBeGreaterThanOrEqual(0);
        expect(caixa.x + caixa.width, `${id}, ${largura} px`).toBeLessThanOrEqual(largura);
      }
    }
  }
});

/**
 * O VERMELHO DO PRODUTO FICA NA PÁGINA DO PRODUTO (§6). A marca do produto é
 * vermelha por fora, e o vermelho do sítio quer dizer alerta: a cores, a marca
 * vai à montra, ao ícone e ao cartão de partilha, e mais a lado nenhum. Numa
 * região ou no painel, um vermelho daqueles ao pé de um aviso lia-se como
 * outro aviso.
 *
 * Procura-se a cor em tudo o que a página pinta — texto, fundos, contornos,
 * traços e preenchimentos —, nos dois temas, nas regiões de prova (que são do
 * produto: um cliente pode bem ter uma faixa vermelha que é dele) e na
 * entrada do painel, que leva a marca a uma cor.
 */
const VERMELHOS_DO_PRODUTO = ['rgb(194, 40, 28)', 'rgb(242, 87, 63)']; // #c2281c e #f2573f

test('o vermelho da marca do produto não aparece nas regiões nem no painel', async ({
  browser,
}) => {
  for (const tema of ['light', 'dark'] as const) {
    const contexto = await browser.newContext({ colorScheme: tema });
    const page = await contexto.newPage();
    for (const endereco of [
      `${PROVA}/`,
      `${PROVA}/rede/`,
      `${PROVA_MUNICIPIO}/rede/`,
      `${anfitriao(REGIAO)}/rede/`,
      `${PRODUTO}/admin/entrar/`,
    ]) {
      await page.goto(endereco);
      const achados = await page.evaluate((vermelhos) => {
        const propriedades = [
          'color',
          'background-color',
          'border-top-color',
          'border-right-color',
          'border-bottom-color',
          'border-left-color',
          'outline-color',
          'text-decoration-color',
          'fill',
          'stroke',
        ];
        const encontrados: string[] = [];
        for (const e of document.querySelectorAll('body *')) {
          if (!e.checkVisibility({ visibilityProperty: true })) continue;
          const estilo = getComputedStyle(e);
          for (const p of propriedades) {
            const v = estilo.getPropertyValue(p);
            if (vermelhos.some((r) => v.includes(r))) {
              encontrados.push(
                `<${e.tagName.toLowerCase()} class="${e.getAttribute('class') ?? ''}"> ${p}`,
              );
            }
          }
        }
        return encontrados.slice(0, 8);
      }, VERMELHOS_DO_PRODUTO);
      expect(achados, `${tema}: ${endereco}`).toEqual([]);
    }
    await contexto.close();
  }
});
