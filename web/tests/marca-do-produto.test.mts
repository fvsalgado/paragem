/**
 * A marca do produto (`lib/marca-do-produto.ts`): o feixe, e as regras que
 * não se veem a olho.
 *
 * O desenho tem quatro leitores — o cabeçalho da montra, o do painel, os
 * ícones e a imagem de partilha —, e os ícones são ficheiros gerados e
 * versionados: é onde uma mudança feita de um lado fica por fazer do outro sem
 * ninguém dar por isso. As cores têm regras de contraste que a escolha da
 * marca mediu (§6), e que um retoque de cor pode desfazer em silêncio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AZULEJOS,
  CORES_CLARO,
  CORES_ESCURO,
  GRELHAS,
  PAPEL,
  grelhaDoP,
  iconeDoSeparador,
  palavra,
  VERSOES,
  type Versao,
} from '../src/lib/marca-do-produto.ts';
import { contraste, luminancia } from '../src/lib/cor.ts';
import { ICONES } from '../src/lib/manifesto.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

/** A luminosidade L* (CIELAB) de uma cor: é o que separa as linhas em cinzento e com daltonismo. */
const lEstrela = (hex: string) => {
  const y = luminancia(hex);
  const f = y > (6 / 29) ** 3 ? Math.cbrt(y) : y / (3 * (6 / 29) ** 2) + 4 / 29;
  return 116 * f - 16;
};

test('o icon.svg é o que lib/marca-do-produto.ts desenha — quem muda a marca volta a gerar os ícones', () => {
  assert.equal(
    ler('../src/app/icon.svg'),
    iconeDoSeparador(),
    'o desenho mudou: corre `node scripts/imagens-do-produto.mjs icones`',
  );
});

test('o ícone do separador troca de azulejo com o tema do navegador', () => {
  const svg = iconeDoSeparador();
  // Azul-noite por omissão (a barra clara), papel quando o tema é escuro.
  assert.match(svg, new RegExp(`\\.azulejo\\{fill:${AZULEJOS.noite.fundo}\\}`));
  assert.match(
    svg,
    new RegExp(
      `@media \\(prefers-color-scheme:dark\\)\\{\\.azulejo\\{fill:${AZULEJOS.papel.fundo}\\}`,
    ),
  );
});

test('a linha de fora segura a silhueta sozinha: ≥ 3:1 em cada fundo onde a marca vai a cores', () => {
  for (const fundo of [PAPEL, '#ffffff']) {
    const c = contraste(CORES_CLARO[0], fundo);
    assert.ok(c >= 3, `${CORES_CLARO[0]} sobre ${fundo}: ${c.toFixed(2)}:1`);
  }
  for (const fundo of ['#0f1a20', '#16242c']) {
    const c = contraste(CORES_ESCURO[0], fundo);
    assert.ok(c >= 3, `${CORES_ESCURO[0]} sobre ${fundo}: ${c.toFixed(2)}:1`);
  }
});

test('de fora para dentro a luminosidade sobe, com ≥ 15 de L* entre linhas vizinhas', () => {
  for (const cores of [CORES_CLARO, CORES_ESCURO]) {
    for (let i = 1; i < cores.length; i++) {
      const d = lEstrela(cores[i]) - lEstrela(cores[i - 1]);
      assert.ok(d >= 15, `${cores[i - 1]} → ${cores[i]}: ${d.toFixed(1)} de L*`);
    }
  }
});

test('no ícone ao píxel, cada píxel do desenho tem ≥ 3:1 sobre o seu azulejo, nos dois azulejos', () => {
  for (const [nome, { fundo, cores }] of Object.entries(AZULEJOS)) {
    for (const lado of Object.keys(GRELHAS).map(Number) as (keyof typeof GRELHAS)[]) {
      const usadas = new Set(
        grelhaDoP(lado)
          .flat()
          .filter((i) => i >= 0),
      );
      assert.deepEqual([...usadas].sort(), [0, 1], `${nome} ${lado}: duas linhas`);
      for (const i of usadas) {
        const c = contraste(cores[i], fundo);
        assert.ok(c >= 3, `${nome} ${lado} px, linha ${i}: ${cores[i]} dá ${c.toFixed(2)}:1`);
      }
    }
  }
});

test('a palavra cabe no cabeçalho de um telemóvel de 320 px: ≤ 120 px de largura a 21 px de altura', () => {
  for (const versao of Object.keys(VERSOES) as Versao[]) {
    const largura = 21 * palavra(versao, { classes: true }).proporcao;
    assert.ok(largura <= 120, `${versao}: ${largura.toFixed(1)} px`);
  }
});

test('a uma cor, o feixe nunca tem duas linhas — duas linhas iguais numa cor é a marca da Optibus', () => {
  // O feixe e a letra cheia são as versões que vão a uma cor; o reduzido de
  // duas linhas só vai a cores, com as duas linhas diferentes.
  assert.equal(VERSOES.feixe.n, 3);
  assert.equal(VERSOES.cheia.n, 1);
  assert.equal(VERSOES.reduzido.n, 2);
  assert.notEqual(CORES_CLARO[0], CORES_CLARO[1]);
});

test('o manifesto não oferece o ícone ao píxel para o ecrã principal', () => {
  assert.ok(!ICONES.some((i) => i.src === '/icon.svg'));
  assert.ok(ICONES.some((i) => i.purpose === 'maskable'));
});
