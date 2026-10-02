/**
 * Dois resultados com o mesmo nome distinguem-se na lista (P2-037).
 *
 * Com nomes inventados: os da região real ficam fora da suite pública.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oQueOsDistingue } from '../src/lib/homonimos.ts';
import type { Ponto } from '../src/lib/formato.ts';

const sitio = (nome: string, lat: number, lon: number, concelho = '', classe = 'place=hamlet') =>
  ({ nome, lat, lon, tipo: 'sitio', id: '', concelho, descricao: 'lugar', classe }) as Ponto;
const rotulo = (p: Ponto) => p.descricao || p.tipo;

const TERRAS = [
  sitio('Vila Serena', 39.5, -10.5, 'serena', 'place=town'),
  sitio('Aldeia do Vento', 39.6, -10.6, 'serena', 'place=village'),
];
const CONCELHOS = { serena: 'Serena', outro: 'Concelho Outro' };

test('dois homónimos de concelhos diferentes levam o concelho', () => {
  const a = sitio('Casal Novo', 39.51, -10.51, 'serena');
  const b = sitio('Casal Novo', 39.2, -10.2, 'outro');
  const r = oQueOsDistingue([a, b], rotulo, CONCELHOS, TERRAS);
  assert.deepEqual(r.get(a), ['Serena']);
  assert.deepEqual(r.get(b), ['Concelho Outro']);
});

test('no mesmo concelho, a terra mais perto de cada um', () => {
  const a = sitio('Casal Novo', 39.51, -10.51, 'serena');
  const b = sitio('Casal Novo', 39.59, -10.59, 'serena');
  const r = oQueOsDistingue([a, b], rotulo, CONCELHOS, TERRAS);
  assert.deepEqual(r.get(a), ['Serena', 'perto de Vila Serena']);
  assert.deepEqual(r.get(b), ['Serena', 'perto de Aldeia do Vento']);
});

test('perto da mesma terra, a distância diz qual é', () => {
  const a = sitio('Moinho', 39.505, -10.5, 'serena');
  const b = sitio('Moinho', 39.53, -10.5, 'serena');
  const r = oQueOsDistingue([a, b], rotulo, CONCELHOS, TERRAS);
  assert.deepEqual(r.get(a), ['Serena', 'a 600 m de Vila Serena']);
  assert.deepEqual(r.get(b), ['Serena', 'a 3 km de Vila Serena']);
});

test('quem já se distingue não ganha nada, e a terra com o mesmo nome não serve de referência', () => {
  const unico = sitio('Fonte Velha', 39.5, -10.5, 'serena');
  const paragem = {
    ...sitio('Vila Serena', 39.501, -10.5, 'serena'),
    tipo: 'paragem',
    descricao: '',
  };
  const terra = TERRAS[0];
  const r = oQueOsDistingue([unico, paragem, terra], rotulo, CONCELHOS, TERRAS);
  assert.deepEqual(r.get(unico), []);
  // O mesmo nome, mas o rótulo já os separa («paragem» e «lugar»): só o concelho.
  assert.deepEqual(r.get(paragem), ['Serena']);
  assert.deepEqual(r.get(terra), ['Serena']);
});
