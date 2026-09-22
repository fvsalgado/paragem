import { test, expect } from '@playwright/test';

import { buscaDeUmaParagem, ondeHaParagens } from './dados-da-regiao';

/**
 * O «Perto de ti» — e sobretudo o que ele faz quando NÃO sabe onde estás.
 *
 * O estado interessante deste bloco não é o de sucesso: é o de quem recusa a
 * localização, que é muita gente e com razão. Se aí a página encolher os
 * ombros, o bloco fez mal a quem não o quis usar.
 */

// O «Perto de ti» vive em `/rede/`, que é o caminho SEM MAPA — o equivalente
// acessível do ponto azul. Na aplicação do mapa a mesma coisa faz-se com o
// botão de localização do MapLibre. A região é o anfitrião (`anfitrioes.ts`).
const REDE = '/rede';

// Em cima da paragem com mais partidas desta região, que é onde há mais para
// responder à volta — e sai dos dados, não de um mapa escrito à mão.
const ONDE = ondeHaParagens();
const { nome: PARAGEM } = buscaDeUmaParagem();

test('não pede a localização ao carregar a página', async ({ page }) => {
  // Sem permissão concedida: se a página a pedisse sozinha, o navegador
  // disparava o pedido e o teste via o estado de espera.
  let pediu = false;
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    (window as unknown as { __pediu: boolean }).__pediu = false;
    navigator.geolocation.getCurrentPosition = (...args: Parameters<typeof original>) => {
      (window as unknown as { __pediu: boolean }).__pediu = true;
      return original(...args);
    };
  });
  await page.goto(`${REDE}/`);
  await expect(page.getByRole('heading', { name: 'Perto de ti' })).toBeVisible();
  await expect(page.getByRole('button', { name: /paragens perto de mim/i })).toBeVisible();

  pediu = await page.evaluate(() => (window as unknown as { __pediu: boolean }).__pediu);
  expect(pediu, 'a página pediu a localização sem ninguém a autorizar').toBe(false);
});

test('com a localização, mostra as paragens mais próximas e as horas', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(ONDE);
  await page.goto(`${REDE}/`);
  await page.getByRole('button', { name: /paragens perto de mim/i }).click();

  const bloco = page.locator('section[aria-labelledby="perto"]');
  await expect(bloco.getByRole('link', { name: PARAGEM }).first()).toBeVisible({
    timeout: 15_000,
  });

  // A distância aparece, e em metros — não num mapa que é preciso saber ler.
  await expect(bloco).toContainText(/\d+\s?m|\d+,\d\s?km/);

  // E as horas da paragem mais perto, que vêm por fetch depois da lista.
  await expect(bloco).toContainText(/A seguir:/, { timeout: 15_000 });

  // A ligação leva mesmo à página da paragem.
  const primeira = bloco.getByRole('link').first();
  await expect(primeira).toHaveAttribute('href', /^\/rede\/(paragens|estacoes)\//);
});

test('quando a localização é recusada, diz-se em vez de encolher os ombros', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, erro) => {
      erro?.({ code: 1, PERMISSION_DENIED: 1, message: 'recusado' } as GeolocationPositionError);
    };
  });
  await page.goto(`${REDE}/`);
  await page.getByRole('button', { name: /paragens perto de mim/i }).click();

  const bloco = page.locator('section[aria-labelledby="perto"]');
  await expect(bloco).toContainText(/está tudo bem/i);
  // E manda para onde há resposta sem localização nenhuma.
  await expect(bloco).toContainText(/nome da paragem|concelho/i);
});

test('num navegador sem geolocalização, também', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
  });
  await page.goto(`${REDE}/`);
  await page.getByRole('button', { name: /paragens perto de mim/i }).click();
  await expect(page.locator('section[aria-labelledby="perto"]')).toContainText(
    /não sabe dizer onde estás/i,
  );
});
