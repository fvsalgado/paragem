/**
 * «Reservar online» só onde a reserva online serve (`lib/a-pedido.ts`).
 *
 * A página de cada grupo de circuitos mostrava a ligação sempre que a região
 * tinha reserva online — e a página geral, na mesma região, dizia que ela só
 * servia alguns serviços. Quem a seguisse a partir de um circuito que ela não
 * serve não conseguia reservar.
 *
 * A região é inventada, com a forma do `a-pedido.json` que a construção
 * escreve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aPedidoNasPontas,
  reservaOnlineDaZona,
  reservaOnlineDoHorario,
} from '../src/lib/a-pedido.ts';
import type { APedido, HorarioAPedido, ZonaAPedido } from '../src/lib/formato.ts';

const zona = (id: string, concelho: string | null, extra: Partial<ZonaAPedido> = {}) =>
  ({
    id,
    nome: `Zona ${id}`,
    concelho,
    concelho_nome: concelho ?? '',
    circuitos: [],
    ...extra,
  }) satisfies ZonaAPedido;

const horario = (id: string, concelho: string, extra: Partial<HorarioAPedido> = {}) =>
  ({
    id,
    nome: `Circuitos ${id}`,
    concelho,
    concelho_nome: concelho,
    circuito_de: '',
    regras: [],
    paragens: ['Largo'],
    viagens: 2,
    quadros: [{ nome: `Circuito ${id}`, paragens: ['Largo'], rotulos: [], viagens: [] }],
    ...extra,
  }) satisfies HorarioAPedido;

function dados(com_reserva_online?: string[]): APedido {
  return {
    zonas: [
      zona('serra', 'serra', { reserva_online: true }),
      zona('vale', 'vale'),
      zona('rio-norte', 'rio', { reserva_online: true }),
      zona('rio-sul', 'rio'),
      zona('ligacao', null, { reserva_online: true, entre: ['serra', 'vale'] }),
      // Uma zona sem concelho cujos circuitos têm o horário noutro grupo.
      zona('avulsa', null, {
        circuitos: [{ nome: 'Circuito avulso', horario: { grupo: 'avulsos', quadro: 'X' } }],
      }),
    ],
    reservas: {
      prazo: 'Até às 15h do dia útil anterior',
      online: 'https://reservas.example.org',
      telefone: '800000000',
      ...(com_reserva_online ? { com_reserva_online } : {}),
    },
    sem_zona: [],
    contagens_por_conciliar: {},
    fonte: 'inventada',
    zonas_sem_circuitos: 0,
    horarios: [],
    circuitos: [],
  };
}

const RESTRITA = dados(['Serra', 'Ligação', 'Rio Norte']);
const GERAL = dados();

test('onde a região diz o que a reserva online serve, o que não está na lista é por telefone', () => {
  assert.equal(reservaOnlineDaZona(RESTRITA, RESTRITA.zonas[0]), true);
  assert.equal(reservaOnlineDaZona(RESTRITA, RESTRITA.zonas[1]), false);
  // Sem a lista, a fonte não diz, e não se adivinha.
  assert.equal(reservaOnlineDaZona(GERAL, GERAL.zonas[1]), null);
});

test('o grupo de um concelho que a reserva online não serve não oferece reservar online', () => {
  assert.deepEqual(reservaOnlineDoHorario(RESTRITA, horario('vale', 'vale')), {
    serve: false,
    so: [],
  });
  assert.deepEqual(reservaOnlineDoHorario(RESTRITA, horario('serra', 'serra')), {
    serve: true,
    so: [],
  });
  // Sem a lista, continua a oferecer — como a página geral.
  assert.equal(reservaOnlineDoHorario(GERAL, horario('vale', 'vale')).serve, null);
});

test('num concelho com zonas servidas e outras não, diz quais', () => {
  assert.deepEqual(reservaOnlineDoHorario(RESTRITA, horario('rio', 'rio')), {
    serve: true,
    so: ['Zona rio-norte'],
  });
});

test('as zonas que a receita declara ganham às do concelho', () => {
  // Um folheto de ligações não é de concelho nenhum: sem a declaração não
  // havia zona nenhuma, e ficava sem a ligação para reservar.
  const ligacoes = horario('ligacoes', '', { zonas: ['ligacao'] });
  assert.deepEqual(reservaOnlineDoHorario(RESTRITA, ligacoes), { serve: true, so: [] });
  assert.equal(reservaOnlineDoHorario(RESTRITA, horario('ligacoes', '')).serve, false);
  // E a brochura de um serviço não é de todas as zonas do concelho.
  const so = horario('rio', 'rio', { zonas: ['rio-norte'] });
  assert.deepEqual(reservaOnlineDoHorario(RESTRITA, so), { serve: true, so: [] });
});

test('as zonas com circuitos ligados a um grupo são dele, mesmo sem concelho', () => {
  assert.equal(reservaOnlineDoHorario(RESTRITA, horario('avulsos', '')).serve, false);
});

test('no planeador, um circuito que a reserva online não serve não a promete', () => {
  const d: APedido = {
    ...RESTRITA,
    horarios: [
      horario('vale', 'vale', {
        quadros: [
          { nome: 'Circuito do Vale', paragens: ['Fonte Fria', 'Vale'], rotulos: [], viagens: [] },
        ],
      }),
    ],
  };
  const url = (c: string) => `/${c}`;
  const r = aPedidoNasPontas(
    d,
    { nome: 'Fonte Fria', concelho: 'vale' },
    { nome: 'Vale', concelho: 'vale' },
    url,
  );
  assert.equal(r[0].nome, 'Circuito do Vale');
  assert.equal(r[0].reservaOnline, false);
  // E as zonas do concelho, quando nada mais bate, também não.
  const z = aPedidoNasPontas(
    d,
    { nome: 'Outra Terra', concelho: 'vale' },
    { nome: 'Mais Outra', concelho: 'vale' },
    url,
  );
  assert.equal(z[0].oQue, 'zona');
  assert.equal(z[0].reservaOnline, false);
});
