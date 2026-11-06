/**
 * «Horários planeados · dados de 3/9/2026» — e nenhuma data quando não se sabe.
 *
 * A data é a que as fontes trazem (`sitio.py`, `datas_dos_horarios`), por
 * modo. Estes testes fixam as duas metades da regra do §4.4: dizer de quando
 * são os dados quando se sabe, e não inventar uma data quando não se sabe.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dataDosHorarios, fraseDosHorarios } from '../src/lib/formato.ts';

const REGIAO = {
  modos: ['autocarro', 'comboio', 'expresso'],
  dados_de: { autocarro: '2026-09-03', comboio: '2026-10-05', expresso: null },
};

test('a data de um modo escreve-se como se lê: dia, mês e ano, sem zeros à esquerda', () => {
  assert.equal(dataDosHorarios(REGIAO, ['autocarro']), '3/9/2026');
  assert.equal(
    fraseDosHorarios('3/9/2026'),
    'Horários planeados · dados de 3/9/2026, não em tempo real.',
  );
});

test('vários modos na mesma página: vale o mais antigo', () => {
  assert.equal(dataDosHorarios(REGIAO, ['comboio', 'autocarro']), '3/9/2026');
});

test('um modo sem data deixa a página sem data — não herda a de outro', () => {
  assert.equal(dataDosHorarios(REGIAO, ['expresso']), null);
  assert.equal(dataDosHorarios(REGIAO, ['autocarro', 'expresso']), null);
  assert.equal(dataDosHorarios(REGIAO), null, 'o planeador mistura-os todos, e um não tem data');
  assert.equal(dataDosHorarios(REGIAO, ['bicicleta']), null, 'um modo de que nada se sabe');
});

test('sem modos pedidos, contam só os que a região tem ligados', () => {
  const comUmDesligado = { ...REGIAO, modos: ['autocarro', 'comboio'] };
  assert.equal(dataDosHorarios(comUmDesligado), '3/9/2026');
});

test('dados de antes disto, ou uma data que não é data, não dão data nenhuma', () => {
  assert.equal(dataDosHorarios({ modos: ['autocarro'] }), null);
  assert.equal(dataDosHorarios(null), null);
  assert.equal(
    dataDosHorarios({ modos: ['autocarro'], dados_de: { autocarro: 'ontem' } }, ['autocarro']),
    null,
  );
  assert.equal(fraseDosHorarios(null), 'Horários planeados, não em tempo real.');
});

// --- de cada feed: desde quando, e até quando -----------------------------------

const FEEDS = {
  rede: {
    modo: 'autocarro',
    terceiro: false,
    operador: 'Alta Transportes',
    de: 'da Alta Transportes',
    em_vigor_desde: '2025-12-05',
    inicio: '2026-11-01',
    fim: '2027-10-31',
  },
  comboio: {
    modo: 'comboio',
    terceiro: true,
    operador: 'Comboios da Serra, S.A.',
    de: null,
    em_vigor_desde: null,
    inicio: '2026-10-25',
    fim: '2026-12-12',
  },
};

/** O dia em que a página se desenha: o fim do feed do comboio está a 36 dias. */
const HOJE = '2026-11-06';

test('a data de conteúdo diz-se com quem a publica, e não a de obtenção', async () => {
  const { frasesDosFeeds } = await import('../src/lib/formato.ts');
  assert.deepEqual(frasesDosFeeds({ feeds: FEEDS }, ['rede'], HOJE), [
    'Horários da Alta Transportes em vigor desde 5/12/2025.',
  ]);
});

test('o feed com o fim perto diz até quando vai — sem adivinhar o artigo', async () => {
  const { frasesDosFeeds } = await import('../src/lib/formato.ts');
  assert.deepEqual(frasesDosFeeds({ feeds: FEEDS }, ['comboio'], HOJE), [
    'Horários do operador Comboios da Serra só até 12/12/2026.',
  ]);
  // A rede da casa primeiro, e o feed que vai mais longe não diz «só até».
  assert.deepEqual(frasesDosFeeds({ feeds: FEEDS }, ['comboio', 'rede'], HOJE), [
    'Horários da Alta Transportes em vigor desde 5/12/2025.',
    'Horários do operador Comboios da Serra só até 12/12/2026.',
  ]);
  // Dados de antes disto, ou um feed que não se conhece: nada.
  assert.deepEqual(frasesDosFeeds({}, ['rede'], HOJE), []);
  assert.deepEqual(frasesDosFeeds({ feeds: FEEDS }, ['outro'], HOJE), []);
});

test('«só até» só quando o fim está perto: acabar antes dos outros não é notícia', async () => {
  const { FIM_PERTO_DIAS, frasesDosFeeds } = await import('../src/lib/formato.ts');
  // A janela de um ano da rede regular acaba antes de um feed de outra
  // entidade — e a onze meses de distância não se diz nada.
  const janela = {
    rede: { ...FEEDS.rede, em_vigor_desde: null, fim: '2027-11-05' },
    outro: { ...FEEDS.comboio, fim: '2028-01-31' },
  };
  assert.deepEqual(frasesDosFeeds({ feeds: janela }, ['rede', 'outro'], HOJE), []);
  // A FIM_PERTO_DIAS diz-se; um dia depois, não.
  const perto = { rede: { ...janela.rede, fim: '2027-01-05' } };
  assert.equal(FIM_PERTO_DIAS, 60);
  assert.deepEqual(frasesDosFeeds({ feeds: perto }, ['rede'], HOJE), [
    'Horários da Alta Transportes só até 5/1/2027.',
  ]);
  assert.deepEqual(frasesDosFeeds({ feeds: perto }, ['rede'], '2026-11-05'), []);
  // Um fim que já passou também se diz: os horários acabaram.
  assert.deepEqual(frasesDosFeeds({ feeds: perto }, ['rede'], '2027-02-01'), [
    'Horários da Alta Transportes só até 5/1/2027.',
  ]);
});

test('a página de um concelho fala dos feeds da rede da casa, e só dos modos ligados', async () => {
  const { feedsProprios } = await import('../src/lib/formato.ts');
  const urbano = { ...FEEDS.rede, modo: 'urbano-municipal' };
  const r = { modos: ['autocarro', 'comboio'], feeds: { ...FEEDS, urbano } };
  assert.deepEqual(feedsProprios(r), ['rede']);
  assert.deepEqual(feedsProprios({ modos: ['autocarro'] }), []);
  assert.deepEqual(feedsProprios(null), []);
});

test('os feeds de uma página saem das chaves dos serviços dela', async () => {
  const { feedsDosServicos } = await import('../src/lib/formato.ts');
  assert.deepEqual(feedsDosServicos(['rede:A-U', 'comboio:1', 'rede:E-U', undefined, 'sem']), [
    'rede',
    'comboio',
  ]);
});
