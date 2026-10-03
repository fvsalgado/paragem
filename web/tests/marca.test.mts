/**
 * A marca da região como o sítio a lê (`lib/marca.ts`): a do §6 quando os
 * dados não trazem marca ou trazem uma estragada, e os três tons do feixe que
 * se tiram da cor dela — que se leem, seja qual for a cor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contraste, lab } from '../src/lib/cor.ts';
import {
  assinaturaDaRegiao,
  COR_DO_PRODUTO,
  estiloDaRegiao,
  feixeDaRegiao,
  marcaDaRegiao,
  nomesDaAssinatura,
} from '../src/lib/marca.ts';

/**
 * Cores de região de toda a roda, e as que costumam partir regras: um amarelo
 * e um ciano muito claros, um azul quase preto, um cinzento, o vermelho do
 * alerta, um magenta saturado, e o laranja médio que a faixa recusava.
 */
const CORES = [
  COR_DO_PRODUTO,
  '#d9643a',
  '#f2a541',
  '#2d6a3e',
  '#5b3a8e',
  '#a3261b',
  '#808080',
  '#ffeb3b',
  '#00ffff',
  '#102c3f',
  '#e6007e',
  '#4cc',
];
/** Os fundos do §6 onde o feixe e as ligações aparecem, em cada tema. */
const CLAROS = ['#f5f7f4', '#ffffff', '#eef2f0'];
const ESCUROS = ['#0f1a20', '#16242c', '#1d2e37'];
const croma = (cor: string) => Math.hypot(lab(cor)[1], lab(cor)[2]);

test('sem marca nos dados, a cor é a do §6, sem logótipo', () => {
  const m = marcaDaRegiao({});
  assert.deepEqual(m, {
    cor: COR_DO_PRODUTO,
    feixe: feixeDaRegiao(COR_DO_PRODUTO),
    logotipo: null,
    logotipoProporcao: null,
    propria: false,
  });
});

test('uma cor que não é cor fica a do produto; qualquer cor que o seja é da região', () => {
  for (const estragada of ['laranja', '#12', '']) {
    const m = marcaDaRegiao({ marca: { cor: estragada, propria: true } });
    assert.equal(m.cor, COR_DO_PRODUTO, estragada);
    assert.equal(m.propria, false, estragada);
  }
  // Um laranja médio: a faixa recusava-o — nem o branco nem o azul-escuro se
  // liam por cima. Os tons tiram-se dele e leem-se (testes abaixo).
  const m = marcaDaRegiao({ marca: { cor: '#D9643A', propria: true } });
  assert.equal(m.cor, '#d9643a');
  assert.equal(m.propria, true);
  assert.deepEqual(m.feixe, feixeDaRegiao('#d9643a'));
});

test('o logótipo só vale se for um caminho do armazém da região', () => {
  const bom = marcaDaRegiao({
    marca: { cor: '#f2a541', logotipo: 'marca/logotipo-bfcf94e878.svg', logotipo_proporcao: 2 },
  });
  assert.equal(bom.logotipo, 'marca/logotipo-bfcf94e878.svg');
  assert.equal(bom.logotipoProporcao, 2);
  for (const mau of ['https://exemplo.org/a.svg', '../segredo.svg', 'marca/a.svg?x=1']) {
    assert.equal(marcaDaRegiao({ marca: { logotipo: mau } }).logotipo, null, mau);
  }
});

test('a assinatura é a rede e o que ela é — ou só o que ela é', () => {
  assert.deepEqual(nomesDaAssinatura({ rede: { nome: 'Rede Serena' }, de: 'da Vila Serena' }), {
    principal: 'Rede Serena',
    secundario: 'Transportes da Vila Serena',
  });
  assert.deepEqual(nomesDaAssinatura({ rede: {}, de: 'do Vale Serena' }), {
    principal: 'Transportes do Vale Serena',
    secundario: null,
  });
});

test('o feixe de uma região cumpre as regras do do produto, seja qual for a cor dela', () => {
  for (const cor of CORES) {
    const { claro, escuro } = feixeDaRegiao(cor);
    // A linha de fora segura a silhueta sozinha: ≥ 3:1 em cada fundo (§6).
    for (const fundo of CLAROS) {
      const c = contraste(claro[0], fundo);
      assert.ok(c >= 3, `${cor}: ${claro[0]} sobre ${fundo} dá ${c.toFixed(2)}:1`);
    }
    for (const fundo of ESCUROS) {
      const c = contraste(escuro[0], fundo);
      assert.ok(c >= 3, `${cor}: ${escuro[0]} sobre ${fundo} dá ${c.toFixed(2)}:1`);
    }
    // De fora para dentro, a luminosidade sobe ≥ 15 de L* — no claro, para
    // dentro do papel; no escuro, para o branco —, e as linhas distinguem-se
    // em cinzento e com daltonismo.
    for (const tons of [claro, escuro]) {
      for (let i = 1; i < 3; i++) {
        const d = lab(tons[i])[0] - lab(tons[i - 1])[0];
        assert.ok(d >= 15, `${cor}: ${tons[i - 1]} → ${tons[i]} sobe ${d.toFixed(1)} de L*`);
      }
    }
  }
});

test('o tom do feixe é o da região, e uma região cinzenta fica cinzenta', () => {
  for (const cor of CORES.filter((c) => croma(c) >= 24)) {
    const tom = (c: string) => (Math.atan2(lab(c)[2], lab(c)[1]) * 180) / Math.PI;
    for (const linha of feixeDaRegiao(cor).claro) {
      const d = Math.abs(((tom(linha) - tom(cor) + 540) % 360) - 180);
      assert.ok(d <= 6, `${cor} → ${linha}: o tom mudou ${d.toFixed(1)}°`);
    }
  }
  for (const linha of feixeDaRegiao('#808080').claro) {
    assert.ok(croma(linha) < 2, `#808080 → ${linha}`);
  }
});

test('a linha de fora é a cor dos botões e das ligações, e lê-se nos dois papéis', () => {
  for (const cor of CORES) {
    const e = estiloDaRegiao(marcaDaRegiao({ marca: { cor } }));
    // Como fundo de um botão, com o branco por cima; como texto de uma
    // ligação, sobre o papel e as superfícies do tema claro.
    for (const chave of ['--regiao-marca', '--regiao-marca-hover']) {
      for (const fundo of CLAROS) {
        const c = contraste(e[chave], fundo);
        assert.ok(c >= 4.5, `${cor}: ${chave} ${e[chave]} sobre ${fundo} dá ${c.toFixed(2)}:1`);
      }
    }
    // No tema escuro, as ligações passam às linhas claras do feixe escuro.
    for (const chave of ['--regiao-feixe-escuro-2', '--regiao-feixe-escuro-3']) {
      for (const fundo of ESCUROS) {
        const c = contraste(e[chave], fundo);
        assert.ok(c >= 4.5, `${cor}: ${chave} ${e[chave]} sobre ${fundo} dá ${c.toFixed(2)}:1`);
      }
    }
  }
});

test('a assinatura desenha o endereço, e só um endereço que o feixe sabe desenhar', () => {
  const r = { rede: { nome: 'Rede Serena' }, de: 'da Vila Serena' };
  const com = assinaturaDaRegiao({ ...r, dominio: 'serena.paragem.pt' });
  assert.equal(com.endereco?.endereco, 'serena.paragem.pt');
  assert.equal(com.principal, 'Rede Serena');
  // Dados de antes de o domínio ser declarado, e um com acentos: assina em texto.
  assert.equal(assinaturaDaRegiao(r).endereco, null);
  assert.equal(assinaturaDaRegiao({ ...r, dominio: 'são.paragem.pt' }).endereco, null);
});
