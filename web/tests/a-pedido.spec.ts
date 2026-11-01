/**
 * O transporte a pedido.
 *
 * Em boa parte das freguesias de uma região destas é o único transporte
 * público que há, e é o único modo em que a REGRA DE RESERVA vale mais do que
 * o horário: um circuito que ninguém chama não passa. Estes testes verificam
 * que o número de telefone está onde tem de estar — e que o que falta está
 * escrito em vez de ser escondido atrás de uma lista curta.
 *
 * O QUE ESTA REGIÃO TEM A PEDIDO SAI DOS DADOS: o telefone, quantos circuitos
 * são, que zonas há e que concelho ficou sem nenhuma. Uma região sem
 * transporte a pedido não tem esta página — e aí os casos saltam com a razão
 * escrita, em vez de reprovarem por uma página que não devia existir.
 */
import { test, expect } from '@playwright/test';
import { PROVA } from './anfitrioes';
import { aPedido, ehDemonstracao, SEM } from './dados-da-regiao';

const TAP = aPedido();
const TELEFONE = TAP?.reservas.telefone ?? '';
const APRESENTADO = TAP?.reservas.telefone_apresentado ?? '';
/** Zonas que existem e ainda não têm circuito nenhum atribuído — é o que se conta. */
const POR_LEVANTAR = (TAP?.zonas ?? []).filter((z) => z.circuitos.length === 0);
/** Uma zona com circuitos, para a página do concelho dela. */
const ZONA = TAP?.zonas.find((z) => z.circuitos.length > 0 && z.concelho) ?? null;
/** Uma grelha de viagens e uma tabela de partidas: são coisas diferentes. */
const COM_VIAGENS = TAP?.horarios.find((h) => h.quadros.some((q) => q.viagens?.length)) ?? null;
const COM_PARTIDAS = TAP?.horarios.find((h) => h.quadros.some((q) => q.horas?.length)) ?? null;
/**
 * A RESERVA ONLINE QUE NÃO SERVE TUDO: os grupos de circuitos de um concelho
 * cujas zonas a fonte não marca como servidas, e os de um concelho onde
 * marca. Pelo que os dados dizem — a declaração da região e as zonas —, e não
 * pelo nome de um concelho.
 */
const RESTRITA = !!TAP?.reservas.online && !!TAP?.reservas.com_reserva_online?.length;
const zonasDe = (h: NonNullable<typeof TAP>['horarios'][number]) =>
  (TAP?.zonas ?? []).filter((z) =>
    h.zonas?.length
      ? h.zonas.includes(z.id)
      : (!!h.concelho && z.concelho === h.concelho) ||
        z.circuitos.some((c) => c.horario?.grupo === h.id),
  );
const SEM_ONLINE = RESTRITA
  ? (TAP!.horarios.find((h) => {
      const zs = zonasDe(h);
      return zs.length > 0 && zs.every((z) => z.reserva_online !== true);
    }) ?? null)
  : null;
const COM_ONLINE = RESTRITA
  ? (TAP!.horarios.find((h) => zonasDe(h).some((z) => z.reserva_online === true)) ?? null)
  : null;

test('a página diz como se reserva antes de dizer o que existe', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // A ordem é a decisão. Quem não sabe que tem de ligar na véspera fica na
  // paragem à espera de um autocarro que nunca foi pedido.
  await page.goto(`/a-pedido/`);
  const reservar = page.getByRole('heading', { name: 'Como se reserva' });
  const zonas = page.getByRole('heading', { name: 'As zonas' });
  await expect(reservar).toBeVisible();
  await expect(zonas).toBeVisible();

  const y = async (l: typeof reservar) => (await l.boundingBox())!.y;
  expect(await y(reservar), 'a regra de reserva vem antes das zonas').toBeLessThan(await y(zonas));

  // O telefone é uma ligação `tel:`, não texto a fingir — onde há telefone.
  if (TELEFONE) {
    // O da regra, à cabeça; as zonas sem circuitos têm o seu, mais abaixo.
    await expect(
      page.getByRole('link', { name: `Ligar ${APRESENTADO}`, exact: true }).first(),
    ).toHaveAttribute('href', `tel:${TELEFONE}`);
  }
});

test('numa demonstração sem central de reservas, a página diz o que estaria lá', async ({
  page,
}) => {
  test.skip(!TAP, SEM.aPedido);
  test.skip(
    !ehDemonstracao() || !!TELEFONE || !!TAP?.reservas.online,
    'a região tem por onde reservar',
  );
  // Um número inventado é o número de alguém, e uma ligação para uma página
  // de reservas que não existe deixa a caixa a meio. Diz-se o que estaria lá.
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/Isto é uma demonstração: não há central/)).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
});

test('não promete reserva online para o que não a tem', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  test.skip(
    !TAP?.reservas.com_reserva_online?.length,
    'nesta região a reserva online, se houver, serve todos os circuitos',
  );
  // Só quatro serviços a têm. Dizer que a têm todos manda alguém a um sítio
  // onde não encontra o que procura.
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/A reserva online só serve/)).toBeVisible();
});

test('um circuito que a reserva online não serve não oferece «Reservar online»', async ({
  page,
}) => {
  // A página geral dizia que a reserva online só servia alguns serviços, e a
  // página de um circuito que ela não serve mostrava a ligação na mesma: quem
  // a seguisse não conseguia reservar. Fica o telefone, com o horário dele.
  test.skip(!RESTRITA, 'nesta região a reserva online, se houver, serve todos os circuitos');
  test.skip(!SEM_ONLINE, 'todos os grupos de circuitos desta região têm reserva online');
  await page.goto(`/a-pedido/${SEM_ONLINE!.id}/`);
  const faixa = page.locator('main .faixa.a-pedido').first();
  await expect(faixa.getByRole('link', { name: 'Reservar online' })).toHaveCount(0);
  await expect(faixa.getByRole('link', { name: /Ligar/ })).toHaveAttribute(
    'href',
    `tel:${TELEFONE}`,
  );
  await expect(faixa).toContainText(/reserva(m)?-se pelo telefone/);

  test.skip(!COM_ONLINE, 'nenhum grupo de circuitos desta região tem reserva online');
  await page.goto(`/a-pedido/${COM_ONLINE!.id}/`);
  await expect(
    page.locator('main .faixa.a-pedido').first().getByRole('link', { name: 'Reservar online' }),
  ).toHaveAttribute('href', TAP!.reservas.online!);
});

test('conta as zonas por levantar em vez de as esconder', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  test.skip(!POR_LEVANTAR.length, 'nesta região todas as zonas têm os circuitos atribuídos');
  // Uma lista curta a fingir-se de completa é pior do que uma lista curta que
  // se declara incompleta.
  await page.goto(`/a-pedido/`);
  const zonas = page.locator('ul.zonas-sem-circuitos > li');
  await expect(zonas).toHaveCount(POR_LEVANTAR.length);
  // CADA UMA COM O QUE FAZER, e não «ver o concelho» — que mandava para a
  // página do concelho, e essa mandava de volta para aqui (auditoria de
  // 1/11/2026). O telefone serve todas.
  await expect(page.getByText('ver o concelho')).toHaveCount(0);
  if (TAP!.reservas.telefone) {
    for (const z of await zonas.all()) {
      await expect(z.getByRole('link', { name: /^Ligar / })).toBeVisible();
    }
  }
  // E chega-se lá pelo endereço que a página do concelho usa.
  await expect(page.locator(`#z-${POR_LEVANTAR[0].id}`)).toBeVisible();
});

test('o catálogo dos circuitos está lá, com os nomes todos', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Saber que o circuito existe não é saber a que horas passa — mas é o que
  // responde a «há transporte para a minha aldeia?», e é a pergunta que se
  // faz primeiro. Sem isto, quem não vê o nome da terra na lista das zonas
  // conclui que não tem serviço.
  await page.goto(`/a-pedido/`);
  await expect(
    page.getByRole('heading', { name: new RegExp(`Os ${TAP!.circuitos.length} circuitos`) }),
  ).toBeVisible();
  // Dentro da secção do catálogo, e não na página inteira: um circuito que
  // tenha brochura tem o mesmo nome na grelha dela — que é o que se queria,
  // mas não é o que aqui se mede.
  const catalogo = page.locator('section[aria-labelledby="circuitos"]');
  // A lista está fechada: a procura de cima responde mais depressa, e a lista
  // fica para quem prefere ler. Abre-se como quem a quer ler.
  await catalogo.locator('summary').click();
  for (const c of TAP!.circuitos.slice(0, 3)) {
    await expect(catalogo.getByText(c.nome, { exact: false }).first()).toBeVisible();
  }
});

test('não inventa a que zona pertence cada circuito', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  test.skip(!POR_LEVANTAR.length, 'nesta região todas as zonas têm os circuitos atribuídos');
  // A ligação zona→circuito não está na fonte: o formulário do sistema de
  // reservas liga-as quando alguém escolhe uma zona, e o instantâneo tem as
  // duas listas sem a ligação. A página tem de o DIZER — um circuito posto
  // no concelho errado manda alguém reservar onde não deve.
  await page.goto(`/a-pedido/`);
  // A lista delas não põe circuito nenhum por baixo de nenhuma, e a página diz
  // o que fazer: perguntar a hora ao reservar. Que a zona de cada circuito
  // ainda falta diz-se em «Sobre estes dados», que é para quem quer saber.
  await expect(page.locator('ul.zonas-sem-circuitos')).not.toContainText(/circuito/i);
  await expect(page.getByText(/pergunte a hora ao reservar/)).toBeVisible();
  const sobre = page.locator('section[aria-labelledby="donde"] details');
  await sobre.locator('summary').click();
  await expect(sobre).toContainText(/a zona de cada um/);
});

test('o concelho sem zona é declarado, e não omitido', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Um concelho sem separador na página da autoridade não desaparece: não o
  // dizer deixa quem lá mora sem saber se o serviço não existe ou se nós é que
  // não o pusemos.
  test.skip(!TAP?.sem_zona.length, 'nesta região todos os concelhos têm zona');
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/(não tem|Não têm) zona de transporte a pedido/)).toContainText(
    TAP!.sem_zona[0].nome,
  );
});

test('cada concelho com zona leva o telefone na sua própria página', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Obrigar quem está na página do concelho a seguir uma ligação antes de ver
  // o número é pôr um passo entre ele e a viagem.
  test.skip(!ZONA, 'nesta região nenhuma zona tem circuitos atribuídos');
  test.skip(!TELEFONE, 'nesta região não há telefone de reservas');
  await page.goto(`/rede/concelhos/${ZONA!.concelho}/`);
  const seccao = page.locator('section[aria-labelledby="c-a-pedido"]');
  await expect(seccao).toBeVisible();
  await expect(seccao.getByRole('link', { name: /Ligar/ })).toHaveAttribute(
    'href',
    `tel:${TELEFONE}`,
  );
  // «1 circuito na zona …» ou «3 circuitos na zona …»: a primeira zona com
  // circuitos pode ter só um, e o plural fixo reprovava a página certa.
  await expect(seccao).toContainText(
    `${ZONA!.circuitos.length === 1 ? '1 circuito' : `${ZONA!.circuitos.length} circuitos`} na zona ${ZONA!.nome}`,
  );
});

test('a demonstração não ganha uma secção vazia', async ({ page }) => {
  // A Serra da Pedra Alta não declara transporte a pedido, e uma página vazia
  // à espera de dados que não vêm é pior do que página nenhuma.
  const r = await page.goto(`${PROVA}/a-pedido/`);
  expect(r?.status(), 'a prova não pode ter esta página').toBe(404);
});

test('os circuitos com horário mostram a que horas passam', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Era a maior lacuna da região: sabia-se que o circuito existia e não a que
  // horas passa. As brochuras que a autoridade publica têm-no, paragem a
  // paragem, e agora está aqui.
  await page.goto(`/a-pedido/`);
  await expect(page.getByRole('heading', { name: /Os circuitos com horário/ })).toBeVisible();
  // E continuam a ser a pedido: a hora não dispensa a reserva.
  await expect(page.getByText(/estas horas só se cumprem se alguém reservar/)).toBeVisible();
});

test('a grelha de um circuito abre e tem as horas', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  test.skip(!COM_VIAGENS, 'nenhum circuito desta região tem grelha de viagens');
  // Cada grupo de circuitos tem a sua página: todas as tabelas juntas eram
  // 833 kB e dez mil elementos.
  await page.goto(`/a-pedido/`);
  await page.locator('section[aria-labelledby="horarios"]').getByRole('link').first().click();
  await expect(page).toHaveURL(/\/a-pedido\/[^/]+\/$/);
  await page.goto(`/a-pedido/${COM_VIAGENS!.id}/`);
  // A hora como a folha a escreve: «9:06» e «09:06» são a mesma. O resumo diz
  // «a primeira às 7:30, na paragem …», e não «da … às 7:30»: a contração
  // saía «da» antes de nomes masculinos.
  const resumo = page.getByText(/a primeira às \d{1,2}:\d{2}, na paragem /).first();
  await resumo.click();
  await expect(page.getByRole('table').first()).toBeVisible();
});

test('uma tabela de partidas não se faz passar por um percurso', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Há folhetos que listam, para cada terra, as horas a que se pode partir
  // dela — não a ordem por que um autocarro lhes passa. Lidos como percurso,
  // davam um autocarro que faz catorze terras seguidas, e não existe tal
  // autocarro. A página tem de dizer o que a tabela é.
  test.skip(!COM_PARTIDAS, 'nenhum folheto desta região é uma tabela de partidas');
  await page.goto(`/a-pedido/${COM_PARTIDAS!.id}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(COM_PARTIDAS!.nome);
  await expect(page.locator('main')).toContainText('tabela de partidas');
  // UMA TABELA SÓ VEM ABERTA: não há o que escolher, e as horas eram o
  // segundo toque de quem chegava (auditoria de 1/11/2026).
  const quadro = page.locator('details.quadro-de-horario').first();
  if (COM_PARTIDAS!.quadros.length === 1) await expect(quadro).toHaveAttribute('open', '');
  else
    await page
      .getByText(/partidas por dia/)
      .first()
      .click();
  await expect(page.getByText(/e não um percurso/).first()).toBeVisible();
});

test('uma folha transcrita à mão di-lo numa nota neutra, sem dizer quem', async ({ page }) => {
  // O guarda da construção prova que cada hora transcrita está no PDF de
  // origem. Que ela está na PARAGEM CERTA mediu-o alguém com os olhos, uma
  // vez — e quem lê tem direito a saber que foi assim que se soube.
  //
  // QUEM transcreveu é que não sai: a página dizia, em cada circuito, o nome
  // de quem o fez e que estava «a conferir por quem publica» — uma nota de
  // produção a chegar a quem só quer apanhar o autocarro.
  const transcritos = (TAP?.horarios ?? []).filter((h) => h.transcrito_por);
  test.skip(!transcritos.length, 'nenhum circuito desta região foi transcrito à mão');
  // Cada grupo na sua página, e a nota em cada uma das que foram transcritas.
  for (const h of transcritos) {
    await page.goto(`/a-pedido/${h.id}/`);
    const notas = page.getByText(/Transcrito da brochura.*por confirmar com a operadora/);
    await expect(notas).toHaveCount(1);
    await expect(page.locator('main')).not.toContainText(h.transcrito_por!);
    await expect(page.getByText(/Transcrito da brochura por/)).toHaveCount(0);
  }
});

test('escreve-se o nome da terra e a página diz que circuito lá passa', async ({ page }) => {
  // «Há transporte a pedido na minha terra?» obrigava a ler 24 ecrãs de zonas
  // com nomes de contrato. A terra procura-se sem acentos, e a resposta leva
  // ao horário do circuito, já aberto.
  test.skip(!COM_VIAGENS, 'nenhum circuito desta região tem grelha de viagens');
  const quadro = COM_VIAGENS!.quadros.find((q) => q.viagens?.length && q.paragens.length)!;
  const terra = quadro.paragens[quadro.paragens.length - 1];
  await page.goto(`/a-pedido/`);
  const campo = page.getByLabel('Escreva o nome da sua terra');
  await campo.fill(
    terra
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase(),
  );
  const resposta = page.locator('ul.terras-encontradas > li', {
    has: page.getByText(terra, { exact: true }),
  });
  await expect(resposta.first()).toBeVisible();
  await resposta.first().getByRole('link', { name: 'Ver horário' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/a-pedido/[^/]+/`));
  await expect(page.locator('details.quadro-de-horario[open]').first()).toBeVisible();
});

test('uma terra que não está nos dados diz que não está, e dá o telefone', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  await page.goto(`/a-pedido/`);
  await page.getByLabel('Escreva o nome da sua terra').fill('Terra Que Não Existe');
  const resposta = page.getByText(/Não encontrámos «Terra Que Não Existe»/);
  await expect(resposta).toBeVisible();
  if (TELEFONE) await expect(resposta.getByRole('link')).toHaveAttribute('href', `tel:${TELEFONE}`);
});
