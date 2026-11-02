/**
 * As sedes de concelho no mapa (`lib/sedes.ts`): o sítio de cada uma é o do
 * lugar do OpenStreetMap com o nome do concelho — e, sem ele, o concelho fica
 * sem nome no mapa em vez de um nome posto ao acaso (§4.4).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sedesDosConcelhos } from '../src/lib/sedes.ts';
import type { Ponto } from '../src/lib/formato.ts';

const sitio = (nome: string, classe: string, concelho: string, lat = 40, lon = -30): Ponto => ({
  nome,
  lat,
  lon,
  tipo: 'sitio',
  id: '',
  concelho,
  classe,
});

const CONCELHOS = [
  { id: 'porto-ameno', nome: 'Porto Ameno' },
  { id: 'almeao', nome: 'Almeão' },
  { id: 'serra-funda', nome: 'Serra Funda' },
];

test('entre duas sedes que não cabem, a cidade ganha à vila, e depois a mais servida', () => {
  const [cidade, vila, outraVila] = sedesDosConcelhos(
    [
      { id: 'porto-ameno', nome: 'Porto Ameno', paragens: 10 },
      { id: 'almeao', nome: 'Almeão', paragens: 400 },
      { id: 'serra-funda', nome: 'Serra Funda', paragens: 42 },
    ],
    [
      sitio('Porto Ameno', 'place=city', 'porto-ameno'),
      sitio('Almeão', 'place=town', 'almeao'),
      sitio('Serra Funda', 'place=town', 'serra-funda'),
    ],
  );
  assert.ok(cidade.peso > vila.peso, 'a cidade com menos paragens ganha à vila com mais');
  assert.ok(vila.peso > outraVila.peso, 'entre duas vilas, a mais servida');
});

test('a sede é o lugar com o nome do concelho, dentro dele', () => {
  const sedes = sedesDosConcelhos(CONCELHOS, [
    sitio('Porto Ameno', 'place=town', 'porto-ameno', 40.1, -30.2),
    sitio('Café Porto Ameno', 'amenity=cafe', 'porto-ameno'),
    sitio('Almeão', 'place=village', 'almeao', 40.3, -30.4),
  ]);
  assert.deepEqual(sedes, [
    { nome: 'Porto Ameno', lat: 40.1, lon: -30.2, concelho: 'porto-ameno', peso: 200_000 },
    { nome: 'Almeão', lat: 40.3, lon: -30.4, concelho: 'almeao', peso: 100_000 },
  ]);
});

test('sem lugar com o nome, o concelho fica sem sede — não se inventa uma', () => {
  const sedes = sedesDosConcelhos(CONCELHOS, [
    // Um lugar com o nome certo, mas noutro concelho, não é a sede deste.
    sitio('Serra Funda', 'place=town', 'almeao'),
    // E um sítio que não é um lugar também não.
    sitio('Serra Funda', 'amenity=school', 'serra-funda'),
  ]);
  assert.deepEqual(sedes, []);
});

test('a cidade ganha à aldeia homónima, e o nome lê-se sem acentos nem maiúsculas', () => {
  const sedes = sedesDosConcelhos(CONCELHOS, [
    sitio('almeao', 'place=village', 'almeao', 1, 1),
    sitio('Almeão', 'place=city', 'almeao', 2, 2),
  ]);
  assert.equal(sedes.length, 1);
  assert.equal(sedes[0].lat, 2);
});
