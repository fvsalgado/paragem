/**
 * A procura nas paragens, feita no servidor (auditoria de 1/11/2026, #103), e
 * as linhas de cada paragem pela ordem dos números (#183).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparParagens, coresPorNumero, linhasPorOrdem } from '../src/lib/lista-de-paragens.ts';
import { palavrasDe, procurarParagens } from '../src/lib/procura-de-paragens.ts';
import type { Linha, Paragem, Ponto } from '../src/lib/formato.ts';

const p = (
  id: string,
  nome: string,
  lat: number,
  lon: number,
  partidas = 1,
  concelho: string | null = 'pedra-alta',
): Paragem => ({
  id,
  nome,
  ordem: nome.toLowerCase(),
  lat,
  lon,
  concelho,
  linhas: ['7'],
  partidas,
});

const PARAGENS = [
  p('t1', 'Pedra Alta (Terminal)', 40.1, -7.6, 90),
  p('t2', 'Pedra Alta (Mercado)', 40.102, -7.6, 40),
  p('v1', 'Vale Fundo (Escola)', 40.2, -7.7, 5, 'vale-fundo'),
  p('c1', 'Cruzamento da Fonte', 40.3001, -7.8, 3, 'vale-fundo'),
  p('f1', 'Lá Fora (Largo)', 41.0, -8.0, 2, null),
];
const grupos = agruparParagens(PARAGENS);
const nomesDosConcelhos = { 'pedra-alta': 'Pedra Alta', 'vale-fundo': 'Vale Fundo' };
const linha = (id: string, codigo: string, nome: string, cor: string | null = null): Linha => ({
  id,
  codigo,
  nome,
  ordem: codigo.padStart(9, '0'),
  cor,
  cor_texto: null,
  modo: 'autocarro',
  viagens: 4,
});
const LINHAS = [
  linha('7', '7', 'Pedra Alta - Vale Fundo', '1D4E9E'),
  linha('70', '70', 'Pedra Alta - Serra'),
  linha('x-7', '7', 'Outra casa - Longe'),
];
const terra = (nome: string, lat: number, lon: number, classe = 'place=village'): Ponto => ({
  nome,
  lat,
  lon,
  tipo: 'sitio',
  id: '',
  concelho: 'vale-fundo',
  classe,
});

test('as palavras comparam-se sem acentos, sem maiúsculas e sem parênteses', () => {
  assert.deepEqual(palavrasDe('  Pédra ALTA (Terminal) '), ['pedra', 'alta', 'terminal']);
});

test('acha a paragem pelo nome, com as palavras por qualquer ordem', () => {
  const r = procurarParagens('terminal pedra', { grupos, nomesDosConcelhos });
  assert.deepEqual(
    r.paragens.map((g) => g.principal.id),
    ['t1'],
  );
});

test('o nome do concelho ajuda, mas sozinho não devolve o concelho inteiro', () => {
  // «Escola» está no nome; «Vale Fundo» está no nome e no concelho.
  const r = procurarParagens('escola vale fundo', { grupos, nomesDosConcelhos });
  assert.deepEqual(
    r.paragens.map((g) => g.principal.id),
    ['v1'],
  );
  // O nome do concelho sozinho só acha as paragens que o têm no nome.
  const so = procurarParagens('vale fundo', { grupos, nomesDosConcelhos });
  assert.deepEqual(
    so.paragens.map((g) => g.principal.id),
    ['v1'],
  );
});

test('as da região primeiro, e dentro delas as mais servidas', () => {
  const r = procurarParagens('a', { grupos, nomesDosConcelhos });
  assert.equal(r.total, 0, 'uma letra só não procura nada');
  const pa = procurarParagens('pedra alta', { grupos, nomesDosConcelhos });
  assert.deepEqual(
    pa.paragens.map((g) => g.principal.id),
    ['t1', 't2'],
  );
});

test('a linha acha-se pelo número exato, à frente das que o têm no nome', () => {
  const r = procurarParagens('7', { grupos, nomesDosConcelhos, linhas: LINHAS });
  assert.deepEqual(
    r.linhas.map((l) => l.id),
    ['7', 'x-7'],
  );
  const pelo = procurarParagens('serra', { grupos, nomesDosConcelhos, linhas: LINHAS });
  assert.deepEqual(
    pelo.linhas.map((l) => l.id),
    ['70'],
  );
});

test('uma terra sem paragem com o nome dela devolve as paragens à volta', () => {
  const terras = [
    terra('Fonte Velha', 40.3, -7.8),
    // Um café com o mesmo nome não é uma terra.
    terra('Fonte Velha', 40.1, -7.6, 'amenity=cafe'),
  ];
  const r = procurarParagens('fonte velha', { grupos, nomesDosConcelhos, terras });
  assert.equal(r.paragens.length, 0);
  assert.deepEqual(
    r.perto.map((t) => [t.terra, t.grupos.map((g) => g.principal.id)]),
    [['Fonte Velha', ['c1']]],
  );
});

test('o limite corta a lista, e o total diz quantas eram', () => {
  const r = procurarParagens('pedra', { grupos, nomesDosConcelhos, limite: 1 });
  assert.equal(r.paragens.length, 1);
  assert.equal(r.total, 2);
});

test('as linhas de uma paragem vão pela ordem dos números, e não do texto', () => {
  assert.deepEqual(linhasPorOrdem(['1001', '8', '905', '10']), ['8', '10', '905', '1001']);
});

test('a cor de uma linha pelo número só quando o número é de uma linha só', () => {
  const cores = coresPorNumero(LINHAS);
  assert.equal(cores['70'], null);
  assert.equal('7' in cores, false, 'o 7 é de duas casas: fica neutro');
});
