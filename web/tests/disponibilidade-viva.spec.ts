/**
 * PROVA de ponta a ponta do caminho COM serviço.
 *
 * Não corre no CI: o site tem de ser construído com a variável apontada a um
 * serviço, e o serviço a ler uma fonte — três processos alinhados. Corre-se à
 * mão, com o `disponibilidade/servidor.mjs` a ler a fixture e o site construído
 * com `NEXT_PUBLIC_PARAGEM_DISPONIBILIDADE_<REGIÃO>` a apontar-lhe (o nome da
 * região em maiúsculas, com hífenes a valer sublinhados — `lib/enderecos.ts`).
 * Serve para ver, uma vez, a contagem aparecer no navegador e trazer a hora.
 */
import { test, expect } from '@playwright/test';

import { umaEstacaoDeBicicletas } from './dados-da-regiao';

test.skip(!process.env.PROVA_DISPONIBILIDADE, 'prova manual — ver o cabeçalho');

test('a contagem ao vivo aparece na estação, com a hora', async ({ page }) => {
  const estacao = umaEstacaoDeBicicletas();
  test.skip(!estacao, 'a região não tem estações de bicicletas');
  await page.goto('/modos/bicicleta/');
  const item = page.getByRole('listitem').filter({ hasText: estacao!.nome });
  await expect(item.locator('.disponibilidade')).toContainText('bicicletas', { timeout: 8000 });
  // Um resumo por sistema com contagens frescas — daí o `.first()`.
  await expect(page.getByText(/Neste momento,/).first()).toBeVisible();
  await expect(page.getByText(/há \d+ s|há \d+ min/).first()).toBeVisible();
});
