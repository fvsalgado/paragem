/**
 * A marca, e as três coisas que a podem desencontrar de si própria.
 *
 * A marca está escrita uma vez (`lib/marca.ts`) e tem três leitores — o
 * cabeçalho, os ícones e os cartões de partilha. Os ícones são ficheiros
 * gerados e versionados, e a cor está também no CSS: são os dois sítios onde
 * uma mudança feita de um lado fica por fazer do outro sem ninguém dar por
 * isso. E há uma regra de desenho que não se vê a olho — as retas em
 * coordenadas ímpares — e que, partida, só se nota num favicon desfocado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COR_DO_PAPEL,
  CORES_DA_FAIXA,
  MARCA_ESPESSURA,
  MARCA_GRELHA,
  MARCA_TINTA,
  MARCA_TRACOS,
  TINTA_SOBRE_A_FAIXA,
} from '../src/lib/marca.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

/** A contraste da WCAG 2.1, contada aqui para o teste não depender de um componente. */
function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('o icon.svg é o desenho de lib/marca.ts — quem muda a marca volta a gerar os ícones', () => {
  const svg = ler('../src/app/icon.svg');
  for (const traco of MARCA_TRACOS) {
    assert.ok(
      svg.includes(`d="${traco}"`),
      `falta o traço ${traco}: corre scripts/gerar-icones.mjs`,
    );
  }
  assert.ok(svg.includes(`fill="${CORES_DA_FAIXA.regiao}"`), 'o fundo não é a cor das regiões');
  assert.ok(svg.includes(`stroke="${TINTA_SOBRE_A_FAIXA}"`), 'a tinta não é a de lib/marca.ts');
});

test('as cores da faixa são as do CSS — o mesmo valor em dois alfabetos', () => {
  const css = ler('../src/app/global.css');
  const token = (nome: string) => css.match(new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  assert.equal(token('marca')?.toLowerCase(), CORES_DA_FAIXA.regiao, '--marca ≠ faixa das regiões');
  assert.equal(token('texto')?.toLowerCase(), CORES_DA_FAIXA.montra, '--texto ≠ faixa da montra');
  assert.equal(token('fundo')?.toLowerCase(), COR_DO_PAPEL, '--fundo ≠ papel');
});

test('o que se escreve sobre a faixa passa os 4,5:1 nas duas cores', () => {
  // O branco da marca e do nome, e o `--linhas` do «.pt» e dos cartões.
  for (const faixa of Object.values(CORES_DA_FAIXA)) {
    for (const tinta of [TINTA_SOBRE_A_FAIXA, '#d5ddd9']) {
      const razao = contraste(tinta, faixa);
      assert.ok(razao >= 4.5, `${tinta} sobre ${faixa}: ${razao.toFixed(2)}:1`);
    }
  }
});

/**
 * As retas de cada traço, em coordenadas absolutas: `x` das verticais e `y`
 * das horizontais. Lê só os comandos que a marca usa — M, H, V, h, v e a —, e
 * rebenta num que não conheça, em vez de o saltar calado.
 */
function retas(caminho: string): { verticais: number[]; horizontais: number[] } {
  const verticais: number[] = [];
  const horizontais: number[] = [];
  let x = 0;
  let y = 0;
  const partes = caminho.match(/[a-zA-Z]|-?\d*\.?\d+/g) ?? [];
  let i = 0;
  const numero = () => Number(partes[i++]);
  while (i < partes.length) {
    const comando = partes[i++];
    switch (comando) {
      case 'M':
        x = numero();
        y = numero();
        break;
      case 'H':
      case 'h': {
        const destino = numero();
        horizontais.push(y);
        x = comando === 'H' ? destino : x + destino;
        break;
      }
      case 'V':
      case 'v': {
        const destino = numero();
        verticais.push(x);
        y = comando === 'V' ? destino : y + destino;
        break;
      }
      case 'a':
        i += 5; // raios, rotação e as duas bandeiras — só interessa onde acaba
        x += numero();
        y += numero();
        break;
      default:
        throw new Error(`comando ${comando} por ler em ${caminho}`);
    }
  }
  return { verticais, horizontais };
}

test('as retas da marca estão em coordenadas ímpares — é o que a deixa nítida a 16, 32 e 48 px', () => {
  assert.equal(MARCA_ESPESSURA, 2, 'a regra dos ímpares é para um traço de 2');
  for (const traco of MARCA_TRACOS) {
    const { verticais, horizontais } = retas(traco);
    for (const c of [...verticais, ...horizontais]) {
      assert.ok(Number.isInteger(c) && c % 2 === 1, `${traco}: reta em ${c}`);
    }
  }
});

test('a tinta cabe na grelha, e as medidas que o gerador usa são as do desenho', () => {
  const { esquerda, direita, topo, fundo } = MARCA_TINTA;
  assert.ok(esquerda >= 0 && topo >= 0, 'a tinta sai da grelha à esquerda ou em cima');
  assert.ok(direita <= MARCA_GRELHA && fundo <= MARCA_GRELHA, 'a tinta sai da grelha');
  const todas = MARCA_TRACOS.map(retas);
  const xs = todas.flatMap((r) => r.verticais);
  const ys = todas.flatMap((r) => r.horizontais);
  // A reta mais à direita é a borda da placa; a mais em baixo é o pé.
  assert.equal(Math.max(...xs) + MARCA_ESPESSURA / 2, direita);
  assert.equal(Math.max(...ys) + MARCA_ESPESSURA / 2, fundo);
});
