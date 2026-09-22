/**
 * O que o motor devolve, traduzido para o que o mapa desenha.
 *
 * Corre com o executor do próprio Node, que em 22 lê TypeScript sem
 * ferramenta nenhuma pelo meio:
 *
 *     npm run test:unidade
 *
 * Há aqui uma coisa que só um teste apanha: **a ordem das coordenadas**. O
 * GeoJSON escreve `[lon, lat]`, quem escreve à mão escreve `lat, lon`, e
 * trocá-las não dá erro nenhum — desenha o percurso no meio do Atlântico, a
 * mil quilómetros, e só se vê quando já está publicado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descodificarLinha, percursoDe, caixaDe, type Itinerario } from '../src/lib/otp.ts';

test('descodifica o vetor conhecido da polilinha do Google', () => {
  // O exemplo da documentação do formato, que é o único vetor que toda a
  // gente concorda estar certo. Em `[lon, lat]`, que é a ordem do GeoJSON.
  assert.deepEqual(descodificarLinha('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
});

test('uma polilinha vazia não rebenta nem inventa pontos', () => {
  assert.deepEqual(descodificarLinha(''), []);
});

test('a ordem é [lon, lat] e não [lat, lon]', () => {
  // Uma coordenada do continente: latitude ~39,6, longitude ~-8,4. Se a ordem
  // se trocar, o primeiro número passa a 39,6 — e 39,6 de longitude fica no
  // Curdistão. É por isto que o teste existe.
  const [[lon, lat]] = descodificarLinha(codificar([[39.6, -8.4]]));
  assert.ok(lon < 0, `longitude devia ser negativa, veio ${lon}`);
  assert.ok(lat > 30, `latitude devia rondar os 39, veio ${lat}`);
});

test('o percurso leva uma linha por perna, com a cor do modo', () => {
  const g = percursoDe(itinerario());
  assert.equal(g.features.length, 2);
  assert.deepEqual(
    g.features.map((f) => f.properties.modo),
    ['WALK', 'BUS'],
  );
  // Cores diferentes por modo: a pé e de autocarro não se podem confundir.
  assert.notEqual(g.features[0].properties.cor, g.features[1].properties.cor);
});

test('uma perna sem geometria fica de fora em vez de desenhar um traço vazio', () => {
  const it = itinerario();
  it.legs[1].legGeometry = null;
  assert.equal(percursoDe(it).features.length, 1);
});

test('a caixa envolve o percurso todo', () => {
  const c = caixaDe(percursoDe(itinerario()));
  assert.ok(c, 'devia haver caixa');
  const [[oeste, sul], [este, norte]] = c!;
  assert.ok(oeste <= este && sul <= norte, 'a caixa está do avesso');
  for (const f of percursoDe(itinerario()).features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      assert.ok(lon >= oeste && lon <= este, `${lon} fora da caixa`);
      assert.ok(lat >= sul && lat <= norte, `${lat} fora da caixa`);
    }
  }
});

test('sem geometria nenhuma não há caixa — e não é uma caixa a zero', () => {
  // Uma caixa `[[0,0],[0,0]]` mandava o mapa para o golfo da Guiné.
  assert.equal(caixaDe({ type: 'FeatureCollection', features: [] }), null);
});

/** Codifica em polilinha do Google, só para os testes escreverem coordenadas. */
function codificar(pontos: [number, number][], precisao = 5): string {
  const fator = 10 ** precisao;
  let saida = '';
  let lat = 0;
  let lon = 0;
  for (const [a, b] of pontos) {
    const la = Math.round(a * fator);
    const lo = Math.round(b * fator);
    saida += pedaco(la - lat) + pedaco(lo - lon);
    lat = la;
    lon = lo;
  }
  return saida;
}

function pedaco(valor: number): string {
  let v = valor < 0 ? ~(valor << 1) : valor << 1;
  let s = '';
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

function itinerario(): Itinerario {
  const perna = (mode: string, pontos: [number, number][]) => ({
    mode,
    duration: 600,
    distance: 800,
    startTime: 0,
    endTime: 600,
    route: null,
    from: { name: 'A' },
    to: { name: 'B' },
    legGeometry: { points: codificar(pontos) },
  });
  return {
    duration: 1200,
    startTime: 0,
    endTime: 1200,
    walkDistance: 800,
    legs: [
      perna('WALK', [
        [39.6, -8.41],
        [39.61, -8.4],
      ]),
      perna('BUS', [
        [39.61, -8.4],
        [39.68, -8.3],
      ]),
    ],
  };
}
