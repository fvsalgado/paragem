/**
 * Os avisos: o que está em vigor, por que ordem, e — sobretudo — que o mesmo
 * vocabulário do GTFS-RT está escrito igual nos três sítios onde tem de estar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { CAUSAS, EFEITOS, GRAVIDADES, emVigor, ordenar, type Aviso } from '../src/lib/avisos.ts';
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
const MIGRACAO = readFileSync(
  new URL('../../supabase/migrations/20260923020000_0007_os_avisos.sql', import.meta.url),
  'utf8',
);

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
