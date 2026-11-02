/**
 * AS ESTAÇÕES SEM AUTOCARRO A MENOS DE 300 m, ASSINALADAS NO MAPA: um anel na
 * cor de atenção à volta da placa, e no cartão a palavra — o ícone e a frase
 * dizem-no, a cor só o confirma. Quem chega de comboio a uma delas tem de
 * saber, antes de o apanhar, que ali não há autocarro à porta.
 */
import { expect, test } from '@playwright/test';
import { estacoes, SEM, temMosaicos } from './dados-da-regiao';

test('uma estação sem autocarro perto tem anel no mapa e di-lo no cartão', async ({ page }) => {
  test.skip(!temMosaicos(), SEM.mosaicos);
  const sem = estacoes().find((e) => e.sem_ligacao);
  const com = estacoes().find((e) => !e.sem_ligacao);
  test.skip(!sem, 'todas as estações desta região têm autocarro perto');
  await page.goto(`/?ponto=${encodeURIComponent(sem!.id)}`);
  const cartao = page.locator('section.cartao-de-baixo');
  await expect(cartao.locator('.estado-atencao')).toHaveText('Sem autocarro a menos de 300 m');
  // O mapa chega depois do cartão: espera-se por ele.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!(
              window as unknown as { __mapa?: { getLayer(id: string): unknown } }
            ).__mapa?.getLayer('estacoes-sem-autocarro'),
        ),
      { message: 'o mapa tem a camada dos anéis', timeout: 20_000 },
    )
    .toBe(true);
  // E a que tem autocarro perto não o diz.
  if (com) {
    await page.goto(`/?ponto=${encodeURIComponent(com.id)}`);
    await expect(page.locator('section.cartao-de-baixo h2')).toBeVisible();
    await expect(page.locator('section.cartao-de-baixo .estado-atencao')).toHaveCount(0);
  }
});
