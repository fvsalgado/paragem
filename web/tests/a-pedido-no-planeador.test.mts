/**
 * O transporte a pedido nas pontas de uma viagem (P2-036).
 *
 * O planeador respondia «não há» a quem pedia uma viagem de uma aldeia só
 * servida a pedido — e há. O que se propõe não é um itinerário, e o teste
 * segura isso também: nenhuma hora inventada, só o que os dados dizem.
 *
 * A região é inventada, com a forma do `a-pedido.json` que a construção
 * escreve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aPedidoNasPontas } from '../src/lib/a-pedido.ts';
import type { APedido } from '../src/lib/formato.ts';

const url = (c: string) => `/${c}`;

const DADOS: APedido = {
  zonas: [
    {
      id: 'z1',
      nome: 'Zona da Serra',
      concelho: 'serra',
      concelho_nome: 'Serra',
      reserva_online: true,
      circuitos: [],
    },
    {
      id: 'z2',
      nome: 'Zona do Vale',
      concelho: 'vale',
      concelho_nome: 'Vale',
      circuitos: [],
    },
    {
      id: 'l1',
      nome: 'Ligação Serra – Vale',
      concelho: null,
      concelho_nome: '',
      entre: ['serra', 'vale'],
      reserva_online: false,
      circuitos: [],
    },
  ],
  reservas: { prazo: 'Reserva até às 15h do dia útil anterior.' },
  sem_zona: [],
  contagens_por_conciliar: {},
  fonte: 'inventada',
  zonas_sem_circuitos: 0,
  horarios: [
    {
      id: 'serra',
      nome: 'Serra',
      concelho: 'serra',
      concelho_nome: 'Serra',
      circuito_de: '',
      regras: [],
      paragens: [],
      viagens: 2,
      quadros: [
        {
          nome: 'Circuito do Cerro',
          paragens: ['Cerro Alto', 'Casal do Meio', 'Vila da Serra (Centro)'],
          rotulos: [],
          viagens: [],
          regras: ['Às terças e quintas.', 'Reserva até às 15h do dia útil anterior.'],
        },
      ],
    },
  ],
  circuitos: [],
};

test('um circuito que passa nas duas pontas liga-as, e diz por onde', () => {
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Vila da Serra (Mercado)', concelho: 'serra' },
    url,
  );
  assert.equal(r[0].nome, 'Circuito do Cerro');
  assert.equal(r[0].liga, 'as-duas');
  assert.deepEqual(r[0].naPartida, ['Cerro Alto']);
  // Pela TERRA, sem o que vem entre parênteses: a brochura diz «(Centro)».
  assert.deepEqual(r[0].naChegada, ['Vila da Serra (Centro)']);
  assert.equal(r[0].horario, '/a-pedido/serra/#q-circuito-do-cerro');
  assert.equal(r[0].oQue, 'circuito');
});

test('a regra de reserva geral não se repete em cada circuito', () => {
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Casal do Meio', concelho: 'serra' },
    url,
  );
  assert.deepEqual(r[0].regras, ['Às terças e quintas.']);
});

test('a ligação entre os dois concelhos vem primeiro', () => {
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Fonte Fria', concelho: 'vale' },
    url,
  );
  assert.equal(r[0].nome, 'Ligação Serra – Vale');
  assert.equal(r[0].liga, 'as-duas');
  assert.equal(r[0].reservaOnline, false, 'a fonte diz que esta não se reserva online');
  // O circuito serve só a partida; fica, a seguir.
  assert.equal(r[1].nome, 'Circuito do Cerro');
  assert.equal(r[1].liga, 'de');
});

test('sem circuito na terra, ficam as zonas do concelho — uma vez', () => {
  // As duas pontas no mesmo concelho: eram as mesmas zonas duas vezes.
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Fonte Fria', concelho: 'vale' },
    { nome: 'Outra Terra', concelho: 'vale' },
    url,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, 'Zona do Vale');
  assert.equal(r[0].onde, 'em Vale');
  assert.equal(r[0].horario, '/a-pedido/#z-z2');
  assert.equal(r[0].oQue, 'zona');
  assert.equal(r[0].reservaOnline, null, 'a fonte não diz: não se adivinha');
});

test('com opções da rede à frente, só fica o que liga as duas pontas', () => {
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Outra Terra', concelho: 'serra' },
    url,
    { soAsDuas: true },
  );
  assert.deepEqual(r, []);
});

test('nada se propõe sem pontas, e nenhuma proposta traz horas', () => {
  assert.deepEqual(aPedidoNasPontas(DADOS, null, null, url), []);
  const r = aPedidoNasPontas(
    DADOS,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Fonte Fria', concelho: 'vale' },
    url,
  );
  for (const p of r) {
    assert.ok(
      !Object.values(p).some((v) => typeof v === 'string' && /\b\d{1,2}:\d{2}\b/.test(v)),
      `uma proposta trouxe uma hora: ${JSON.stringify(p)}`,
    );
  }
});

test('um quadro de partidas chama-se pela folha, e o concelho não se repete', () => {
  // «Partidas de cada cidade» é o nome da TABELA, não do serviço.
  const d: APedido = {
    ...DADOS,
    horarios: [
      {
        id: 'ligacoes',
        nome: 'Ligações da Serra',
        concelho: 'serra',
        concelho_nome: 'Serra',
        circuito_de: '',
        regras: [],
        paragens: [],
        viagens: 0,
        quadros: [
          {
            nome: 'Partidas de cada cidade',
            tipo: 'partidas',
            paragens: ['Cerro Alto', 'Vila do Vale'],
            rotulos: [],
            viagens: [],
            horas: [['08:00'], ['09:00']],
          },
        ],
      },
    ],
  };
  const r = aPedidoNasPontas(
    d,
    { nome: 'Cerro Alto', concelho: 'serra' },
    { nome: 'Vila do Vale (Centro)', concelho: 'vale' },
    url,
    { soAsDuas: true },
  );
  const p = r.find((x) => x.oQue === 'circuito');
  assert.equal(p?.nome, 'Ligações da Serra');
  assert.equal(p?.onde, '', 'o nome já diz de onde é');
  assert.equal(p?.liga, 'as-duas');
});
