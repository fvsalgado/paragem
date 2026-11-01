/**
 * A ESTAÇÃO: os comboios que o sítio já tem, e o autocarro à porta.
 *
 * Dizia «os horários da CP não são publicados aqui» — e o planeador do mesmo
 * sítio propunha comboios ao minuto. E a ligação ao autocarro era um nome, às
 * vezes duas vezes o mesmo, sem uma partida. A demonstração não tem comboio, e
 * aí estes casos saltam com a razão escrita.
 */
import { test, expect } from '@playwright/test';

import { estacoes, fusoDaRegiao, temMosaicos, SEM } from './dados-da-regiao';

const COM_AUTOCARRO = estacoes().find((e) => e.sem_ligacao === false);
const SEM_AUTOCARRO = estacoes().find((e) => e.sem_ligacao === true);
const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');

test.use({ timezoneId: fusoDaRegiao() });

test('a estação mostra os comboios, e o autocarro à porta uma vez por nome', async ({ page }) => {
  test.skip(!COM_AUTOCARRO, SEM.comboio);
  await page.goto(`/rede/estacoes/${seguro(COM_AUTOCARRO!.id)}/`);
  await expect(page.getByRole('heading', { name: 'Comboios a seguir' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('não são publicados aqui');
  const aPorta = page.locator('.paragem-a-porta h3 a');
  await expect(aPorta.first()).toBeVisible();
  const nomes = await aPorta.allInnerTexts();
  expect(new Set(nomes).size, 'a mesma paragem duas vezes').toBe(nomes.length);
  await expect(page.getByRole('link', { name: 'Como chegar aqui' })).toHaveAttribute(
    'href',
    /\/viagem\/\?para=/,
  );
});

test('sem autocarro perto, di-lo sem o vermelho dos alertas', async ({ page }) => {
  test.skip(!SEM_AUTOCARRO, SEM.comboio);
  await page.goto(`/rede/estacoes/${seguro(SEM_AUTOCARRO!.id)}/`);
  const faixa = page.locator('.faixa', { hasText: 'Não há paragem de autocarro' });
  await expect(faixa).toBeVisible();
  await expect(faixa).not.toHaveClass(/alerta/);
});

test('no mapa, o cartão de uma estação diz o que parte a seguir, com um nome só', async ({
  page,
}) => {
  // O cartão de uma paragem tinha «A seguir» e o de uma estação não tinha
  // nada; e o título dizia «X (estação)» ao lado da paragem «X (Estação)».
  const e = COM_AUTOCARRO ?? SEM_AUTOCARRO;
  test.skip(!e, SEM.comboio);
  test.skip(!temMosaicos(), SEM.mosaicos);
  await page.goto(`/?ponto=${encodeURIComponent(e!.id)}`);
  const cartao = page.locator('section.cartao-de-baixo');
  await expect(cartao.locator('h2')).toHaveText(e!.nome.replace(/\s*\(esta[cç][aã]o\)$/i, ''));
  await expect(cartao.locator('h2')).not.toContainText('(estação)');
  // As horas chegam, ou chega a frase que diz porque não há — nunca o vazio.
  await expect(cartao.locator('ul.partidas, .a-seguir-reservado p, p')).not.toHaveCount(0);
  await expect(cartao.locator('.a-seguir-reservado[aria-busy="true"]')).toHaveCount(0, {
    timeout: 15_000,
  });
});

test('os comboios vêm antes dos botões e da nota sobre os dados', async ({ page }) => {
  // O primeiro comboio aparecia a 70 % do primeiro ecrã do telemóvel, depois
  // de «Como chegar aqui» e da cápsula dos dados (auditoria de 1/11/2026, #80).
  const e = COM_AUTOCARRO ?? SEM_AUTOCARRO;
  test.skip(!e, SEM.comboio);
  await page.goto(`/rede/estacoes/${seguro(e!.id)}/`);
  // Mede-se depois de as horas chegarem: o título é redesenhado quando chegam.
  await expect(page.locator('section.a-seguir .fantasma-das-partidas')).toHaveCount(0);
  const comboios = (await page.getByRole('heading', { name: 'Comboios a seguir' }).boundingBox())!;
  const botao = (await page.getByRole('link', { name: 'Como chegar aqui' }).boundingBox())!;
  const nota = (await page.locator('.marca-dados').first().boundingBox())!;
  expect(comboios.y).toBeLessThan(botao.y);
  expect(comboios.y).toBeLessThan(nota.y);
});

test('na lista, as estações sem autocarro perto ficam juntas, à parte', async ({ page }) => {
  test.skip(!SEM_AUTOCARRO, SEM.comboio);
  await page.goto('/rede/estacoes/');
  const grupo = page.getByRole('region', { name: 'Sem autocarro a menos de 300 m' });
  await expect(grupo.getByRole('link', { name: new RegExp(SEM_AUTOCARRO!.nome) })).toBeVisible();
  // E a faixa leva lá.
  await expect(page.locator('.faixa a[href="#sem-autocarro"]')).toBeVisible();
  // Todas as que não têm autocarro perto, e só essas.
  await expect(grupo.getByRole('link')).toHaveCount(estacoes().filter((e) => e.sem_ligacao).length);
});
