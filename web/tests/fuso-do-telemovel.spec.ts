/**
 * O TELEMÓVEL NOUTRO FUSO, e a paragem a mostrar as horas da paragem.
 *
 * Os outros testes de interface põem o navegador no fuso da região
 * (`fusoDaRegiao`), e é por isso que nenhum apanhava o engano: com o telemóvel
 * na hora de Espanha, a folha da paragem lia «agora» uma hora à frente, dava
 * por passado o autocarro que ainda não tinha passado e escrevia as horas
 * uma hora mais tarde. Aqui o navegador fica em Madrid e nos Açores, o
 * relógio cinco minutos antes de uma partida a sério — no fuso da região —, e
 * a primeira partida tem de ser essa, à hora do horário.
 *
 * O cálculo puro está em `fuso-do-navegador.test.mts`; isto prova que a
 * página o usa.
 */
import { test, expect } from '@playwright/test';

import { paragemComMaisPartidas, umaPartidaFutura } from './dados-da-regiao';

const PARAGEM = paragemComMaisPartidas();
const PARTIDA = umaPartidaFutura();

for (const fuso of ['Europe/Madrid', 'Atlantic/Azores']) {
  test.describe(`com o telemóvel no fuso ${fuso}`, () => {
    test.use({ timezoneId: fuso });

    test('a seguir vem a partida que ainda não passou, à hora do horário', async ({ page }) => {
      test.skip(!PARTIDA, 'esta região não tem uma única partida num dia com serviço');
      await page.clock.setFixedTime(PARTIDA!.quando);
      await page.goto(`/rede/paragens/${PARAGEM.id}/`);

      const primeira = page.locator('section[aria-labelledby="a-seguir"] .partidas li').first();
      await expect(primeira).toBeVisible({ timeout: 10_000 });
      await expect(primeira.locator('.relogio')).toHaveText(PARTIDA!.hora);
      await expect(primeira.locator('.quando-passa strong')).toHaveText(/agora|\d+ min/);
    });
  });
}
