/**
 * O traço de uma linha vê-se em todos os fundos por onde passa, nos dois temas.
 *
 * O traço era a cor do distintivo, e o distintivo só garante o número por cima
 * dele: um bege com o número escuro lê-se, e o mesmo bege como fio dava 2,1:1
 * sobre o fundo do mapa. Numa região real, trinta linhas são desse bege, e há
 * amarelos piores. O que aqui se afirma é o que a WCAG 1.4.11 pede a um traço
 * que diz alguma coisa: 3:1 contra o que está à volta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lab } from '../src/lib/cielab.ts';
import { contraste } from '../src/lib/cor.ts';
import {
  FUNDOS_DOS_TRACOS,
  MISTURA_DOS_TRACOS_NO_ESCURO,
  misturarEmOklab,
  traco,
  tracoDaLinha,
} from '../src/lib/traco.ts';
import { corDaRede, FUNDO_DO_MAPA } from '../src/lib/estilo-mapa.ts';

const CSS = readFileSync(join(import.meta.dirname, '..', 'src', 'app', 'global.css'), 'utf8');

const piorContraste = (cor: string, fundos: readonly string[]) =>
  Math.min(...fundos.map((f) => contraste(cor, f)));

const tom = (cor: string) => {
  const [, a, b] = lab(cor);
  return (Math.atan2(b, a) * 180) / Math.PI;
};

/** As cores que custam: claras, amarelas, quase pretas — e as do bege e dos amarelos medidos. */
const DIFICEIS = [
  '#ca9e67', // o bege de trinta linhas de uma região real
  '#ffd401',
  '#feeb18',
  '#f7e300',
  '#1d1d1b', // quase preto: no escuro, a mistura com branco não chegava
  '#000000',
  '#cccccc',
  '#8fd14f',
  '#00b2e3',
];

test('as cores difíceis ficam a ≥ 3:1 de todos os fundos, nos dois temas', () => {
  for (const cor of DIFICEIS) {
    const t = tracoDaLinha(cor);
    assert.ok(t, cor);
    const claro = piorContraste(t.claro, [...FUNDOS_DOS_TRACOS.claro, FUNDO_DO_MAPA.claro]);
    const escuro = piorContraste(t.escuro, [...FUNDOS_DOS_TRACOS.escuro, FUNDO_DO_MAPA.escuro]);
    assert.ok(claro >= 3, `${cor} → ${t.claro}: ${claro.toFixed(2)}:1 no claro`);
    assert.ok(escuro >= 3, `${cor} → ${t.escuro}: ${escuro.toFixed(2)}:1 no escuro`);
  }
});

test('o bege escurece mantendo o tom, e não fica castanho', () => {
  const t = tracoDaLinha('#CA9E67')!;
  assert.ok(contraste('#ca9e67', FUNDO_DO_MAPA.claro) < 2.5, 'o bege original não passava');
  assert.ok(Math.abs(tom(t.claro) - tom('#ca9e67')) < 3, `${t.claro} mudou de tom`);
  // Escurece o que precisa, e não mais: fica junto dos 3:1.
  assert.ok(piorContraste(t.claro, FUNDOS_DOS_TRACOS.claro) < 3.3, t.claro);
  // E o croma desce com a luz: é o mesmo bege à sombra.
  const [L0, a0, b0] = lab('#ca9e67');
  const [L1, a1, b1] = lab(t.claro);
  assert.ok(Math.abs(Math.hypot(a1, b1) / L1 - Math.hypot(a0, b0) / L0) < 0.05);
});

test('uma cor que já passa nos dois temas não muda', () => {
  for (const cor of ['#0a5c7a', '#806db0', '#a3261b', '#5b3a8e', '#e30613']) {
    assert.equal(tracoDaLinha(cor)?.claro, cor);
  }
});

test('o quase preto clareia só o bastante para a mistura do escuro se ver', () => {
  const t = tracoDaLinha('#1d1d1b')!;
  // A mistura do quase preto original não chegava ao fundo do esquema escuro.
  const antes = misturarEmOklab('#1d1d1b', '#ffffff', MISTURA_DOS_TRACOS_NO_ESCURO);
  assert.ok(piorContraste(antes, FUNDOS_DOS_TRACOS.escuro) < 3);
  assert.notEqual(t.claro, '#1d1d1b');
  assert.ok(lab(t.claro)[0] - lab('#1d1d1b')[0] < 5, `${t.claro} clareou de mais`);
});

test('o branco é «sem cor», e o traço é o do modo', () => {
  assert.equal(tracoDaLinha('#ffffff'), null);
  assert.equal(tracoDaLinha('FFFFFF'), null);
  assert.equal(tracoDaLinha(null), null);
  assert.equal(traco('#fff'), null);
  for (const tema of ['claro', 'escuro'] as const) {
    const fundos = [...FUNDOS_DOS_TRACOS[tema], FUNDO_DO_MAPA[tema]];
    assert.ok(piorContraste(corDaRede(tema, 'autocarro'), fundos) >= 3, tema);
  }
});

test('nenhuma cor do sRGB fica abaixo dos 3:1, em nenhum tema', () => {
  const passos = Array.from({ length: 16 }, (_, i) => i * 17);
  for (const r of passos)
    for (const g of passos)
      for (const b of passos) {
        const cor = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
        const t = tracoDaLinha(cor);
        if (cor === '#ffffff') {
          assert.equal(t, null);
          continue;
        }
        assert.ok(t, cor);
        assert.ok(piorContraste(t.claro, FUNDOS_DOS_TRACOS.claro) >= 3, `${cor} → ${t.claro}`);
        assert.ok(piorContraste(t.escuro, FUNDOS_DOS_TRACOS.escuro) >= 3, `${cor} → ${t.escuro}`);
        assert.equal(t.escuro, misturarEmOklab(t.claro, '#ffffff', MISTURA_DOS_TRACOS_NO_ESCURO));
      }
});

test('os fundos e a mistura são os do CSS e os do mapa', () => {
  assert.ok(FUNDOS_DOS_TRACOS.claro.includes(FUNDO_DO_MAPA.claro as never));
  assert.ok(FUNDOS_DOS_TRACOS.escuro.includes(FUNDO_DO_MAPA.escuro as never));
  // O claro, no `:root`; o escuro, no bloco do escuro escolhido.
  const raiz = CSS.slice(CSS.indexOf(':root {'), CSS.indexOf('}', CSS.indexOf(':root {')));
  const escuro = CSS.slice(
    CSS.indexOf(":root:where([data-tema='escuro']) {"),
    CSS.indexOf('}', CSS.indexOf(":root:where([data-tema='escuro']) {")),
  );
  const valor = (bloco: string, nome: string) =>
    bloco
      .match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1]
      .trim()
      .replace(/^#fff$/, '#ffffff');
  for (const [bloco, tema] of [
    [raiz, 'claro'],
    [escuro, 'escuro'],
  ] as const) {
    for (const nome of ['--fundo', '--superficie', '--superficie-suave', '--fundo-do-mapa']) {
      const v = valor(bloco, nome);
      assert.ok(v && FUNDOS_DOS_TRACOS[tema].includes(v as never), `${nome} (${tema}): ${v}`);
    }
  }
  assert.equal(
    valor(escuro, '--mistura-dos-tracos'),
    `${Math.round(MISTURA_DOS_TRACOS_NO_ESCURO * 100)}%`,
  );
});
