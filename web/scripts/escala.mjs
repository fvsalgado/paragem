/**
 * PÕE A ESCALA NO CSS: os tamanhos de letra, os raios e os espaços passam às
 * variáveis do `:root` (`--letra-*`, `--raio-*`, `--espaco-*`).
 *
 * Uma passagem mecânica, que se repete sobre qualquer versão do ficheiro — é
 * para isso que existe: quem integrar CSS escrito antes da escala corre isto,
 * e o `tests/escala.test.mts` diz se ficou alguma coisa de fora. Correr duas
 * vezes não muda nada.
 *
 * - `font-size`: cada valor vai para o passo mais perto;
 * - `border-radius`: os raios pequenos (4–8 px) vão para `--raio-pequeno`, o
 *   de 0,6 rem para `--raio`, 1 rem para `--raio-grande` e 999 px para
 *   `--raio-redondo`;
 * - `margin`, `padding` e `gap`: só os valores que já são um passo da escala
 *   (0,25, 0,5, 0,75, 1, 1,5, 2, 3 e 4 rem). Os de entre passos ficam: apertá-los
 *   muda o desenho, e isso faz-se a olhar para as páginas.
 *
 *     node scripts/escala.mjs src/app/global.css
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const LETRA = {
  '0.75rem': 'mini',
  '0.78rem': 'mini',
  '0.8rem': 'mini',
  '0.85rem': 'pequena',
  '0.875rem': 'pequena',
  '0.9rem': 'pequena',
  '0.92rem': 'pequena',
  '0.9375rem': 'media',
  '0.95rem': 'media',
  '1rem': 'corpo',
  '1.05rem': 'corpo',
  '1.0625rem': 'corpo',
  '1.1rem': 'destaque',
  '1.15rem': 'destaque',
  '1.2rem': 'destaque',
  '1.25rem': 'titulo',
  '1.3rem': 'titulo',
  '1.35rem': 'titulo',
  '1.5rem': 'titulo-grande',
  '1.6rem': 'titulo-grande',
  '1.75rem': 'titulo-grande',
  '2.1rem': 'cartaz',
  '2.75rem': 'montra',
};
export const RAIO = {
  '999px': '--raio-redondo',
  '4px': '--raio-pequeno',
  '5px': '--raio-pequeno',
  '6px': '--raio-pequeno',
  '8px': '--raio-pequeno',
  '0.6rem': '--raio',
  '1rem': '--raio-grande',
};
export const ESPACO = {
  '0.25rem': 1,
  '0.5rem': 2,
  '0.75rem': 3,
  '1rem': 4,
  '1.5rem': 5,
  '2rem': 6,
  '3rem': 7,
  '4rem': 8,
};

const DECLARACAO = /^(\s*)([a-z-]+)(\s*:\s*)([^;{}]+)(;)/gm;
const NUMERO = /(?<![\w.-])(\d*\.?\d+(?:rem|px))(?!\w)/g;
const ESPACOS =
  /^(?:(?:margin|padding)(?:-(?:top|bottom|left|right|block|inline)(?:-(?:start|end))?)?|(?:row-|column-)?gap)$/;

export function comEscala(css) {
  return css.replace(DECLARACAO, (_, recuo, prop, sep, valor, fim) => {
    let v = valor;
    if (prop === 'font-size' && LETRA[v.trim()]) v = `var(--letra-${LETRA[v.trim()]})`;
    else if (prop === 'border-radius')
      v = v.replace(NUMERO, (n) => (RAIO[n] ? `var(${RAIO[n]})` : n));
    else if (ESPACOS.test(prop))
      v = v.replace(NUMERO, (n) => (ESPACO[n] ? `var(--espaco-${ESPACO[n]})` : n));
    return `${recuo}${prop}${sep}${v}${fim}`;
  });
}

if (process.argv[1]?.endsWith('escala.mjs') && process.argv[2]) {
  const f = process.argv[2];
  writeFileSync(f, comEscala(readFileSync(f, 'utf8')));
}
