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
import { aPedido, SEM } from './dados-da-regiao';

const TAP = aPedido();
const TELEFONE = TAP?.reservas.telefone ?? '';
const APRESENTADO = TAP?.reservas.telefone_apresentado ?? '';
/** Uma zona com circuitos, para a página do concelho dela. */
const ZONA = TAP?.zonas.find((z) => z.circuitos.length > 0 && z.concelho) ?? null;
/** Uma grelha de viagens e uma tabela de partidas: são coisas diferentes. */
const COM_VIAGENS = TAP?.horarios.find((h) => h.quadros.some((q) => q.viagens?.length)) ?? null;
const COM_PARTIDAS = TAP?.horarios.find((h) => h.quadros.some((q) => q.horas?.length)) ?? null;

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

  // O telefone é uma ligação `tel:`, não texto a fingir.
  await expect(page.getByRole('link', { name: `Ligar ${APRESENTADO}` })).toHaveAttribute(
    'href',
    `tel:${TELEFONE}`,
  );
});

test('não promete reserva online para o que não a tem', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Só quatro serviços a têm. Dizer que a têm todos manda alguém a um sítio
  // onde não encontra o que procura.
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/A reserva online só serve/)).toBeVisible();
});

test('conta as zonas por levantar em vez de as esconder', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Uma lista curta a fingir-se de completa é pior do que uma lista curta que
  // se declara incompleta.
  await page.goto(`/a-pedido/`);
  await expect(
    page.getByRole('heading', { name: /zonas sem os circuitos atribuídos/ }),
  ).toBeVisible();
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
  for (const c of TAP!.circuitos.slice(0, 3)) {
    await expect(catalogo.getByText(c.nome, { exact: false }).first()).toBeVisible();
  }
});

test('não inventa a que zona pertence cada circuito', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // A ligação zona→circuito não está na fonte: o formulário do sistema de
  // reservas liga-as quando alguém escolhe uma zona, e o instantâneo tem as
  // duas listas sem a ligação. A página tem de o DIZER — um circuito posto
  // no concelho errado manda alguém reservar onde não deve.
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/não se sabe é qual deles serve qual zona/)).toBeVisible();
});

test('o concelho sem zona é declarado, e não omitido', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Um concelho sem separador na página da autoridade não desaparece: não o
  // dizer deixa quem lá mora sem saber se o serviço não existe ou se nós é que
  // não o pusemos.
  test.skip(!TAP?.sem_zona.length, 'nesta região todos os concelhos têm zona');
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/Sem zona de transporte a pedido/)).toContainText(
    TAP!.sem_zona[0].nome,
  );
});

test('cada concelho com zona leva o telefone na sua própria página', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // Obrigar quem está na página do concelho a seguir uma ligação antes de ver
  // o número é pôr um passo entre ele e a viagem.
  test.skip(!ZONA, 'nesta região nenhuma zona tem circuitos atribuídos');
  await page.goto(`/rede/concelhos/${ZONA!.concelho}/`);
  const seccao = page.locator('section[aria-labelledby="c-a-pedido"]');
  await expect(seccao).toBeVisible();
  await expect(seccao.getByRole('link', { name: /Ligar/ })).toHaveAttribute(
    'href',
    `tel:${TELEFONE}`,
  );
  await expect(seccao).toContainText(`circuitos na zona ${ZONA!.nome}`);
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
  await page.goto(`/a-pedido/`);
  const resumo = page.getByText(/viagens? — da .* às \d{2}:\d{2}/).first();
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
  await page.goto(`/a-pedido/`);
  const seccao = page.locator('section', {
    has: page.getByRole('heading', { name: COM_PARTIDAS!.nome, exact: true }),
  });
  await expect(seccao.first()).toContainText('tabela de partidas');
  await seccao
    .getByText(/partidas por dia/)
    .first()
    .click();
  await expect(page.getByText(/e não um percurso/).first()).toBeVisible();
});

test('quem transcreveu a folha à mão fica escrito na página', async ({ page }) => {
  test.skip(!TAP, SEM.aPedido);
  // O guarda da construção prova que cada hora transcrita está no PDF de
  // origem. Que ela está na PARAGEM CERTA mediu-o alguém com os olhos, uma
  // vez — e quem lê tem direito a saber que foi assim que se soube.
  await page.goto(`/a-pedido/`);
  await expect(page.getByText(/Transcrito da brochura por/).first()).toBeVisible();
});
