/**
 * A ESCALA (`:root` em `global.css`): os tamanhos de letra e os raios saem
 * todos dela. Um tamanho escrito à mão numa regra nova é como a escala se
 * desfaz — eram 25 tamanhos de letra antes dela.
 *
 * Quem integrar CSS escrito antes da escala corre `node scripts/escala.mjs
 * src/app/global.css`, que põe as variáveis no lugar dos números.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comEscala } from '../scripts/escala.mjs';

const CSS = readFileSync(new URL('../src/app/global.css', import.meta.url), 'utf8');

/** Os valores que ficam fora da escala, e porquê. */
const FORA = new Set([
  'inherit',
  // Relativo à letra de quem o contém: o «dia seguinte» ao lado de uma hora.
  '0.85em',
  // Unidades do desenho do esquema da linha (SVG), e não do ecrã.
  '11px',
]);
const RAIOS_FORA = new Set(['0', '50%', '2px', '2.25rem']);

test('os tamanhos de letra saem todos da escala', () => {
  const fora = [...CSS.matchAll(/font-size:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/^var\(--letra-[a-z-]+\)$/.test(v) && !FORA.has(v));
  assert.deepEqual(fora, [], 'node scripts/escala.mjs src/app/global.css');
});

test('os raios saem todos da escala', () => {
  const fora = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)]
    .flatMap((m) => m[1].trim().split(/\s+/))
    .filter((v) => !/^var\(--raio(-[a-z]+)?\)$/.test(v) && !RAIOS_FORA.has(v));
  assert.deepEqual(fora, [], 'node scripts/escala.mjs src/app/global.css');
});

test('a passagem não muda nada a um ficheiro que já a tem', () => {
  assert.equal(comEscala(CSS), CSS);
});

test('a passagem leva os números à escala, e só nas propriedades dela', () => {
  assert.equal(
    comEscala('.a {\n  font-size: 0.9rem;\n  padding: 0.5rem 0.35rem;\n  width: 1rem;\n}'),
    '.a {\n  font-size: var(--letra-pequena);\n  padding: var(--espaco-2) 0.35rem;\n  width: 1rem;\n}',
  );
});
