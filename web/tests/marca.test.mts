/**
 * A marca, e as coisas que a podem desencontrar de si própria.
 *
 * A placa-P está escrita uma vez (`lib/marca.ts`) e tem três leitores — o
 * cabeçalho, os ícones e o logótipo por extenso. Os ícones e o logótipo são
 * ficheiros gerados e versionados, e a cor está também no CSS: são os sítios
 * onde uma mudança feita de um lado fica por fazer do outro sem ninguém dar
 * por isso. E há duas regras que não se vêem a olho — as bordas em
 * coordenadas pares, e a faixa de uma região a ler-se seja qual for a cor que
 * ela declarar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COR_DO_PAPEL,
  COR_DO_PRODUTO,
  MARCA_GRELHA,
  MARCA_P,
  MARCA_P_TRACADO,
  MARCA_TINTA,
  TINTA_DO_PRODUTO,
} from '../src/lib/marca.ts';
import { LETRAS_P } from '../src/lib/marca-letras.ts';
import { FAIXA_DO_PRODUTO, contraste, faixaDaRegiao } from '../src/lib/faixa.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

test('o icon.svg é o desenho de lib/marca.ts — quem muda a marca volta a gerar os ícones', () => {
  const svg = ler('../src/app/icon.svg');
  assert.ok(
    svg.includes(`d="${MARCA_P_TRACADO}"`),
    'o traçado mudou: corre scripts/gerar-icones.mjs',
  );
  assert.ok(svg.includes(`fill="${COR_DO_PRODUTO}"`), 'o fundo não é a cor do produto');
  assert.ok(svg.includes(`fill="${TINTA_DO_PRODUTO}"`), 'a tinta não é a de lib/marca.ts');
});

/**
 * O P do logótipo por extenso é o desenho da grelha à escala da letra. Aqui
 * faz-se a mesma conta que `scripts/gerar-letras.py` faz, e compara-se: se a
 * marca mudar e o logótipo não for gerado outra vez, isto falha.
 */
test('o P do logótipo por extenso é o desenho de lib/marca.ts — quem o muda corre gerar-letras.py', () => {
  const altura = 668; // a altura das maiúsculas da Atkinson Hyperlegible Bold
  const escala = altura / (MARCA_P.linha_de_base - MARCA_P.maiuscula);
  const dx = 44 - MARCA_P.haste_esquerda * escala; // onde a letra põe a haste do P
  const dy = -MARCA_P.maiuscula * escala;
  const n = (v: number) => {
    const t = v.toFixed(1);
    return t.endsWith('.0') ? t.slice(0, -2) : t;
  };
  const partes = MARCA_P_TRACADO.match(/[MHVAZ]|-?[\d.]+/g) ?? [];
  let esperado = '';
  for (let i = 0; i < partes.length; ) {
    const c = partes[i++];
    const num = () => Number(partes[i++]);
    if (c === 'M') esperado += `M${n(num() * escala + dx)} ${n(num() * escala + dy)}`;
    else if (c === 'H') esperado += `H${n(num() * escala + dx)}`;
    else if (c === 'V') esperado += `V${n(num() * escala + dy)}`;
    else if (c === 'A') {
      const [rx, ry, rot, grande, sentido, x, y] = [
        num(),
        num(),
        num(),
        num(),
        num(),
        num(),
        num(),
      ];
      esperado += `A${n(rx * escala)} ${n(ry * escala)} ${rot} ${grande} ${sentido} ${n(x * escala + dx)} ${n(y * escala + dy)}`;
    } else esperado += 'Z';
  }
  // Compara-se número a número, com uma décima de folga: o gerador arredonda
  // em Python, que leva 336,25 para 336,2, e o JavaScript leva-o para 336,3.
  const numeros = (d: string) => (d.match(/-?[\d.]+/g) ?? []).map(Number);
  const letras = (d: string) => d.replace(/-?[\d.]+/g, '#');
  assert.equal(letras(LETRAS_P), letras(esperado), 'os comandos do traçado mudaram');
  const [a, b] = [numeros(LETRAS_P), numeros(esperado)];
  assert.equal(a.length, b.length);
  a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 0.11, `${v} ≠ ${b[k]}`));
});

test('a cor do produto é a do CSS — o mesmo valor em dois alfabetos', () => {
  const css = ler('../src/app/global.css');
  const token = (nome: string) =>
    css.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]?.toLowerCase();
  assert.equal(token('faixa'), COR_DO_PRODUTO, '--faixa ≠ COR_DO_PRODUTO');
  assert.equal(token('sobre-faixa'), TINTA_DO_PRODUTO, '--sobre-faixa ≠ TINTA_DO_PRODUTO');
  assert.equal(token('fundo'), COR_DO_PAPEL, '--fundo ≠ papel');
});

test('uma região sem cor veste a do produto, e a do produto lê-se', () => {
  assert.deepEqual(faixaDaRegiao(null), FAIXA_DO_PRODUTO);
  assert.deepEqual(faixaDaRegiao({ cor: null }), FAIXA_DO_PRODUTO);
  assert.deepEqual(faixaDaRegiao({ cor: 'turquesa' }), FAIXA_DO_PRODUTO);
  assert.ok(contraste(COR_DO_PRODUTO, TINTA_DO_PRODUTO) >= 4.5);
});

test('a faixa de uma região lê-se seja qual for a cor declarada', () => {
  // Uma clara leva tinta escura; uma escura leva branco; e uma a meio, onde
  // nenhuma das duas chega, escurece até o branco passar.
  const turquesa = faixaDaRegiao({ cor: '#40C0C4' });
  assert.deepEqual(turquesa, { fundo: '#40c0c4', tinta: '#102c3f' });
  const cinzento = faixaDaRegiao({ cor: '#777777' });
  assert.notEqual(cinzento.fundo, '#777777', 'o cinzento médio não passa com nenhuma das duas');
  for (const cor of ['#40c0c4', '#777777', '#0a5c7a', '#ffff00', '#2d6a3e', '#e5e5e5', '#8a8a00']) {
    const f = faixaDaRegiao({ cor });
    const razao = contraste(f.fundo, f.tinta);
    assert.ok(razao >= 4.5, `${cor} → ${f.fundo} com ${f.tinta}: ${razao.toFixed(2)}:1`);
  }
});

/**
 * As retas do contorno, em coordenadas absolutas: o `y` das horizontais e o
 * `x` das verticais. O fecho (`Z`) é uma vertical implícita de volta ao
 * início, e conta também.
 */
function bordas(tracado: string): number[] {
  const partes = tracado.match(/[MHVAZ]|-?[\d.]+/g) ?? [];
  const saida: number[] = [];
  let x = 0;
  let y = 0;
  let inicioX = 0;
  let inicioY = 0;
  for (let i = 0; i < partes.length; ) {
    const c = partes[i++];
    const num = () => Number(partes[i++]);
    if (c === 'M') {
      x = num();
      y = num();
      inicioX = x;
      inicioY = y;
    } else if (c === 'H') {
      saida.push(y);
      x = num();
    } else if (c === 'V') {
      saida.push(x);
      y = num();
    } else if (c === 'A') {
      i += 5; // raios, rotação e as duas bandeiras — só interessa onde acaba
      x = num();
      y = num();
    } else if (c === 'Z' && x === inicioX && y !== inicioY) {
      // O fecho só é uma borda quando volta ao início por uma vertical; o da
      // faixa acaba em cima do ponto de partida e não desenha nada.
      saida.push(inicioX);
    }
  }
  return saida;
}

test('as bordas da marca estão em coordenadas pares — é o que a deixa nítida a 16, 32 e 48 px', () => {
  for (const c of bordas(MARCA_P_TRACADO)) {
    assert.ok(Number.isInteger(c) && c % 2 === 0, `borda em ${c}`);
  }
  for (const [nome, v] of Object.entries(MARCA_P)) {
    assert.ok(v % 2 === 0, `MARCA_P.${nome} = ${v}`);
  }
});

test('a tinta cabe na grelha, e as medidas que o gerador usa são as do desenho', () => {
  const { esquerda, direita, topo, fundo } = MARCA_TINTA;
  assert.ok(esquerda >= 0 && topo >= 0 && direita <= MARCA_GRELHA && fundo <= MARCA_GRELHA);
  const todas = bordas(MARCA_P_TRACADO);
  assert.equal(Math.min(...todas), Math.min(esquerda, topo));
  assert.equal(Math.max(...todas), Math.max(direita, fundo));
});
