/**
 * Os avisos: o que está em vigor, por que ordem, e — sobretudo — que o mesmo
 * vocabulário do GTFS-RT está escrito igual nos três sítios onde tem de estar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

import {
  CAUSAS,
  EFEITOS,
  GRAVIDADES,
  aplicaALinha,
  aplicaAParagem,
  causaDeclarada,
  efeitoDeclarado,
  emVigor,
  ondeAparece,
  ordenar,
  prazoDoAviso,
  quandoVale,
  redeToda,
  type Aviso,
} from '../src/lib/avisos.ts';
import { CAUSA, EFEITO, GRAVIDADE } from '../src/lib/gtfs-rt.ts';

const BASE: Aviso = {
  id: 'a',
  region_id: 'prova',
  titulo: 'Obra',
  texto: 'x',
  gravidade: 'WARNING',
  causa: 'CONSTRUCTION',
  efeito: 'DETOUR',
  inicio: null,
  fim: null,
  linhas: [],
  paragens: [],
  modos: [],
  url: null,
  publicado: true,
  created_by: 'gestor',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const AGORA = new Date('2026-09-23T12:00:00Z');

test('sem prazo nenhum, está em vigor', () => {
  // É o caso mais comum: «isto está a acontecer e não se sabe quando acaba».
  assert.equal(emVigor(BASE, AGORA), true);
});

test('antes de começar, não', () => {
  assert.equal(emVigor({ ...BASE, inicio: '2026-09-24T00:00:00Z' }, AGORA), false);
});

test('depois de acabar, não — e é isto que tira um aviso do sítio sozinho', () => {
  assert.equal(emVigor({ ...BASE, fim: '2026-09-22T00:00:00Z' }, AGORA), false);
});

test('sem fim declarado continua em vigor, por mais velho que seja', () => {
  // Não se inventa um fim. Quem publicou é que o retira.
  assert.equal(emVigor({ ...BASE, inicio: '2020-01-01T00:00:00Z' }, AGORA), true);
});

test('os graves primeiro, e dentro da mesma gravidade o mais recente', () => {
  const avisos: Aviso[] = [
    { ...BASE, id: 'info', gravidade: 'INFO', inicio: '2026-09-23T09:00:00Z' },
    { ...BASE, id: 'grave-velho', gravidade: 'SEVERE', inicio: '2026-09-20T09:00:00Z' },
    { ...BASE, id: 'grave-novo', gravidade: 'SEVERE', inicio: '2026-09-23T06:00:00Z' },
    { ...BASE, id: 'aviso', gravidade: 'WARNING', inicio: '2026-09-23T11:00:00Z' },
  ];
  assert.deepEqual(
    ordenar(avisos).map((a) => a.id),
    ['grave-novo', 'grave-velho', 'aviso', 'info'],
  );
});

test('ordenar não mexe no que lhe dão', () => {
  const avisos = [
    { ...BASE, id: 'b' },
    { ...BASE, id: 'a', gravidade: 'SEVERE' },
  ];
  ordenar(avisos);
  assert.deepEqual(
    avisos.map((a) => a.id),
    ['b', 'a'],
  );
});

// --- o vocabulário, nos três sítios ----------------------------------------

/**
 * O MESMO ENUM ESTÁ ESCRITO TRÊS VEZES, e não há maneira honesta de o
 * reduzir a duas: a base precisa dele em SQL literal (`check`), o feed
 * precisa dos NÚMEROS da especificação, e o painel precisa dos nomes em
 * português. As duas cópias em TypeScript já não podem divergir — o tipo
 * `Record<Causa, string>` não compila sem todas —, e esta é a terceira.
 *
 * Lê-se a migração. Se alguém acrescentar um valor ao `check` e se esquecer
 * do resto, ou ao contrário, isto diz qual e onde.
 */
const PASTA = new URL('../../supabase/migrations/', import.meta.url);
/* PELO NOME E NÃO PELO CARIMBO. A versão de uma migração é a hora a que ela
   correu no projeto real, e o ficheiro é renomeado para bater certo com ela —
   senão um `db push` futuro tenta aplicá-la outra vez. Um teste preso ao
   carimbo partia-se nessa renomeação, e a mensagem não diria porquê. */
const NOME = readdirSync(PASTA).find((f) => f.endsWith('_0007_os_avisos.sql'));
assert.ok(NOME, 'não encontrei a migração dos avisos');
const MIGRACAO = readFileSync(new URL(NOME!, PASTA), 'utf8');

/** Os valores de um `check (<coluna> in ('A', 'B', …))`, como conjunto. */
function valoresNoCheck(coluna: string): Set<string> {
  const m = new RegExp(`check \\(${coluna} in \\(([^)]*)\\)\\)`, 's').exec(MIGRACAO);
  assert.ok(m, `não encontrei o check de ${coluna} na migração`);
  return new Set([...m![1]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]!));
}

const iguais = (a: Set<string>, b: Set<string>) =>
  [...a].sort().join(',') === [...b].sort().join(',');

test('a gravidade é a mesma na base, no feed e no painel', () => {
  const naBase = valoresNoCheck('gravidade');
  assert.ok(iguais(naBase, new Set(Object.keys(GRAVIDADE))), 'base vs. feed');
  assert.ok(iguais(naBase, new Set(Object.keys(GRAVIDADES))), 'base vs. painel');
});

test('a causa é a mesma na base, no feed e no painel', () => {
  const naBase = valoresNoCheck('causa');
  assert.ok(iguais(naBase, new Set(Object.keys(CAUSA))), 'base vs. feed');
  assert.ok(iguais(naBase, new Set(Object.keys(CAUSAS))), 'base vs. painel');
});

test('o efeito é o mesmo na base, no feed e no painel', () => {
  const naBase = valoresNoCheck('efeito');
  assert.ok(iguais(naBase, new Set(Object.keys(EFEITO))), 'base vs. feed');
  assert.ok(iguais(naBase, new Set(Object.keys(EFEITOS))), 'base vs. painel');
});

test('os rótulos do painel estão em português, e não são o nome da especificação', () => {
  // Um rótulo esquecido fica igual ao nome do GTFS-RT — «STRIKE» num menu
  // que devia dizer «greve». Compila e passa despercebido.
  for (const [nome, rotulo] of [
    ...Object.entries(GRAVIDADES),
    ...Object.entries(CAUSAS),
    ...Object.entries(EFEITOS),
  ]) {
    assert.notEqual(rotulo, nome, `«${nome}» ficou por traduzir`);
    assert.match(rotulo, /^[a-zà-ÿ]/u, `«${nome}» devia ter um rótulo em minúsculas`);
  }
});

test('a página pública dá a hora do aviso no fuso da região, e não no do servidor', () => {
  // O servidor corre em UTC. O aviso que o técnico marcou para as 7h de 1 de
  // outubro (6h UTC, no verão) saía na página pública às 6h: o componente
  // formatava sem fuso. O painel, que já usava o fuso declarado, dizia 7h.
  const antes = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const texto = prazoDoAviso({ inicio: '2026-10-01T06:00:00.000Z', fim: null }, 'Europe/Lisbon');
    assert.match(texto, /desde 1 de outubro de 2026.*07:00/);
    assert.doesNotMatch(texto, /06:00/);
    assert.match(texto, /sem fim previsto$/);
    // Sem fuso passado, vale o da casa (`PARAGEM_FUSO`, Lisboa por omissão).
    assert.match(prazoDoAviso({ inicio: '2026-10-01T06:00:00.000Z', fim: null }), /07:00/);
    // No inverno, a hora de Lisboa é a de UTC.
    assert.match(prazoDoAviso({ inicio: null, fim: '2026-12-01T18:00:00.000Z' }), /até .*18:00/);
  } finally {
    process.env.TZ = antes;
  }
});

test('sem início nem fim não se escreve prazo nenhum, e sem fim não se inventa um', () => {
  assert.equal(prazoDoAviso({ inicio: null, fim: null }), '');
  assert.doesNotMatch(prazoDoAviso({ inicio: null, fim: '2026-12-01T18:00:00Z' }), /sem fim/);
});

// --- onde um aviso aparece (P4-019, P2-025) ---------------------------------

const LINHA_1 = { id: 'RA1', modo: 'autocarro', paragens: ['pa_mercado', 'rc_ponte'] };

test('o aviso de uma linha aparece na página dela, e não na de outra', () => {
  const a = { linhas: ['RA1'], paragens: [], modos: [] };
  assert.equal(aplicaALinha(a, LINHA_1), true);
  assert.equal(aplicaALinha(a, { id: 'RA2', modo: 'autocarro', paragens: ['pa_mercado'] }), false);
});

test('o aviso de uma paragem aparece nas linhas que lá passam', () => {
  const a = { linhas: [], paragens: ['rc_ponte'], modos: [] };
  assert.equal(aplicaALinha(a, LINHA_1), true);
  assert.equal(aplicaALinha(a, { id: 'RA2', modo: 'autocarro', paragens: ['pa_mercado'] }), false);
});

test('o aviso de uma linha aparece nas paragens dela, e o de uma paragem só nela', () => {
  const daLinha = { linhas: ['RA1'], paragens: [], modos: [] };
  assert.equal(
    aplicaAParagem(daLinha, { id: 'x', linhas: ['RA1', 'RA2'], modos: ['autocarro'] }),
    true,
  );
  assert.equal(aplicaAParagem(daLinha, { id: 'x', linhas: ['RA2'], modos: ['autocarro'] }), false);
  const daParagem = { linhas: [], paragens: ['rc_ponte'], modos: [] };
  assert.equal(aplicaAParagem(daParagem, { id: 'rc_ponte', linhas: [], modos: [] }), true);
  assert.equal(aplicaAParagem(daParagem, { id: 'pa_mercado', linhas: ['RA1'], modos: [] }), false);
});

test('um modo inteiro vale para o que é desse modo — e só quando não se nomeou mais nada', () => {
  const bicicletas = { linhas: [], paragens: [], modos: ['bicicleta'] };
  assert.equal(aplicaAParagem(bicicletas, { id: 'doca', linhas: [], modos: ['bicicleta'] }), true);
  assert.equal(
    aplicaAParagem(bicicletas, { id: 'p', linhas: ['RA1'], modos: ['autocarro'] }),
    false,
  );
  assert.equal(aplicaALinha(bicicletas, LINHA_1), false);
  // Com uma linha nomeada, o modo não alarga o aviso a todas as outras.
  const linhaEModo = { linhas: ['RA2'], paragens: [], modos: ['autocarro'] };
  assert.equal(aplicaALinha(linhaEModo, LINHA_1), false);
});

test('sem nada nomeado é a rede toda, e aparece em todo o lado', () => {
  const a = { linhas: [], paragens: [], modos: [] };
  assert.equal(redeToda(a), true);
  assert.equal(aplicaALinha(a, LINHA_1), true);
  assert.equal(aplicaAParagem(a, { id: 'p', linhas: [], modos: [] }), true);
});

test('o efeito e a causa só se dizem quando foram declarados (P4-018)', () => {
  assert.equal(efeitoDeclarado('DETOUR'), true);
  assert.equal(efeitoDeclarado('OTHER_EFFECT'), false);
  assert.equal(efeitoDeclarado('UNKNOWN_EFFECT'), false);
  assert.equal(efeitoDeclarado('INVENTADO'), false);
  assert.equal(causaDeclarada('STRIKE'), true);
  assert.equal(causaDeclarada('UNKNOWN_CAUSE'), false);
  assert.equal(causaDeclarada('OTHER_CAUSE'), false);
});

test('o prazo numa frase que se lê sozinha, no fuso da região', () => {
  const verao = { inicio: '2026-07-01T06:00:00Z', fim: null };
  assert.match(
    quandoVale(verao, 'Europe/Lisbon'),
    /^Desde 1 de julho de 2026.*07:00, sem fim previsto$/,
  );
  assert.match(
    quandoVale({ inicio: null, fim: '2026-12-01T18:00:00Z' }, 'Europe/Lisbon'),
    /^Até 1 de dezembro de 2026.*18:00$/,
  );
  assert.equal(quandoVale({ inicio: null, fim: null }), '');
});

test('quem escreve sabe onde o aviso vai aparecer, pelos números das linhas', () => {
  const catalogo = {
    linhas: new Map([['RA1', { id: 'RA1', codigo: '1', nome: 'Pedra Alta – Ribeira', cor: null }]]),
    paragens: new Map([['rc_ponte', 'Ribeira do Corvo (Ponte)']]),
  };
  const onde = ondeAparece({ linhas: ['RA1'], paragens: ['rc_ponte'], modos: [] }, catalogo);
  assert.ok(onde.includes('na página da linha 1'), onde.join(' | '));
  assert.ok(
    onde.some((s) => s.includes('Ribeira do Corvo (Ponte)')),
    onde.join(' | '),
  );
  assert.ok(!onde.join(' ').includes('RA1'), 'o identificador do GTFS não aparece a quem escreve');
  const rede = ondeAparece({ linhas: [], paragens: [], modos: [] }, catalogo);
  assert.ok(
    rede.some((s) => s.includes('todas as linhas')),
    rede.join(' | '),
  );
});
