/**
 * Acessibilidade, verificada em cada alteração.
 *
 * Isto não é boa prática: para uma autoridade de transportes é o Decreto-Lei
 * n.º 83/2018, que transpõe a Diretiva (UE) 2016/2102. Uma violação grave
 * impede a publicação, e é por isso que corre no CI e não à mão.
 *
 * **O axe apanha talvez metade do que interessa.** Não vê se a ordem dos
 * cabeçalhos faz sentido para quem ouve a página, nem se o texto de uma
 * ligação diz para onde vai. Por isso há aqui verificações escritas à mão a
 * seguir às automáticas — e por isso a declaração de acessibilidade diz, sem
 * rodeios, que ninguém com deficiência avaliou isto ainda.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PRODUTO, PROVA } from './anfitrioes';
import {
  buscaDeUmaParagem,
  concelhoComMaisParagens,
  descargasParaConsulta,
  linhaComMaisViagens,
  ondeHaParagens,
  paragemComMaisPartidas,
  tarifasPorConfirmar,
  temAPedido,
  temModo,
} from './dados-da-regiao';

/**
 * Uma página de cada tipo. Não se testam as milhares de páginas de paragem:
 * são todas o mesmo molde, e testar o molde uma vez diz o mesmo em segundos.
 *
 * As que estão aqui são as mais DIFÍCEIS de cada tipo: a paragem com mais
 * partidas, a linha com mais viagens, o concelho com mais paragens. Se o molde
 * parte, parte primeiro onde há mais conteúdo.
 *
 * QUEM AS ESCOLHE SÃO OS DADOS, e não uma lista escrita à mão. Estavam aqui os
 * identificadores de um cliente — e um exemplo cravado tem dois defeitos: a
 * suite é pública (§11.6) e o exemplo envelhece na primeira alteração de
 * horários, passando a medir o molde mais fácil sem ninguém dar por isso.
 * As páginas de um modo que esta região não tenha não entram na lista: não
 * existem, e um 404 não é uma violação de acessibilidade.
 */
const PARAGEM = paragemComMaisPartidas();
const LINHA = linhaComMaisViagens();
const CONCELHO = concelhoComMaisParagens();
const ONDE = ondeHaParagens();
const { busca: BUSCA } = buscaDeUmaParagem();

const PAGINAS: [string, string][] = [
  // A página de produto NÃO é de nenhuma região, tem molde próprio e é a
  // primeira coisa que alguém vê. Se alguma tinha de estar nesta lista, era
  // esta.
  ['produto', `${PRODUTO}/`],
  ['mapa da região', `/`],
  ['a rede', `/rede/`],
  // A demonstração usa o mesmo molde mas leva a faixa que diz que a rede não
  // existe — e uma faixa nova é código novo por verificar.
  ['demonstração', `${PROVA}/`],
  ['como chegar', `/viagem/`],
  ...(temAPedido() ? ([['a pedido', `/a-pedido/`]] as [string, string][]) : []),
  ['paragens', `/rede/paragens/`],
  ['paragem com mais partidas', `/rede/paragens/${PARAGEM.id}/`],
  ['linhas', `/rede/linhas/`],
  ['linha com mais viagens', `/rede/linhas/${LINHA.id}/`],
  ['concelhos', `/rede/concelhos/`],
  ['concelho com mais paragens', `/rede/concelhos/${CONCELHO.id}/`],
  ...(temModo('comboio') ? ([['estações', `/rede/estacoes/`]] as [string, string][]) : []),
  ['tarifário', `/rede/tarifario/`],
  // O ÚNICO MODO COM FORMULÁRIO. A consulta de preços de expresso tem um
  // `select` e um botão, e um formulário é o sítio onde a acessibilidade se
  // perde primeiro — um rótulo a fingir, um alvo pequeno de mais.
  ...(temModo('expresso') ? ([['expressos', `/modos/expresso/`]] as [string, string][]) : []),
  ['avisos', `/avisos/`],
  ['dados abertos', `/dados-abertos/`],
  ['acessibilidade', `/acessibilidade/`],
  ['privacidade', `/privacidade/`],
];

for (const [nome, caminho] of PAGINAS) {
  test(`${nome}: sem violações do axe`, async ({ page }) => {
    await page.goto(caminho);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // A mensagem tem de dizer O QUÊ e ONDE. «2 violações» não chega para
    // ninguém corrigir nada.
    const resumo = r.violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} elementos\n    ${v.nodes[0]?.html?.slice(0, 160)}`,
    );
    expect(resumo, `${caminho}\n  ${resumo.join('\n  ')}`).toEqual([]);
  });
}

test('a ligação de salto leva mesmo ao conteúdo', async ({ page }) => {
  await page.goto(`/`);
  await page.keyboard.press('Tab');
  const focado = page.locator(':focus');
  await expect(focado).toHaveText(/Saltar para o conteúdo/);
  await expect(focado).toHaveAttribute('href', '#conteudo');
  await expect(page.locator('#conteudo')).toBeVisible();
});

test('os cabeçalhos não saltam níveis', async ({ page }) => {
  // O axe não vê isto. Quem ouve a página navega por cabeçalhos, e um h1
  // seguido de h3 faz-lhe perder o fio.
  for (const caminho of [
    `/`,
    `/rede/paragens/${PARAGEM.id}/`,
    `/rede/concelhos/${CONCELHO.id}/`,
    `/dados-abertos/`,
  ]) {
    await page.goto(caminho);
    const niveis = await page.$$eval('h1,h2,h3,h4,h5,h6', (hs) =>
      hs.map((h) => Number(h.tagName[1])),
    );
    expect(niveis[0], `${caminho} tem de começar num h1`).toBe(1);
    for (let i = 1; i < niveis.length; i++) {
      expect(
        niveis[i] - niveis[i - 1],
        `${caminho}: salto de h${niveis[i - 1]} para h${niveis[i]}`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test('há um só h1 por página', async ({ page }) => {
  for (const [, caminho] of PAGINAS) {
    await page.goto(caminho);
    expect(await page.locator('h1').count(), caminho).toBe(1);
  }
});

test('os alvos táteis autónomos têm pelo menos 44 px', async ({ page }) => {
  // Quem usa isto está na rua, de pé, com uma mão. O axe só verifica isto
  // como regra «experimental», por isso mede-se aqui.
  //
  // **A exceção das ligações em linha é da própria norma**, não uma
  // conveniência: o critério 2.5.8 isenta o alvo que «está numa frase ou cujo
  // tamanho é limitado pela entrelinha do texto à volta». Uma ligação no meio
  // de um parágrafo — «este concelho é o tal» — não pode ter 44 px de altura
  // sem estragar a linha, e agrandá-la não ajudaria ninguém: quem lá toca
  // toca-lhe na palavra.
  //
  // O que NÃO é isento é tudo o que está sozinho: itens de lista, botões,
  // navegação, a marca do cabeçalho. Esses medem-se.
  for (const caminho of [
    `/rede/paragens/${PARAGEM.id}/`,
    `/`,
    `/rede/linhas/${LINHA.id}/`,
    `/rede/tarifario/`,
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(caminho);
    const pequenos = await page.$$eval('a, button', (els) =>
      els
        .filter((e) => {
          // Em linha = o pai é um bloco de texto e há texto à volta dela.
          const pai = e.parentElement;
          if (!pai) return true;
          const emProsa = ['P', 'LI', 'TD', 'SPAN', 'STRONG', 'EM'].includes(pai.tagName);
          const temTextoAoLado = (pai.textContent ?? '').trim() !== (e.textContent ?? '').trim();
          return !(emProsa && temTextoAoLado);
        })
        .map((e) => ({
          r: e.getBoundingClientRect(),
          t: (e.textContent ?? '').trim().slice(0, 40),
        }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
        .map(({ r, t }) => `${t || '(sem texto)'} — ${Math.round(r.height)} px`),
    );
    expect(pequenos, `${caminho}: alvos com menos de 44 px:\n  ${pequenos.join('\n  ')}`).toEqual(
      [],
    );
  }
});

test('a página cabe num telemóvel sem deslizar para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const caminho of [
    `/`,
    `/rede/paragens/${PARAGEM.id}/`,
    `/rede/tarifario/`,
    `/rede/concelhos/${CONCELHO.id}/`,
  ]) {
    await page.goto(caminho);
    const transborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(transborda, `${caminho} transborda a 320 px`).toBe(false);
  }
});

test('as direções anunciam a lista de sugestões a quem não a vê', async ({ page }) => {
  // Uma lista que aparece em silêncio não existe para quem usa leitor de ecrã.
  // O padrão de combobox das práticas de ARIA exige isto, e o axe não o
  // verifica: um `div` com `onClick` passa no axe e é inusável.
  await page.goto(`/viagem/`);
  const campo = page.getByRole('combobox', { name: 'De' });
  await expect(campo).toHaveAttribute('aria-expanded', 'false');

  await campo.fill(BUSCA);
  await expect(campo).toHaveAttribute('aria-expanded', 'true');

  const lista = page.getByRole('listbox', { name: /de/i });
  await expect(lista).toBeVisible();
  expect(await lista.getByRole('option').count()).toBeGreaterThan(0);

  // As setas percorrem a lista SEM tirar o foco do campo — senão quem escreve
  // perde o sítio onde estava.
  await campo.press('ArrowDown');
  await expect(campo).toBeFocused();
  const activo = await campo.getAttribute('aria-activedescendant');
  expect(activo, 'a seta tem de apontar a uma opção').toBeTruthy();
  await expect(page.locator(`#${activo}`)).toHaveAttribute('aria-selected', 'true');

  // Enter escolhe, Escape fecha. A primeira opção do campo de partida é «A
  // minha localização» — por isso são DUAS setas até à primeira paragem.
  await campo.press('ArrowDown');
  await campo.press('Enter');
  await expect(campo).toHaveAttribute('aria-expanded', 'false');
  expect(await campo.inputValue()).toContain(BUSCA);
});

test('as direções dizem que o motor está desligado em vez de dizerem que não há viagem', async ({
  page,
}) => {
  // Esta é a diferença entre informar e mentir. «Não há viagem» quando o que
  // há é um motor desligado manda alguém de táxi para uma viagem que existe.
  await page.goto(`/viagem/`);
  const semMotor = await page.getByText(/não está ligado a um motor/i).count();
  const comMotor = await page.getByRole('button', { name: 'Procurar' }).count();
  expect(semMotor > 0 || comMotor > 0, 'ou diz que não há motor, ou deixa procurar').toBe(true);
});

test('a declaração de acessibilidade está no endereço que a lei espera', async ({ page }) => {
  // Artigo 8.º, n.º 2 do DL 83/2018. É o que se verifica num minuto, e é a
  // primeira coisa que alguém procura.
  const r = await page.goto(`/acessibilidade/`);
  expect(r?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText(/Declaração de acessibilidade/);
  await expect(page.getByText(/83\/2018/).first()).toBeVisible();
});

test('o que não se sabe está escrito na página', async ({ page }) => {
  // O §4.4 do briefing: o que falta fica explícito. Um sítio que mostre
  // horários planeados como se fossem tempo real mente por omissão.
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  await expect(page.getByText(/Horários planeados/).first()).toBeVisible();

  await page.goto(`/rede/tarifario/`);
  if (tarifasPorConfirmar() > 0) {
    await expect(page.getByText(/não .*confirmad/i).first()).toBeVisible();
  }

  // A PÁGINA TEM DE DIZER QUAL DOS DOIS CASOS É, e o teste tem de saber qual
  // esperar. Estava a exigir sempre a ressalva — o que presumia que há sempre
  // um ficheiro sem licença aberta —, e partiu-se no dia em que deixou de
  // haver. Zero «para consulta» é o estado a que se quer chegar, não uma
  // falha; o que seria uma falha é a página calar-se sobre os termos.
  await page.goto(`/dados-abertos/`);
  if (descargasParaConsulta() > 0) {
    await expect(page.getByText(/licença aberta declarada/i).first()).toBeVisible();
  } else {
    await expect(page.getByText(/Estes ficheiros reutilizam-se/i).first()).toBeVisible();
  }
});

test('o «Perto de ti» aberto também passa no axe', async ({ page, context }) => {
  // A lista do «Perto de ti» só existe depois de alguém carregar no botão, e
  // um teste que só veja a página fechada não vê metade do componente —
  // as ligações, as distâncias e as horas aparecem todas depois.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(ONDE);
  // Em `/rede/`: a raiz da região passou a ser o mapa, e o «Perto de ti» é
  // o caminho SEM mapa — o equivalente acessível do ponto azul.
  await page.goto(`/rede/`);
  await page.getByRole('button', { name: /paragens perto de mim/i }).click();
  await expect(page.locator('section[aria-labelledby="perto"]')).toContainText(/A seguir:/, {
    timeout: 15_000,
  });

  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.help}`),
    'violações com o bloco aberto',
  ).toEqual([]);
});

test('o sítio diz aos motores de busca para não o indexarem', async ({ request }) => {
  // Enquanto houver preços por confirmar e viagens sem dias, isto não se
  // indexa: a página diz o que não sabe, um resultado de pesquisa não.
  //
  // A proteção da Vercel faz o mesmo do outro lado, mas vive num painel — e
  // um interruptor de painel desliga-se sem deixar rasto. Este está num
  // ficheiro que alguém tem de alterar num commit assinado.
  // Pelo endereço da montra: este pedido é do Node, que não resolve `*.localhost`.
  const r = await request.get(`${PRODUTO}/robots.txt`);
  expect(r.status(), 'não há robots.txt').toBe(200);
  const texto = await r.text();
  expect(texto).toMatch(/User-agent:\s*\*/i);
  expect(texto).toMatch(/Disallow:\s*\//);
});

test('o painel das direções, aberto sobre o mapa, também passa no axe', async ({ page }) => {
  // O painel só existe depois de dois toques, e um teste que veja a página
  // fechada não vê nada dele: os campos, os rádios do «Quando» e os botões
  // aparecem todos depois. É código por verificar até aqui.
  await page.goto(`/`);
  await page.getByRole('combobox', { name: 'Procurar' }).fill(BUSCA);
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Como chegar' }).click();
  await expect(page.getByRole('heading', { name: 'Transportes públicos' })).toBeVisible();

  const r = await new AxeBuilder({ page })
    // A tela do mapa está `aria-hidden` de propósito — ver `Mapa.tsx`. O axe
    // analisa o resto, que é o que se usa.
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.help}`),
    'violações com as direções abertas',
  ).toEqual([]);
});
