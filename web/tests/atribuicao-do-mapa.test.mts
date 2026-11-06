/**
 * O canto do mapa credita o OpenMapTiles quando os mosaicos são os do
 * Planetiler — o esquema das camadas é dele, sob CC BY 4.0 —, e só aí: um mapa
 * desenhado por nós não lhe deve nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATRIBUICAO_OPENMAPTILES,
  ATRIBUICAO_OSM,
  atribuicaoDoMapa,
} from '../src/lib/estilo-mapa.ts';

const DO_OSM =
  '© contribuidores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL';

test('um mapa do OpenStreetMap leva também o crédito do OpenMapTiles, com ligação', () => {
  const a = atribuicaoDoMapa({ atribuicao: DO_OSM, fonte: 'openstreetmap' })!;
  assert.ok(a.startsWith(DO_OSM));
  assert.ok(a.endsWith(ATRIBUICAO_OPENMAPTILES));
  // O «©» não fica sozinho no fim de uma linha.
  assert.ok(ATRIBUICAO_OPENMAPTILES.startsWith('©&nbsp;'));
  // Uma vez só, mesmo que os dados um dia o tragam.
  assert.equal(atribuicaoDoMapa({ atribuicao: a, fonte: 'openstreetmap' }), a);
});

test('um mapa desenhado por nós diz só o que a receita declara', () => {
  const nosso = 'Mapa inventado pelo Paragem.pt, para a demonstração';
  assert.equal(atribuicaoDoMapa({ atribuicao: nosso, fonte: 'propria' }), nosso);
});

test('dados de antes da declaração ficam com a de omissão, que é a do Planetiler', () => {
  assert.equal(atribuicaoDoMapa(undefined), undefined);
  assert.match(ATRIBUICAO_OSM, /OpenStreetMap/);
  assert.ok(ATRIBUICAO_OSM.endsWith(ATRIBUICAO_OPENMAPTILES));
});
