/**
 * A lista das paragens, uma por sítio (auditoria de 1/11/2026, #15).
 *
 * Os dois lados da estrada contam como uma; o mesmo nome longe é outro sítio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparParagens, doMesmoSitio } from '../src/lib/lista-de-paragens.ts';
import type { Paragem } from '../src/lib/formato.ts';

const p = (
  id: string,
  nome: string,
  lat: number,
  lon: number,
  partidas = 1,
  linhas: string[] = [],
  concelho: string | null = 'serra',
): Paragem => ({ id, nome, ordem: nome.toLowerCase(), lat, lon, concelho, linhas, partidas });

// 0,001° de latitude são uns 111 m.
const lados = [
  p('a1', 'Aldeia (Centro)', 39.9, -8.5, 5, ['7']),
  p('a2', 'Aldeia (Centro)', 39.9008, -8.5, 6, ['7', '8']),
];

test('os dois lados da estrada são uma linha, que leva ao mais servido e junta as linhas', () => {
  const g = agruparParagens(lados);
  assert.equal(g.length, 1);
  assert.equal(g[0].principal.id, 'a2');
  assert.deepEqual(
    g[0].paragens.map((x) => x.id),
    ['a2', 'a1'],
  );
  assert.deepEqual(g[0].linhas, ['7', '8']);
});

test('o mesmo nome longe é outro sítio, e fica noutra linha', () => {
  const longe = p('a3', 'Aldeia (Centro)', 39.95, -8.5, 2, ['9'], null);
  const g = agruparParagens([...lados, longe]);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.concelho).sort(), [null, 'serra'].sort());
});

test('em cadeia: três postes de um largo, cada um perto do seguinte', () => {
  const g = agruparParagens([
    p('t1', 'Terminal', 39.9, -8.5),
    p('t2', 'Terminal', 39.9025, -8.5),
    p('t3', 'Terminal', 39.905, -8.5),
  ]);
  assert.equal(g.length, 1);
});

test('nomes diferentes nunca se juntam, e a ordem é a da lista', () => {
  const g = agruparParagens([p('b', 'Beta', 39.9, -8.5), p('a', 'Alfa', 39.9, -8.5)]);
  assert.deepEqual(
    g.map((x) => x.nome),
    ['Alfa', 'Beta'],
  );
});

test('a página de uma paragem conhece as outras do mesmo sítio, e só essas', () => {
  const longe = p('a3', 'Aldeia (Centro)', 39.95, -8.5);
  assert.deepEqual(
    doMesmoSitio(lados[0], [...lados, longe]).map((x) => x.id),
    ['a2'],
  );
  assert.deepEqual(doMesmoSitio(longe, [...lados, longe]), []);
});

test('para onde vão as partidas: os dois destinos mais comuns, sem circulares nem a própria', async () => {
  const { paraOnde } = await import('../src/lib/lista-de-paragens.ts');
  const d = (destino: string, circular = false) => ({ destino, circular });
  assert.deepEqual(
    paraOnde([d('Norte'), d('Sul'), d('Norte'), d('Aqui'), d('Aqui', true), d('Leste')], 'Aqui'),
    ['Norte', 'Sul'],
  );
  assert.deepEqual(paraOnde([], 'Aqui'), []);
});

test('o último recurso: onde fica cada sítio em relação aos outros', async () => {
  const { posicoesRelativas } = await import('../src/lib/lista-de-paragens.ts');
  assert.deepEqual(
    posicoesRelativas([
      { lat: 39.7, lon: -8 },
      { lat: 39.8, lon: -8 },
    ]),
    ['a sul', 'a norte'],
  );
  assert.deepEqual(
    posicoesRelativas([
      { lat: 39.7, lon: -7.9 },
      { lat: 39.7, lon: -8.1 },
    ]),
    ['a leste', 'a oeste'],
  );
  assert.deepEqual(
    posicoesRelativas([
      { lat: 39.6, lon: -8 },
      { lat: 39.9, lon: -8 },
      { lat: 39.7, lon: -8 },
    ]),
    ['3.ª de norte para sul', '1.ª de norte para sul', '2.ª de norte para sul'],
  );
});
