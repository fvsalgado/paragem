/**
 * AS DIREÇÕES.
 *
 * Duas metades, e a divisão é de propósito.
 *
 * A primeira não precisa de motor nenhum: é a forma do ecrã — o painel que
 * sobe sobre o mapa, o destino que vem do endereço, o «Agora» que poupa a data.
 * Corre sempre, porque é o que se partiu ao mudar isto de sítio.
 *
 * A segunda são as VIAGENS QUE A REGIÃO DECLARA (`motor.viagens_de_prova`, o
 * §9 do briefing): as pontas e o dia saem dos dados, e uma região que não
 * declare nenhuma salta — a dizer porquê, em vez de fingir que verificou.
 */
import { test, expect, type Page } from '@playwright/test';

import {
  caixaDaRegiao,
  diaComMaisServico,
  duasParagens,
  fusoDaRegiao,
  modosDisponiveis,
  ondeHaParagens,
  paragemComMaisPartidas,
  paragemPerto,
  temMosaicos,
  umaLigacaoSoNoutroDia,
  umaPartidaFutura,
  viagensDeProva,
  SEM,
} from './dados-da-regiao';
import { NOME_DOS_MODOS } from '../src/lib/formato.ts';

/**
 * Um dia útil com serviço. O mesmo critério do teste do motor e do oráculo: os
 * dados é que decidem, e não uma data escrita aqui — que passa a passado.
 */
const DIA = process.env.PARAGEM_DIA ?? diaComMaisServico() ?? '';
const PARAGEM = paragemComMaisPartidas();
const DUAS = duasParagens();

async function escolher(page: Page, etiqueta: string, texto: string) {
  const campo = page.getByRole('combobox', { name: etiqueta, exact: true });
  await campo.fill(texto);
  const lista = page.getByRole('listbox', { name: new RegExp(etiqueta, 'i') });
  await expect(lista).toBeVisible();
  await lista.getByRole('option').first().click();
}

/** O dia e a hora vivem atrás da etiqueta «Partir agora» — é esse o ponto. */
async function marcarHora(page: Page, dia: string, hora: string) {
  await page.getByRole('button', { name: /^Partir/ }).click();
  await page.getByRole('radio', { name: 'Noutra altura' }).check();
  await page.locator('#data').fill(dia);
  await page.locator('#hora').fill(hora);
  // Fecha o painel do «quando», para não tapar os resultados.
  await page.getByRole('button', { name: /^Partir/ }).click();
}

// --- a forma do ecrã, sem motor ------------------------------------------

test('«Partir agora» é uma etiqueta, e o dia só aparece a quem o pede', async ({ page }) => {
  // Obrigar a preencher a data para sair JÁ era o passo que fazia isto
  // parecer um formulário de uma transportadora e não um mapa. E um grupo de
  // rádios sempre aberto ocupava meio painel para uma pergunta que quase
  // ninguém faz.
  await page.goto('/viagem/');
  await expect(page.getByRole('button', { name: 'Partir agora' })).toBeVisible();
  await expect(page.locator('#data')).toHaveCount(0);

  await page.getByRole('button', { name: 'Partir agora' }).click();
  await expect(page.getByRole('radio', { name: 'Agora' })).toBeChecked();
  await page.getByRole('radio', { name: 'Noutra altura' }).check();
  await expect(page.locator('#data')).toBeVisible();
  await expect(page.locator('#hora')).toBeVisible();
});

test('os campos de dia e de hora têm o tamanho de um campo, e não o de um rádio', async ({
  page,
}) => {
  /**
   * ISTO ESTEVE PARTIDO EM PRODUÇÃO, e os testes não deram por isso.
   *
   * O CSS dizia `.quando-escolha input { width: 1.25rem; height: 1.25rem }`,
   * pensado para os rádios «Agora / Noutra altura». Mas o mesmo <fieldset>
   * tem lá dentro os campos de dia e de hora, e o seletor não distinguia: os
   * dois ficavam com 20 px de lado. No telemóvel sobrava a setinha do seletor
   * nativo e a data não cabia — parecia um campo vazio e avariado.
   *
   * E os testes passavam, porque o `fill()` do Playwright escreve num campo
   * de 20 px tão bem como num de 200. Preencher não é ver.
   *
   * Por isso este teste MEDE A CAIXA. 44 px é o mínimo do §4.5, e vale para
   * um campo que se toca para escrever tanto como para um botão.
   */
  await page.goto('/viagem/');
  await page.getByRole('button', { name: /^Partir/ }).click();
  await page.getByRole('radio', { name: 'Noutra altura' }).check();

  for (const id of ['#data', '#hora']) {
    const caixa = await page.locator(id).boundingBox();
    expect(caixa, `${id} tem de estar visível`).not.toBeNull();
    expect(caixa!.height, `${id} mais baixo do que o alvo mínimo`).toBeGreaterThanOrEqual(44);
    // Uma data escrita por extenso não cabe em 20 px, nem em 60.
    expect(caixa!.width, `${id} demasiado estreito para o que mostra`).toBeGreaterThanOrEqual(100);
  }

  // E o campo abre já preenchido: quem escolhe «Noutra altura» quer mudar a
  // hora, não escrever a data de hoje do zero.
  await expect(page.locator('#data')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.locator('#hora')).toHaveValue(/^\d{2}:\d{2}$/);
});

test('trocar com um dos lados vazio deixa esse lado vazio, e com o foco', async ({ page }) => {
  // Trocava o nome para cima e deixava-o também em baixo: os dois campos com o
  // mesmo nome, um deles vazio por dentro — a folha continuava a pedir o
  // destino —, e escrever por cima colava as letras ao nome antigo.
  await page.goto(`/viagem/?para=${encodeURIComponent(PARAGEM.nome)}`);
  const de = page.getByRole('combobox', { name: 'De', exact: true });
  const para = page.getByRole('combobox', { name: 'Para', exact: true });
  await expect(para).toHaveValue(PARAGEM.nome);
  await expect(de).toHaveValue('');

  await page.getByRole('button', { name: 'Trocar de e para' }).click();
  await expect(de).toHaveValue(PARAGEM.nome);
  await expect(para).toHaveValue('');
  // O foco vai para o campo que falta: é o que se escreve a seguir.
  await expect(para).toBeFocused();
  await para.pressSequentially('ab');
  await expect(para).toHaveValue('ab');
});

test('«A minha localização» é a primeira sugestão, e não um botão ao lado', async ({ page }) => {
  // É onde o Maps a põe, e é onde ela pertence. E continua a EXIGIR um
  // toque: a página não pede a localização a ninguém sozinha.
  await page.goto('/viagem/');
  const de = page.getByRole('combobox', { name: 'De', exact: true });
  await de.click();
  const lista = page.getByRole('listbox', { name: /de/i });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole('option').first()).toHaveText(/A minha localização/);

  // E o campo de chegada NÃO a oferece: ninguém vai «para a minha localização».
  const para = page.getByRole('combobox', { name: 'Para', exact: true });
  await para.click();
  await expect(page.getByRole('listbox', { name: /para/i })).toBeHidden();
});

test('o destino vem do endereço, em vez de se escrever outra vez', async ({ page }) => {
  // É a ligação que as páginas de paragem usam. Antes disto levava a um
  // formulário vazio — e quem carregou em «como chegar» a uma paragem tinha de
  // escrever o nome dela outra vez.
  await page.goto(`/viagem/?para=${encodeURIComponent(PARAGEM.nome)}`);
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(PARAGEM.nome);
});

test('a página de uma paragem leva às direções com o destino preenchido', async ({ page }) => {
  // A ligação está no topo, junto do nome — estava no fim da página, a
  // 19 000 px na paragem mais servida.
  await page.goto(`/rede/paragens/${PARAGEM.id}/`);
  const nome = await page.locator('h1').innerText();
  await page.getByRole('link', { name: /como chegar aqui/i }).click();
  await expect(page).toHaveURL(/\/viagem\/\?para=/);
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(nome);
});

/** Um parâmetro do endereço atual — lido, e não comparado como texto codificado. */
const doEndereco = (page: Page, nome: string) => new URL(page.url()).searchParams.get(nome);

test('no mapa, «Como chegar aqui» abre as direções ali, e o endereço acompanha', async ({
  page,
}) => {
  // Sem mosaicos não há mapa onde as abrir: o início é a vista sem mapa, que
  // tem os seus próprios testes (`sem-mapa.spec.ts`).
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto('/');
  const procura = page.getByRole('combobox', { name: 'Procurar' });
  await procura.fill(PARAGEM.nome);
  await page.getByRole('listbox').getByRole('option').first().click();

  // O CARTÃO FICA NO ENDEREÇO (P2-027): é o que o «voltar» do telemóvel
  // percorre, e o que se copia para mandar a alguém.
  await expect.poll(() => doEndereco(page, 'ponto')).toBe(PARAGEM.id);
  // Uma marca no `window`: uma navegação a sério apagava-a. Escrever no
  // endereço não é mudar de página — o mapa não se carrega outra vez.
  await page.evaluate(() => ((window as unknown as { marca: number }).marca = 1));

  await page.getByRole('button', { name: 'Como chegar aqui' }).click();
  await expect.poll(() => doEndereco(page, 'para')).toBe(PARAGEM.id);
  expect(await page.evaluate(() => (window as unknown as { marca?: number }).marca)).toBe(1);
  await expect(page.getByRole('heading', { name: 'Transportes públicos' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(PARAGEM.nome);
  // O foco vai para o campo que falta: é o que se escreve a seguir.
  await expect(page.getByRole('combobox', { name: 'De', exact: true })).toBeFocused();
  // Duas cartas, e o mapa entre elas: é a forma que se pediu.
  await expect(page.locator('.cartao-de-cima')).toBeVisible();
  await expect(page.locator('.folha')).toBeVisible();

  // O «VOLTAR» FECHA UMA CAMADA DE CADA VEZ, e não sai da aplicação: das
  // direções para o cartão, do cartão para o mapa.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Transportes públicos' })).toBeHidden();
  await expect(page.locator('section.cartao-de-baixo h2')).toHaveText(PARAGEM.nome);
  await page.goBack();
  await expect(page.locator('section.cartao-de-baixo')).toHaveCount(0);
  expect(doEndereco(page, 'ponto')).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { marca?: number }).marca)).toBe(1);
});

test('«Partir daqui» põe o ponto na partida, e o foco no destino', async ({ page }) => {
  // O cartão só sabia pôr o ponto no DESTINO (P2-001): quem estava na
  // paragem e queria ir a outro lado tinha de a escrever outra vez.
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto(`/?ponto=${encodeURIComponent(PARAGEM.id)}`);
  await expect(page.locator('section.cartao-de-baixo h2')).toHaveText(PARAGEM.nome);
  // Os dois gestos estão à cabeça do cartão, antes das horas que chegam.
  const gestos = page.locator('section.cartao-de-baixo .cartao-accoes').first();
  await expect(gestos.getByRole('button')).toHaveText(['Como chegar aqui', 'Partir daqui']);

  await page.getByRole('button', { name: 'Partir daqui' }).click();
  await expect(page.getByRole('combobox', { name: 'De', exact: true })).toHaveValue(PARAGEM.nome);
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toBeFocused();
  await expect.poll(() => doEndereco(page, 'de')).toBe(PARAGEM.id);
});

test('o Esc fecha o cartão, e o foco volta à procura', async ({ page }) => {
  // O cartão abria em silêncio, com o foco deixado na procura, e o Esc não
  // fechava nada (P3-014). Agora o título recebe o foco — e é lido —, e o
  // Esc devolve-o à caixa de onde se partiu.
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto('/');
  const procura = page.getByRole('combobox', { name: 'Procurar' });
  await procura.fill(PARAGEM.nome);
  await page.getByRole('listbox').getByRole('option').first().click();
  const titulo = page.locator('section.cartao-de-baixo h2');
  await expect(titulo).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('section.cartao-de-baixo')).toHaveCount(0);
  await expect(procura).toBeFocused();
});

test('a viagem escolhida fica no endereço, e o endereço volta a abri-la', async ({ page }) => {
  // É o endereço que se partilha (P2-027): «a viagem das 9h» manda-se a
  // alguém, e abre igual do outro lado.
  test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
  test.skip(!DIA, 'a região não tem dias com serviço');
  const [a, b] = DUAS!;
  await page.goto('/viagem/');
  await escolher(page, 'De', a.nome);
  await escolher(page, 'Para', b.nome);
  await expect.poll(() => doEndereco(page, 'de')).toBe(a.id);
  expect(doEndereco(page, 'para')).toBe(b.id);
  // «Agora» não é uma hora que se guarde: quem abrir isto amanhã quer agora.
  expect(doEndereco(page, 'hora')).toBeNull();

  await marcarHora(page, DIA, '09:00');
  await expect.poll(() => doEndereco(page, 'hora')).toBe('09:00');
  expect(doEndereco(page, 'dia')).toBe(DIA);

  const outra = await page.context().newPage();
  await outra.goto(page.url());
  await expect(outra.getByRole('combobox', { name: 'De', exact: true })).toHaveValue(a.nome);
  await expect(outra.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(b.nome);
  await expect(outra.getByRole('button', { name: /^Partir às 09:00/ })).toBeVisible();
});

test('um destino por coordenadas chega com o nome que se lhe deu', async ({ page }) => {
  // A forma que a agenda cultural usa para o «Como chegar» de um evento
  // (`docs/ENDERECOS.md`): um ponto, e o nome a mostrar. É um ponto e não
  // uma paragem — a pé até à mais perto —, e o nome é texto, nunca HTML.
  const c = caixaDaRegiao();
  test.skip(!c, 'a região não declara a caixa');
  const lat = ((c!.lat_min + c!.lat_max) / 2).toFixed(5);
  const lon = ((c!.lon_min + c!.lon_max) / 2).toFixed(5);
  const nome = 'Feira do Livro <b>no largo</b>';
  await page.goto(`/viagem/?para=${lat},${lon}&nome=${encodeURIComponent(nome)}`);
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(nome);
  await expect(page.locator('b', { hasText: 'no largo' })).toHaveCount(0);
});

test('um destino longe da região diz-se, em vez de «sem viagem»', async ({ page }) => {
  // Coordenadas trocadas, ou um evento noutra terra: dizer «não há viagem»
  // escondia que o problema é o sítio, e não o horário.
  const c = caixaDaRegiao();
  test.skip(!c, 'a região não declara a caixa');
  await page.goto(`/viagem/?para=${(c!.lat_max + 2).toFixed(5)},${c!.lon_min}&nome=Longe`);
  await expect(page.getByText(/O destino pedido, «Longe», fica longe de mais/)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue('');
});

test('sem ligação no dia pedido, a página diz qual é a próxima — e mostra-a', async ({ page }) => {
  // «Sem viagem neste dia» a quem pergunta ao domingo por uma aldeia com
  // carreira nos dias úteis era dizer-lhe que não pode ir à cidade (P2-003).
  const caso = umaLigacaoSoNoutroDia();
  test.skip(!caso, 'a região não tem uma ligação que falte num dia e exista noutro');
  await page.goto(
    `/viagem/?de=${encodeURIComponent(caso!.de.id)}&para=${encodeURIComponent(caso!.para.id)}&dia=${caso!.dia}`,
  );
  const resposta = page.locator('[aria-live="polite"]').last();
  await expect(resposta.getByRole('heading', { name: /^A próxima ligação é/ })).toBeVisible({
    timeout: 30_000,
  });
  // E as opções desse dia estão lá, com a recomendada aberta.
  await expect(page.locator('article.opcao').first()).toBeVisible();
  await expect(page.locator('article.opcao.escolhida')).toHaveCount(1);
  await expect(resposta).not.toContainText('Sem viagem a partir desta hora');
});

test('trocar de e para inverte mesmo a viagem', async ({ page }) => {
  test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
  const [a, b] = DUAS!;
  await page.goto('/viagem/');
  await escolher(page, 'De', a.nome);
  await escolher(page, 'Para', b.nome);
  await page.getByRole('button', { name: 'Trocar de e para' }).click();
  expect(await page.getByRole('combobox', { name: 'De', exact: true }).inputValue()).toBe(b.nome);
  expect(await page.getByRole('combobox', { name: 'Para', exact: true }).inputValue()).toBe(a.nome);
});

// --- contra um motor a sério ---------------------------------------------

/**
 * AS VIAGENS DE ACEITAÇÃO DA REGIÃO, PEDIDAS PELA INTERFACE.
 *
 * Isto esteve atrás de um `skip` que só as corria com um motor de viagens
 * configurado — e como o motor nunca existiu em produção, corriam num estado
 * que nunca se entregou.
 *
 * Deixou de fazer sentido: o planeador vai dentro do sítio, e a build dos
 * testes é agora a mesma que se publica. Estas viagens têm de responder
 * sempre, sem servidor nenhum do outro lado.
 *
 * QUAIS SÃO É DA REGIÃO: são as que ela declara em `motor.viagens_de_prova`, e
 * é o motor que responde às mesmas. Uma ponta declara-se por COORDENADAS, e o
 * que a caixa de procura precisa é de um NOME — por isso cada ponta se
 * converte na paragem mais próxima dela. Uma ponta que não tenha paragem a
 * menos de 400 m não é uma viagem que esta interface saiba pedir, e salta.
 */
const VIAGENS = viagensDeProva().map((v) => ({
  nome: v.nome,
  de: paragemPerto(v.de.lat, v.de.lon),
  para: paragemPerto(v.para.lat, v.para.lon),
}));

test.describe('as viagens de prova da região, pela interface', () => {
  if (VIAGENS.length === 0) {
    test('a região declara viagens de prova', () => {
      test.skip(true, `${SEM.regiaoReal} — nenhuma viagem declarada em motor.viagens_de_prova`);
    });
  }
  for (const { nome, de, para } of VIAGENS) {
    test(`${nome}: a página devolve um itinerário`, async ({ page }) => {
      test.skip(!de || !para, `${nome}: uma das pontas não tem paragem a menos de 400 m`);
      await page.goto('/viagem/');
      await escolher(page, 'De', de!.nome);
      await escolher(page, 'Para', para!.nome);
      await marcarHora(page, DIA, '09:00');
      // Não se carrega em nada: com as duas pontas e a hora, procura sozinho.

      // A RESPOSTA CHEGA, E ANUNCIADA. Ou são opções, ou é a explicação de
      // não haver nenhuma — o que não pode é ficar em branco.
      const opcoes = page.locator('article.opcao');
      const resposta = page.locator('[aria-live="polite"]').last();
      await expect(resposta).toContainText(/opção|opções|Sem viagem|grandes desvios/, {
        timeout: 30_000,
      });

      // SEM VIAGEM NESTE DIA NÃO É DEFEITO DA PÁGINA, e é preciso dizê-lo
      // aqui: o dia é um só para todas as viagens — o de mais serviço da rede
      // —, e há ligações que só correm noutro. A que tem uma viagem por dia em
      // férias escolares é o caso conhecido. Quem exige que a REDE se planeie
      // é o teste do motor, que pergunta a cada ligação no dia dela e distingue
      // uma lacuna do calendário de um defeito nosso; o que se mede aqui é a
      // interface, e a interface tem de explicar-se em vez de ficar calada.
      if ((await opcoes.count()) === 0) {
        // SÓ COM VOLTAS GRANDES também é uma resposta: os caminhos existem, e
        // ficam a um toque — mas não se abrem sozinhos (P2-009).
        const desvios = resposta.getByRole('heading', {
          name: 'Só há caminhos com grandes desvios',
        });
        if (await desvios.isVisible()) return;
        await expect(
          resposta.getByRole('heading', { name: 'Sem viagem a partir desta hora' }),
        ).toBeVisible();
        await expect(resposta).toContainText(/nem todos os sítios têm ligação/);
        return;
      }

      // Plausível, e não «existe»: tem de usar transporte, não ser só a pé.
      const primeiro = await opcoes.first().innerText();
      expect(primeiro, `${nome}: o itinerário tem de usar transporte público`).toMatch(
        /Autocarro|Comboio/,
      );
      expect(primeiro, `${nome}: tem de mostrar as horas`).toMatch(/\d{1,2}:\d{2}/);
    });
  }

  test('quando não há caminho, a página explica-se em vez de ficar calada', async ({ page }) => {
    // Qualquer par serve: o que se mede é que a página NUNCA fica calada —
    // ou dá opções, ou diz que não há e porquê.
    test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
    await page.goto('/viagem/');
    await escolher(page, 'De', DUAS![1].nome);
    await escolher(page, 'Para', DUAS![0].nome);
    await marcarHora(page, DIA, '09:00');

    // Ou encontra caminho, ou diz que não há E porque é que pode não haver. O
    // que não pode é ficar em branco: uma página que não diz nada deixa quem
    // procura a achar que se enganou a escrever.
    const resposta = page.locator('[aria-live="polite"]').last();
    await expect(resposta).toContainText(/opção|opções|Sem viagem|grandes desvios/, {
      timeout: 30_000,
    });

    // E o vazio manda para as páginas das DUAS pontas — e não para o índice
    // por letra, onde era preciso procurar outra vez a paragem que estava
    // escrita no campo de cima. Já não culpa o calendário escolar: está
    // transcrito, e a frase envelheceu a mentir.
    if (await page.getByRole('heading', { name: 'Sem viagem a partir desta hora' }).isVisible()) {
      await expect(resposta).toContainText(/nem todos os sítios têm ligação/);
      await expect(resposta).not.toContainText(/calendário escolar/);
      await expect(resposta.getByRole('link', { name: /^Horário de / }).first()).toBeVisible();
    }
  });

  test('um dia fora dos horários carregados diz isso, e não «sem viagem»', async ({ page }) => {
    // «Não há autocarro» e «não temos o horário desse dia» são respostas
    // opostas para quem planeia: a primeira faz desistir. E o campo do dia
    // traz os limites do período, para o seletor nem os oferecer.
    test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
    await page.goto('/viagem/');
    await escolher(page, 'De', DUAS![1].nome);
    await escolher(page, 'Para', DUAS![0].nome);
    await marcarHora(page, '2099-01-05', '09:00');
    const resposta = page.locator('[aria-live="polite"]').last();
    await expect(
      resposta.getByRole('heading', { name: 'Não temos os horários desse dia' }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(resposta).toContainText(/Os horários carregados vão de \d{2}\/\d{2}\/\d{4} a/);
    await page.getByRole('button', { name: /^Partir/ }).click();
    await expect(page.locator('#data')).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/);
  });

  test('sem rede, a grelha que não chegou não passa por «não há horários»', async ({ page }) => {
    // Com os dados móveis a falhar — o caso normal no interior —, a página
    // dizia «esta região ainda não tem horários». Não era verdade: o que
    // faltava era a ligação, e a resposta certa é deixar tentar outra vez.
    test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
    let cortar = true;
    await page.route('**/viagens.json', (r) => (cortar ? r.abort() : r.continue()));
    await page.goto('/viagem/');
    await escolher(page, 'De', DUAS![1].nome);
    await escolher(page, 'Para', DUAS![0].nome);
    await marcarHora(page, DIA, '09:00');
    await expect(page.getByText('Não foi possível descarregar os horários')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/ainda não tem horários/)).toHaveCount(0);

    cortar = false;
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    const resposta = page.locator('[aria-live="polite"]').last();
    await expect(resposta).toContainText(/opção|opções|Sem viagem|grandes desvios/, {
      timeout: 30_000,
    });
    await expect(page.getByText('Não foi possível descarregar os horários')).toHaveCount(0);
  });

  test('no mapa, a opção recomendada fica logo desenhada', async ({ page }) => {
    // Cinco cartões e um mapa vazio é fazer a pergunta outra vez. E a que se
    // abre é a RECOMENDADA, não a primeira da lista (P2-009): por ordem de
    // partida, a primeira chegou a ser uma volta de 260 km.
    const v = VIAGENS.find((x) => x.de && x.para);
    test.skip(!v, SEM.regiaoReal);
    test.skip(!temMosaicos(), SEM.mosaicos);
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Procurar' }).fill(v!.para!.nome);
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'Como chegar aqui' }).click();

    await escolher(page, 'De', v!.de!.nome);
    await marcarHora(page, DIA, '09:00');

    const opcoes = page.locator('article.opcao');
    await expect(opcoes.first()).toBeVisible({ timeout: 30_000 });
    const escolhida = page.locator('article.opcao.escolhida');
    await expect(escolhida).toHaveCount(1);
    await expect(escolhida.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
    // E a fila dos modos diz quanto demora cada um: é a primeira resposta à
    // primeira pergunta, que é se vale a pena esperar pelo autocarro.
    await expect(page.locator('.modos button.activo')).toContainText(/min|h/);
  });

  test('escolher uma opção desce a folha, e a pega volta a subi-la', async ({ page }) => {
    // Escolher uma opção é pedir para a VER. Uma folha de meio ecrã por cima
    // do percurso que se acabou de escolher é uma promessa por cumprir. No
    // Maps arrasta-se a folha; aqui a pega também é um botão, porque um
    // arrasto não funciona com teclado nem com comando de voz.
    const v = VIAGENS.find((x) => x.de && x.para);
    test.skip(!v, SEM.regiaoReal);
    test.skip(!temMosaicos(), SEM.mosaicos);
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Procurar' }).fill(v!.para!.nome);
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'Como chegar aqui' }).click();
    await escolher(page, 'De', v!.de!.nome);
    await marcarHora(page, DIA, '09:00');

    const folha = page.locator('section.folha');
    const opcoes = page.locator('article.opcao');
    await expect(opcoes.first()).toBeVisible({ timeout: 30_000 });
    await expect(folha).not.toHaveClass(/encolhida/);

    const alto = async () => (await folha.boundingBox())!.height;
    const aberta = await alto();

    // Uma que não esteja já aberta: escolher a aberta não muda nada.
    await page.locator('article.opcao:not(.escolhida)').first().getByRole('button').first().click();
    await expect(folha).toHaveClass(/encolhida/);
    expect(await alto(), 'descida, a folha tem de ocupar menos ecrã').toBeLessThan(aberta);

    // E o cartão de cima continua a dizer que viagem está no mapa.
    const cima = page.locator('.cartao-de-cima');
    await expect(cima.getByRole('combobox', { name: 'De', exact: true })).toHaveValue(v!.de!.nome);
    await expect(cima.getByRole('combobox', { name: 'Para', exact: true })).toHaveValue(
      v!.para!.nome,
    );

    await page.getByRole('button', { name: /Ver as opções/ }).click();
    await expect(folha).not.toHaveClass(/encolhida/);
  });
});

// --- sem motor nenhum, que é o caso normal --------------------------------

test.describe('com o relógio antes da primeira partida', () => {
  test.use({ timezoneId: fusoDaRegiao() });

  test('sem motor de viagens, as direções respondem na mesma', async ({ page }) => {
    /**
     * O TESTE QUE JUSTIFICA A MUDANÇA TODA.
     *
     * Esta build não tem `NEXT_PUBLIC_PARAGEM_OTP_*` nenhum — é exatamente o
     * que vai para o ar. Antes, isto era uma caixa de procura que aceitava a
     * viagem e falhava sempre, e foi assim que esteve em produção.
     *
     * Agora responde o planeador que corre no próprio navegador, a partir da
     * grelha horária de 321 kB. Se este teste passar, o servidor de viagens
     * deixou de ser preciso.
     *
     * O RELÓGIO VAI PARA ANTES DA PRIMEIRA PARTIDA. A procura parte de «agora»,
     * e numa rede pequena a única viagem entre as duas paragens pode ser de
     * manhã: corrido às 7h17, o teste via «Sem viagem a partir desta hora» —
     * que é a resposta certa a essa hora, e não a que se está a medir.
     */
    test.skip(!DUAS, 'a região não tem duas paragens para uma viagem');
    const [a, b] = DUAS!;
    const partida = umaPartidaFutura();
    if (partida) await page.clock.setFixedTime(partida.quando);
    await page.goto(`/viagem/?de=${encodeURIComponent(a.nome)}&para=${encodeURIComponent(b.nome)}`);

    // A procura arranca sozinha quando os dois campos vêm preenchidos.
    const opcoes = page.locator('ul.opcoes li');
    await expect(opcoes.first()).toBeVisible({ timeout: 20_000 });
    expect(await opcoes.count()).toBeGreaterThan(0);

    // E cada opção diz a que horas parte e a que horas chega.
    await expect(page.getByText(/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/).first()).toBeVisible();

    // O QUE É ESTIMADO DIZ-SE. Sem ruas, o troço a pé é uma conta e não um
    // percurso, e quem lê «6 min a pé» tem o direito de saber a diferença.
    await expect(page.getByText(/estimadas em linha reta/)).toBeVisible();

    // E não se oferece o que não se sabe responder: «a pé» e «de bicicleta»
    // são a pergunta «por onde», e essa não se responde sem as ruas.
    const modos = page.getByRole('group', { name: 'Como ir' });
    await expect(modos).toBeVisible();
    expect(await modos.getByRole('button').count()).toBe(1);
  });
});

// --- o ecrã de abertura ---------------------------------------------------

test.describe('a abertura de uma região', () => {
  // A ABERTURA COM MAPA. Uma região sem mosaicos abre na vista sem mapa, e
  // essa tem os testes dela em `sem-mapa.spec.ts`.
  test.skip(!temMosaicos(), SEM.mosaicos);

  test('o mapa ocupa o ecrã, e a navegação está no menu', async ({ page }) => {
    /**
     * A faixa do sítio saiu da frente — eram 120 px de um telemóvel a repetir
     * «Paragem.pt · <a região> · Mapa» a quem já está no mapa.
     *
     * **Tirar não é esconder.** Um sítio de uma autoridade pública não pode
     * ficar sem navegação porque ficou mais bonito: o tarifário, os avisos e
     * a declaração de acessibilidade são obrigações. Este teste exige as duas
     * coisas ao mesmo tempo — a faixa fora, e tudo alcançável.
     */
    await page.goto('/');
    await expect(page.locator('.cabecalho')).toBeHidden();

    await page.getByRole('button', { name: /Abrir o menu/i }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    for (const nome of ['A rede', 'Tarifário', 'Avisos', 'Dados abertos', 'Acessibilidade']) {
      await expect(menu.getByRole('link', { name: new RegExp(nome) })).toBeVisible();
    }

    // O Escape fecha, e o foco volta ao botão que o abriu. É o que um
    // `<dialog>` com `showModal()` dá de graça — e é por isso que é um.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: /Abrir o menu/i })).toBeFocused();
  });

  test('os modos da região aparecem em círculos, e levam à página de cada um', async ({ page }) => {
    await page.goto('/');
    const abertura = page.getByRole('region', { name: 'Por onde começar' });
    await expect(abertura).toBeVisible();
    await expect(abertura.getByRole('heading', { name: /^O que há / })).toBeVisible();

    // Os que a região declara, e não uma lista escrita no código.
    const seus = modosDisponiveis();
    for (const m of seus) {
      await expect(
        abertura.getByRole('link', { name: NOME_DOS_MODOS[m] ?? m }).first(),
      ).toBeVisible();
    }
    // E o círculo leva à página do modo — num que tenha página própria.
    const comPagina = seus.find((m) => !['autocarro', 'comboio'].includes(m));
    test.skip(!comPagina, SEM.modo('nenhum com página própria'));
    await abertura
      .getByRole('link', { name: NOME_DOS_MODOS[comPagina!] ?? comPagina! })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/modos/${comPagina}/?$`));
  });

  test('«Para onde vais?» abre as direções com o foco no destino', async ({ page }) => {
    // A primeira pergunta da página inicial (§6), onde o polegar chega. A
    // nota que lá estava mandava escrever primeiro DE ONDE se parte — o
    // contrário do que o cartão fazia (P2-001).
    await page.goto('/');
    await page.getByRole('button', { name: 'Para onde vais?' }).click();
    await expect(page.getByRole('combobox', { name: 'Para', exact: true })).toBeFocused();
    // E a partida oferece logo «A minha localização», sem a pedir sozinha.
    const de = page.getByRole('combobox', { name: 'De', exact: true });
    await de.click();
    await expect(page.getByRole('listbox', { name: /de/i }).getByRole('option').first()).toHaveText(
      /A minha localização/,
    );
  });

  test('«Paragens perto de mim» diz no mapa o que passa ali perto', async ({ page, context }) => {
    // O botão da localização só punha um ponto azul, e o «Perto de ti» vivia
    // em «A rede» (P2-016). As duas portas dão agora ao mesmo sítio: a folha
    // diz que paragens estão perto e o que passa nelas, e tocar numa abre-a.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(ondeHaParagens());
    const partida = umaPartidaFutura();
    if (partida) await page.clock.setFixedTime(partida.quando);
    await page.goto('/');
    await page.getByRole('button', { name: 'Paragens perto de mim' }).click();

    const bloco = page.locator('section.perto-no-mapa');
    const perto = bloco.locator('button.perto-paragem');
    await expect(perto.first()).toBeVisible({ timeout: 15_000 });
    expect(await perto.count(), 'a folha é pequena: três chegam').toBeLessThanOrEqual(3);
    // A distância, em metros — e não num mapa que é preciso saber ler.
    await expect(perto.first()).toContainText(/\d+\s?m|\d+,\d\s?km/);
    if (partida) {
      // Cada partida diz PARA ONDE VAI (P2-017): numa paragem com os dois
      // sentidos, o número da linha sozinho não diz qual é o nosso.
      await expect(bloco.locator('.perto-destino').first()).toHaveText(/^(para \S|circular)/, {
        timeout: 15_000,
      });
    }

    const nome = (await perto.first().locator('.perto-nome').innerText()).trim();
    await perto.first().click();
    await expect(page.locator('section.cartao-de-baixo h2')).toHaveText(nome);
  });

  test('a caixa de procura diz o que se escreve nela', async ({ page }) => {
    // Uma caixa a flutuar sobre o mapa, vazia e sem etiqueta à vista, não diz
    // a ninguém para que serve. A etiqueta continua lá para o leitor de ecrã.
    await page.goto('/');
    const caixa = page.getByRole('combobox', { name: 'Procurar' });
    await expect(caixa).toHaveAttribute('placeholder', /Procurar paragem ou sítio/);
  });
});
