/**
 * O que se mostra de uma viagem, e por que ordem.
 *
 * Duas coisas que a lista de opções fazia mal, e que só um teste segura:
 *
 * - pernas a pé seguidas, e passos de zero minutos da paragem para ela
 *   própria (P2-011);
 * - abrir e desenhar sozinha a primeira opção da lista, mesmo quando era uma
 *   volta de 260 km por fora da região (P2-009).
 *
 * As viagens são inventadas, com a forma que o motor e o planeador do
 * navegador devolvem.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrumarParaMostrar,
  contarTransbordos,
  diaMais,
  limparPernas,
  procurarNosDias,
  semRepetidas,
  semVoltas,
} from '../src/lib/viagens.ts';
import type { Itinerario, Perna } from '../src/lib/otp.ts';

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 2, 8, 0);

function perna(
  mode: string,
  de: string,
  para: string,
  inicio: number,
  minutos: number,
  metros: number,
): Perna {
  return {
    mode,
    duration: minutos * 60,
    distance: metros,
    startTime: T0 + inicio * MIN,
    endTime: T0 + (inicio + minutos) * MIN,
    route: mode === 'WALK' ? null : { shortName: '1', longName: null, color: null },
    from: { name: de },
    to: { name: para },
    legGeometry: null,
  };
}

function viagem(legs: Perna[]): Itinerario {
  const inicio = legs[0].startTime;
  const fim = legs[legs.length - 1].endTime;
  return {
    duration: (fim - inicio) / 1000,
    startTime: inicio,
    endTime: fim,
    walkDistance: legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + l.distance, 0),
    legs,
  };
}

test('duas pernas a pé seguidas são uma só', () => {
  const it = viagem([
    perna('WALK', 'Casa', 'Vila Alta (Terminal)', 0, 4, 300),
    perna('WALK', 'Vila Alta (Terminal)', 'Vila Alta (Estação)', 4, 3, 200),
    perna('RAIL', 'Vila Alta (Estação)', 'Ribeira', 10, 20, 15000),
  ]);
  const limpo = limparPernas(it);
  assert.equal(limpo.legs.length, 2);
  assert.equal(limpo.legs[0].from.name, 'Casa');
  assert.equal(limpo.legs[0].to.name, 'Vila Alta (Estação)');
  assert.equal(limpo.legs[0].duration, 7 * 60);
  assert.equal(limpo.legs[0].distance, 500);
  assert.equal(limpo.walkDistance, 500);
});

test('o passo de zero minutos da paragem para ela própria não se mostra', () => {
  const it = viagem([
    perna('BUS', 'Vila Alta (Terminal)', 'Ribeira (Centro)', 0, 30, 20000),
    perna('WALK', 'Ribeira (Centro)', 'Ribeira (Centro)', 30, 0.5, 19),
    perna('BUS', 'Ribeira (Centro)', 'Serra', 40, 20, 12000),
  ]);
  const limpo = limparPernas(it);
  assert.deepEqual(
    limpo.legs.map((l) => l.mode),
    ['BUS', 'BUS'],
  );
  assert.equal(limpo.walkDistance, 0);
});

test('um passo a sério fica, mesmo curto', () => {
  // Dois minutos entre paragens com nomes diferentes: é um caminho que se faz.
  const it = viagem([
    perna('BUS', 'A', 'Ribeira (Centro)', 0, 30, 20000),
    perna('WALK', 'Ribeira (Centro)', 'Ribeira (Mercado)', 30, 2, 150),
    perna('BUS', 'Ribeira (Mercado)', 'Serra', 40, 20, 12000),
  ]);
  assert.equal(limparPernas(it).legs.length, 3);
});

test('uma viagem só a pé não fica sem pernas', () => {
  const it = viagem([perna('WALK', 'Aqui', 'Aqui', 0, 0.2, 5)]);
  assert.equal(limparPernas(it).legs.length, 1);
});

test('os transbordos contam veículos, não passos a pé', () => {
  assert.equal(
    contarTransbordos(
      viagem([
        perna('WALK', 'a', 'b', 0, 3, 200),
        perna('BUS', 'b', 'c', 3, 10, 5000),
        perna('WALK', 'c', 'd', 13, 3, 200),
        perna('RAIL', 'd', 'e', 20, 10, 9000),
      ]),
    ),
    1,
  );
  assert.equal(contarTransbordos(viagem([perna('WALK', 'a', 'b', 0, 30, 2000)])), 0);
});

test('a volta pela capital vai para «mais opções», e não se abre sozinha', () => {
  // A direta: parte às 06:00, 50 min, 35 km.
  const direta = viagem([perna('BUS', 'Vila Alta', 'Ribeira', 6 * 60 - 8 * 60, 50, 35000)]);
  // A volta: parte às 02:00 e chega às 06:35 — ANTES da direta —, com 260 km.
  // É por chegar antes que a duração sozinha não a apanha.
  const volta = viagem([
    perna('RAIL', 'Vila Alta', 'Capital', 2 * 60 - 8 * 60, 120, 130000),
    perna('WALK', 'Capital', 'Capital (Terminal)', 4 * 60 - 8 * 60, 2, 100),
    perna('RAIL', 'Capital (Terminal)', 'Ribeira', 4 * 60 + 5 - 8 * 60, 150, 130000),
  ]);
  const r = arrumarParaMostrar([volta, direta]);
  assert.deepEqual(r.opcoes, [direta]);
  assert.deepEqual(r.desvios, [volta]);
  assert.equal(r.recomendada, 0);
});

test('um expresso que anda mais e chega antes não é desvio: é mais rápido', () => {
  const regional = viagem([perna('BUS', 'A', 'B', 0, 90, 40000)]);
  const expresso = viagem([perna('BUS', 'A', 'B', 10, 45, 70000)]);
  const r = arrumarParaMostrar([regional, expresso]);
  assert.equal(r.desvios.length, 0);
  assert.equal(r.opcoes.length, 2);
  assert.equal(r.opcoes[r.recomendada], expresso, 'chega primeiro e sem transbordos');
});

test('abre-se a que chega primeiro, contando cada transbordo como dez minutos', () => {
  // A: parte às 8:00, chega às 9:00, direta.
  const direta = viagem([perna('BUS', 'A', 'B', 0, 60, 30000)]);
  // B: parte às 8:10, chega às 8:55 — cinco minutos antes —, com dois transbordos.
  const aos_saltos = viagem([
    perna('BUS', 'A', 'C', 10, 15, 10000),
    perna('BUS', 'C', 'D', 25, 15, 10000),
    perna('BUS', 'D', 'B', 40, 15, 10000),
  ]);
  const r = arrumarParaMostrar([aos_saltos, direta]);
  assert.deepEqual(r.opcoes, [direta, aos_saltos], 'a lista continua por ordem de partida');
  assert.equal(r.opcoes[r.recomendada], direta);
});

test('uma opção só é a recomendada, e nada vai para os desvios', () => {
  const so = viagem([perna('BUS', 'A', 'B', 0, 300, 400000)]);
  assert.deepEqual(arrumarParaMostrar([so]), { opcoes: [so], desvios: [], recomendada: 0 });
  assert.deepEqual(arrumarParaMostrar([]), { opcoes: [], desvios: [], recomendada: 0 });
});

test('a próxima ligação é a do primeiro dia que a tiver, até uma semana', async () => {
  const pedidos: string[] = [];
  const umaOpcao = viagem([perna('BUS', 'A', 'B', 0, 30, 10000)]);
  // Só há ligação ao terceiro dia.
  const r = await procurarNosDias(async (dia) => {
    pedidos.push(dia);
    return dia === '2026-10-05' ? [umaOpcao] : [];
  }, '2026-10-02');
  assert.deepEqual(r, { its: [umaOpcao], dia: '2026-10-05' });
  assert.deepEqual(pedidos, ['2026-10-03', '2026-10-04', '2026-10-05']);
});

test('a próxima ligação não se procura para lá dos horários carregados', async () => {
  const pedidos: string[] = [];
  const r = await procurarNosDias(
    async (dia) => {
      pedidos.push(dia);
      return [];
    },
    '2026-12-30',
    '20270101',
  );
  assert.equal(r, null);
  // Para lá do fim dos horários, «não há» passava a querer dizer «não sabemos».
  assert.deepEqual(pedidos, ['2026-12-31', '2027-01-01']);
});

test('o dia seguinte atravessa a mudança da hora sem perder um dia', () => {
  assert.equal(diaMais('2026-10-24', 1), '2026-10-25');
  assert.equal(diaMais('2026-10-25', 1), '2026-10-26');
  assert.equal(diaMais('2026-12-31', 1), '2027-01-01');
});

test('a volta numa circular que regressa ao terminal sai, e parte-se mais tarde', () => {
  // Embarcar no terminal, dar a volta à vila, voltar ao MESMO terminal e
  // esperar lá uma hora: era o que se propunha numa linha circular.
  const it = viagem([
    perna('WALK', 'Casa', 'Terminal', 0, 5, 300),
    perna('BUS', 'Terminal', 'Terminal', 7, 8, 4000),
    perna('BUS', 'Terminal', 'Vila do Vale', 68, 60, 30000),
  ]);
  const limpo = limparPernas(it);
  assert.deepEqual(
    limpo.legs.map((l) => `${l.mode} ${l.from.name}→${l.to.name}`),
    ['WALK Casa→Terminal', 'BUS Terminal→Vila do Vale'],
  );
  // O caminho a pé faz-se mais tarde — chega-se à mesma folga antes da carreira.
  assert.equal(limpo.legs[0].startTime, T0 + 61 * MIN);
  assert.equal(limpo.startTime, T0 + 61 * MIN);
  assert.equal(limpo.endTime, T0 + 128 * MIN);
  assert.equal(limpo.duration, 67 * 60);
});

test('a volta a meio, e a do fim, também saem', () => {
  const meio = semVoltas([
    perna('BUS', 'A', 'B', 0, 10, 5000),
    perna('BUS', 'B', 'C', 12, 5, 2000),
    perna('BUS', 'C', 'B', 18, 5, 2000),
    perna('BUS', 'B', 'D', 40, 10, 5000),
  ]);
  assert.deepEqual(
    meio.map((l) => `${l.from.name}→${l.to.name}`),
    ['A→B', 'B→D'],
  );
  const fim = semVoltas([
    perna('BUS', 'A', 'D', 0, 10, 5000),
    perna('BUS', 'D', 'E', 12, 5, 2000),
    perna('BUS', 'E', 'D', 18, 5, 2000),
    perna('WALK', 'D', 'Casa', 23, 4, 300),
  ]);
  assert.deepEqual(
    fim.map((l) => `${l.from.name}→${l.to.name}`),
    ['A→D', 'D→Casa'],
  );
  // E o caminho a pé do fim faz-se logo à chegada.
  assert.equal(fim[1].startTime, T0 + 10 * MIN);
});

test('uma viagem sem voltas fica como estava', () => {
  const legs = [
    perna('WALK', 'Casa', 'A', 0, 3, 200),
    perna('BUS', 'A', 'B', 5, 10, 5000),
    perna('RAIL', 'B', 'C', 20, 30, 30000),
  ];
  assert.deepEqual(semVoltas(legs), legs);
});

test('cortadas as voltas, a mesma viagem não aparece duas vezes', () => {
  const direta = viagem([perna('BUS', 'Terminal', 'Vila do Vale', 68, 60, 30000)]);
  const comVolta = limparPernas(
    viagem([
      perna('BUS', 'Terminal', 'Terminal', 7, 8, 4000),
      perna('BUS', 'Terminal', 'Vila do Vale', 68, 60, 30000),
    ]),
  );
  assert.equal(semRepetidas([comVolta, direta]).length, 1);
  const outra = viagem([perna('BUS', 'Terminal', 'Vila do Vale', 128, 60, 30000)]);
  assert.equal(semRepetidas([direta, outra]).length, 2);
});

test('uma volta à capital é desvio sozinha, sem precisar de outra opção ao lado', () => {
  // Duas cidades a 28 km. Num sábado à noite as opções que havia iam todas à
  // capital, e comparadas umas com as outras nenhuma era desvio.
  const pontas = {
    de: { nome: 'Vila Alta', lat: 40.0, lon: -9.0 },
    para: { nome: 'Ribeira', lat: 40.25, lon: -9.0 },
  };
  const pelaCapital = viagem([
    perna('BUS', 'Vila Alta', 'Capital', 0, 110, 120_000),
    perna('RAIL', 'Capital', 'Ribeira', 140, 90, 140_000),
  ]);
  const outraVolta = viagem([perna('BUS', 'Vila Alta', 'Ribeira', 30, 240, 200_000)]);
  const r = arrumarParaMostrar([pelaCapital, outraVolta], pontas);
  assert.deepEqual(r.opcoes, [], 'nenhuma se abre sozinha');
  assert.equal(r.desvios.length, 2);

  // Sem as pontas, a regra é só a relativa: era o que se fazia.
  assert.equal(arrumarParaMostrar([pelaCapital, outraVolta]).opcoes.length, 2);

  // Uma ligação a sério ao lado fica, e é a que se abre.
  const direta = viagem([perna('BUS', 'Vila Alta', 'Ribeira', 600, 50, 32_000)]);
  const comDireta = arrumarParaMostrar([pelaCapital, direta], pontas);
  assert.deepEqual(comDireta.opcoes, [direta]);
  assert.deepEqual(comDireta.desvios, [pelaCapital]);
  // E uma só, se for volta, também não se abre.
  assert.deepEqual(arrumarParaMostrar([pelaCapital], pontas).opcoes, []);
});

test('a próxima ligação salta os dias que só têm voltas', async () => {
  const volta = viagem([perna('BUS', 'A', 'B', 0, 300, 250_000)]);
  const direta = viagem([perna('BUS', 'A', 'B', 0, 40, 30_000)]);
  const pedidos: string[] = [];
  const r = await procurarNosDias(
    async (dia) => {
      pedidos.push(dia);
      return dia === '2026-10-05' ? [direta] : [volta];
    },
    '2026-10-03',
    null,
    7,
    (its) => its.some((it) => it.legs.every((l) => l.distance < 100_000)),
  );
  assert.equal(r?.dia, '2026-10-05');
  assert.deepEqual(pedidos, ['2026-10-04', '2026-10-05']);
});
