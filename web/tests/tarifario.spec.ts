/**
 * O TARIFÁRIO TEM PORTA. Só se chegava a ele pelo menu do mapa: quem abria «A
 * rede» à procura do preço, ou chegava a uma paragem por uma ligação, não o
 * achava. Passa a estar na rede e no rodapé de todas as páginas — quando a
 * região tem títulos.
 */
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD, REGIAO } from './anfitrioes';

const temTitulos = () => {
  const f = join(BUILD, REGIAO, 'sitio', 'tarifas.json');
  return existsSync(f) && (JSON.parse(readFileSync(f, 'utf8')).titulos?.length ?? 0) > 0;
};

test('o tarifário tem porta na rede e no rodapé', async ({ page }) => {
  test.skip(!temTitulos(), 'esta região não tem tarifário');
  await page.goto('/rede/');
  await expect(page.getByRole('main').getByRole('link', { name: /^Tarifário/ })).toHaveAttribute(
    'href',
    '/rede/tarifario/',
  );
  const noRodape = page.getByRole('contentinfo').getByRole('link', { name: 'Tarifário' });
  await expect(noRodape).toHaveAttribute('href', '/rede/tarifario/');
  await noRodape.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tarifário' })).toBeVisible();
});
