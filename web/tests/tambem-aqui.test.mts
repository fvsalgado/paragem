/**
 * O que mais há à porta de uma estação (auditoria de 1/11/2026, #82).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tambemAqui } from '../src/lib/tambem-aqui.ts';
import type { ModoDetalhe, Modos } from '../src/lib/formato.ts';

const ESTACAO = { lat: 40.1, lon: -7.6 };
// 0,001° de latitude são uns 111 m.
const modo = (m: Partial<ModoDetalhe> & { modo: string }): ModoDetalhe => ({
  gerido_por: [],
  sistemas: [],
  pontos: [],
  percursos: [],
  paragens: [],
  incompleto: false,
  notas: [],
  fontes: [],
  quantos: 0,
  ...m,
});
const ponto = (lat: number, nome: string | null = null, id: string | null = null) => ({
  id,
  nome,
  lat,
  lon: -7.6,
  concelho: 'pedra-alta',
});

const MODOS: Modos = {
  bicicleta: modo({
    modo: 'bicicleta',
    sistemas: [
      {
        id: 'bp',
        nome: 'Bicla',
        operador: null,
        estado: null,
        disponibilidade_publica: false,
        estacoes: [ponto(40.1012, 'Bicla - Largo da Estação', 'b1'), ponto(40.2, 'Longe', 'b2')],
      },
      {
        id: 'outra',
        nome: 'Por confirmar',
        operador: null,
        estado: 'por-confirmar',
        disponibilidade_publica: false,
        estacoes: [ponto(40.1001, 'Ao lado', 'b3')],
      },
    ],
  }),
  taxi: modo({ modo: 'taxi', pontos: [ponto(40.1009)] }),
  'urbano-municipal': modo({
    modo: 'urbano-municipal',
    horarios: [
      {
        id: 'u1',
        nome: 'Urbano — Linha Azul',
        operador: null,
        rede: null,
        cor: null,
        regras: [],
        paragens: [],
        viagens: 1,
        quadros: [],
        coordenadas: {
          'Estação (cais)': { lat: 40.1003, lon: -7.6, fonte: 'osm' },
          Mercado: { lat: 40.1025, lon: -7.6, fonte: 'osm' },
          'Sem sítio perto': { lat: 41, lon: -7.6, fonte: 'osm' },
        },
      },
    ],
  }),
};

test('junta o que fica perto, pela distância, e deixa o que fica longe', () => {
  const aqui = tambemAqui(ESTACAO, MODOS);
  assert.deepEqual(
    aqui.map((x) => [x.modo, x.nome, x.metros]),
    [
      ['urbano-municipal', 'Estação (cais)', 30],
      ['taxi', 'Praça de táxis', 100],
      ['bicicleta', 'Bicla - Largo da Estação', 130],
    ],
  );
});

test('de cada linha de urbano, só a paragem mais perto', () => {
  const urbanos = tambemAqui(ESTACAO, MODOS).filter((x) => x.modo === 'urbano-municipal');
  assert.equal(urbanos.length, 1);
  assert.equal(urbanos[0].de, 'Urbano — Linha Azul');
});

test('um sistema por confirmar não se oferece à porta', () => {
  assert.equal(
    tambemAqui(ESTACAO, MODOS).some((x) => x.id === 'b3'),
    false,
  );
});
