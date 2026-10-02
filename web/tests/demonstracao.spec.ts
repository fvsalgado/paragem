/**
 * As demonstrações: o que uma região inventada tem de dizer, e o que não pode.
 *
 * Vivem no mesmo sítio que as regiões a sério, e é isso que obriga a estes
 * casos. Uma rede inventada apresentada como informação de transportes é o
 * que o §4.4 proíbe; um mapa desenhado por nós atribuído ao OpenStreetMap é
 * atribuir-lhe o que não fez; um aviso inventado sem a marca de exemplo é uma
 * ocorrência falsa.
 *
 * NÃO SE NOMEIA NENHUMA: as demonstrações são as que os dados dizem que são
 * (`demonstracao: true`), e cada caso salta com a razão escrita quando
 * nenhuma tem a propriedade que ele verifica.
 */
import { test, expect } from '@playwright/test';
import { DEMONSTRACOES, anfitriao } from './anfitrioes';
import { declaracao, estacoes, temMosaicos } from './dados-da-regiao';

const COM_MAPA_PROPRIO = DEMONSTRACOES.filter(
  (id) => declaracao(id)?.mapa?.fonte === 'propria' && temMosaicos(id),
);

test('cada demonstração diz que é inventada, sem as cores dos alertas', async ({ page }) => {
  test.skip(!DEMONSTRACOES.length, 'esta corrida não serve nenhuma demonstração');
  for (const id of DEMONSTRACOES) {
    await page.goto(`${anfitriao(id)}/rede/`);
    const faixa = page.locator('.marca-demonstracao');
    await expect(faixa, id).toContainText('Está a ver uma demonstração');
    await expect(faixa, id).toContainText(declaracao(id)!.nome);
    // A faixa informa; o vermelho fica para o que mudou hoje.
    const fundo = await faixa.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(fundo, `${id}: a faixa da demonstração com o fundo dos alertas`).not.toBe(
      'rgb(251, 233, 230)',
    );
  }
});

test('o mapa desenhado por nós diz de quem é, e não o atribui ao OpenStreetMap', async ({
  page,
}) => {
  test.skip(!COM_MAPA_PROPRIO.length, 'nenhuma demonstração desta corrida tem mapa próprio');
  for (const id of COM_MAPA_PROPRIO) {
    await page.goto(`${anfitriao(id)}/`);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
    const atribuicao = page.locator('.maplibregl-ctrl-attrib');
    await expect(atribuicao, id).toContainText(declaracao(id)!.mapa!.atribuicao);
    await expect(atribuicao, id).not.toContainText('OpenStreetMap');
    // E o rodapé diz o mesmo, por extenso.
    await expect(page.locator('footer'), id).toContainText('inventados pelo Paragem.pt');
  }
});

test('os avisos de uma demonstração dizem que são exemplos', async ({ page }) => {
  test.skip(!DEMONSTRACOES.length, 'esta corrida não serve nenhuma demonstração');
  for (const id of DEMONSTRACOES) {
    await page.goto(`${anfitriao(id)}/avisos/`);
    await expect(page.getByText(/os avisos são exemplos/), id).toBeVisible();
  }
});

test('a estação de uma demonstração nomeia o operador e não manda para sítio nenhum', async ({
  page,
}) => {
  const comComboio = DEMONSTRACOES.filter((id) => estacoes(id).length > 0);
  test.skip(!comComboio.length, 'nenhuma demonstração desta corrida tem comboio');
  for (const id of comComboio) {
    const e = estacoes(id)[0];
    await page.goto(`${anfitriao(id)}/rede/estacoes/${encodeURIComponent(e.id)}/`);
    const nota = page.getByText(/Horário planeado do operador ferroviário/);
    await expect(nota, id).toBeVisible();
    // O operador é inventado, e o sítio dele também: nem uma ligação para fora.
    await expect(nota.locator('a'), id).toHaveCount(0);
  }
});
