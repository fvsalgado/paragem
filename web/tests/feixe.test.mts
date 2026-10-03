/**
 * O motor do feixe (`lib/feixe.ts`): as letras de um endereço, o espaço entre
 * elas, e a guarda de que o logótipo do produto não muda por arrasto.
 *
 * O motor é um só para a marca do produto e para o logótipo de cada região
 * (§6). É aí que está o perigo: um acerto pensado para um par de um endereço
 * novo podia mexer em «paragem.pt» sem ninguém dar por isso — e o logótipo
 * aprovado não se mede a olho.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  acerto,
  acertoCalculado,
  brancoDoPar,
  CARACTERES,
  desenhavel,
  desenharEndereco,
  letras,
  texto,
  tracos,
  VERSOES,
  type Versao,
} from '../src/lib/feixe.ts';
import { palavra } from '../src/lib/marca-do-produto.ts';

const versoes = Object.keys(VERSOES) as Versao[];
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789.-';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

test('«paragem.pt» é o logótipo aprovado, traço a traço', () => {
  // Os resumos do desenho de 3/10/2026, com as classes do sítio. Se isto
  // falhar, o logótipo do produto mudou: se foi de propósito, é uma decisão
  // de marca (§6) — e os ícones e a imagem de partilha voltam a gerar-se.
  const aprovados: Record<Versao, { viewBox: string; corpo: string }> = {
    feixe: {
      viewBox: '-6.20 -57.40 381.70 87.60',
      corpo: '1ee007df7f7ad9930d4758f58a2d47f5557ca69ae466ecdbbffa5e109859977f',
    },
    reduzido: {
      viewBox: '-6.00 -58.20 380.00 88.20',
      corpo: '584c941ed0df1a76cc23b069a922de016ac14347902e1725621e32177af84601',
    },
    cheia: {
      viewBox: '-6.20 -62.20 392.40 92.40',
      corpo: '97eef07d9fdb79181a668119e9d5ddb5c6fb193404b5336494cfd367c18da462',
    },
  };
  for (const versao of versoes) {
    const { viewBox, corpo } = palavra(versao, { classes: true });
    assert.equal(viewBox, aprovados[versao].viewBox, versao);
    assert.equal(sha256(corpo), aprovados[versao].corpo, versao);
  }
});

test('o espaço calculado é o que se mediu à mão em «paragem.pt», a menos de 0,3', () => {
  // A regra que espaça um endereço novo é a que reproduz o acerto medido do
  // logótipo do produto: se deixar de o reproduzir, o endereço de uma região
  // fica com um ritmo diferente do da marca que o assina.
  const pares = [...'paragem.pt'].slice(1).map((y, i) => 'paragem.pt'[i] + y);
  for (const versao of versoes) {
    for (const [x, y] of pares) {
      const medido = acerto(x, y, versao);
      const calculado = acertoCalculado(x, y, versao);
      assert.ok(
        Math.abs(calculado - medido) <= 0.3,
        `${versao} «${x}${y}»: medido ${medido}, calculado ${calculado}`,
      );
    }
  }
});

test('o feixe desenha todos os caracteres de um endereço', () => {
  assert.ok(CARACTERES.test(ALFABETO));
  const tabela = letras(3);
  for (const ch of ALFABETO) {
    if (ch !== '.') assert.ok(tabela[ch], `falta a letra «${ch}»`);
    for (const versao of versoes) {
      const { corpo, proporcao } = texto(ch, versao, { classes: true });
      assert.ok(corpo.length > 0, `${versao} «${ch}» sem traço`);
      assert.ok(Number.isFinite(proporcao) && proporcao > 0, `${versao} «${ch}»`);
    }
  }
});

test('em todos os pares, nenhuma letra fica a menos de 3 unidades da outra, nem o halo a toca', () => {
  // As regras do `acertoCalculado`, conferidas par a par. O acerto arredonda
  // à décima, e por isso a tolerância é de meia décima.
  for (const versao of versoes) {
    for (const x of ALFABETO) {
      for (const y of ALFABETO) {
        const { tinta, halo } = brancoDoPar(x, y, versao);
        assert.ok(tinta >= 2.95, `${versao} «${x}${y}»: ${tinta.toFixed(2)} de tinta a tinta`);
        assert.ok(halo >= 0.55, `${versao} «${x}${y}»: o halo a ${halo.toFixed(2)}`);
      }
    }
  }
});

/** As abcissas dos pontos de um caminho do feixe: as de `M` e `L`, e o fim de cada arco. */
function abcissas(d: string): number[] {
  return [...d.matchAll(/([MLA])([^MLA]+)/g)].map(([, comando, resto]) => {
    const n = resto.trim().split(/\s+/).map(Number);
    return comando === 'A' ? n[5] : n[0];
  });
}

test('o hífen não entra na letra do lado: «c-» lia-se «e», e «-z» lia-se «ƶ»', () => {
  // Só as letras da altura de x, em que a tinta mais à direita (ou à
  // esquerda) está na mesma faixa que o hífen.
  for (const versao of ['feixe', 'reduzido'] as const) {
    const { n, lw } = VERSOES[versao];
    for (const letra of 'acemnorsuvwxz') {
      for (const par of [letra + '-', '-' + letra]) {
        const linhas = [
          ...tracos(par, versao, { classes: true }).svg.matchAll(/class="l\d" d="([^"]+)"/g),
        ].map(([, d]) => abcissas(d));
        // O hífen é um traço só: as `n` linhas dele são as últimas do par ou
        // as primeiras, e o resto é a letra.
        const corte = par.startsWith('-') ? n : linhas.length - n;
        const primeira = linhas.slice(0, corte).flat();
        const segunda = linhas.slice(corte).flat();
        // Os traços acabam em meia largura de linha para cada lado.
        const branco = Math.min(...segunda) - Math.max(...primeira) - lw;
        assert.ok(branco >= 2.95, `${versao} «${par}»: ${branco.toFixed(2)}`);
      }
    }
  }
});

test('um endereço que o feixe não sabe desenhar não se desenha — a região assina em texto', () => {
  for (const mau of [
    null,
    undefined,
    '',
    'Meio.paragem.pt',
    'são.paragem.pt',
    'a b.pt',
    'x_y.pt',
  ]) {
    assert.equal(desenhavel(mau), false, String(mau));
    assert.equal(desenharEndereco(mau), null, String(mau));
  }
  const bom = desenharEndereco('prova-municipio.paragem.pt');
  assert.ok(bom);
  assert.equal(bom.endereco, 'prova-municipio.paragem.pt');
  for (const { viewBox, corpo } of [bom.inteira, bom.reduzida]) {
    assert.match(viewBox, /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
    // Classes e não cores: o sítio pinta-o pelo tema, com os tons da região.
    assert.match(corpo, /class="l0"/);
    assert.doesNotMatch(corpo, /stroke="#/);
  }
  // As três linhas na versão inteira, duas na reduzida.
  assert.match(bom.inteira.corpo, /class="l2"/);
  assert.doesNotMatch(bom.reduzida.corpo, /class="l2"/);
});

test('dois endereços ao mesmo tamanho têm a mesma altura de x', () => {
  // A caixa vai das hastes altas à descendente, tenha o endereço letras
  // altas ou não: senão um endereço só de letras baixas saía maior.
  const alturaDe = (t: string) =>
    Number(texto(t, 'feixe', { classes: true }).viewBox.split(' ')[3]);
  assert.equal(alturaDe('meio.paragem.pt'), alturaDe('serra.paragem.pt'));
  assert.equal(alturaDe('xyz'), alturaDe('bdfhkl'));
});
