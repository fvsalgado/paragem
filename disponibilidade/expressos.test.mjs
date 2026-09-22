/**
 * Os expressos ao vivo. Não vai à rede — o `fetch` entra por parâmetro.
 *
 * A fixture é INVENTADA (Serra da Pedra Alta) e não uma resposta guardada de
 * um operador: um teste preso a preços a sério parte no dia em que a tabela
 * muda, e guardar preços de terceiros é o que o módulo diz que não se faz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  configuracao,
  consultar,
  criarCache,
  dataDaFonte,
  endereco,
  faltaNaConfiguracao,
  hoje,
  normalizar,
  pedidoInvalido,
} from './expressos.mjs';

const RESPOSTA = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/expressos.json', import.meta.url)), 'utf-8'),
);
const CFG = configuracao({ PARAGEM_EXPRESSOS_URL: 'https://exemplo.invalido/pesquisa' });
const A = '11111111-2222-3333-4444-555555555555';
const B = '66666666-7777-8888-9999-aaaaaaaaaaaa';
const PEDIDO = { de: A, para: B, data: '2099-07-02' };

/** Um `fetch` de mentira: devolve a fixture e conta as vezes que foi usado. */
function fonteFalsa(corpo = RESPOSTA, ok = true) {
  const estado = { vezes: 0, ultimoUrl: '' };
  const buscar = async (url) => {
    estado.vezes += 1;
    estado.ultimoUrl = String(url);
    return { ok, json: async () => corpo };
  };
  return { buscar, estado };
}

test('sem endereço configurado, diz o que falta em vez de fingir', () => {
  assert.deepEqual(faltaNaConfiguracao(configuracao({})).length, 1);
  assert.deepEqual(faltaNaConfiguracao(CFG), []);
});

test('só passam dois identificadores e uma data', () => {
  assert.equal(pedidoInvalido(PEDIDO), null);
  assert.match(pedidoInvalido({ ...PEDIDO, de: '../../etc' }), /partida/);
  assert.match(pedidoInvalido({ ...PEDIDO, para: 'lisboa' }), /chegada/);
  assert.match(pedidoInvalido({ de: A, para: A }), /mesma paragem/);
  assert.match(pedidoInvalido({ ...PEDIDO, data: '2/7/2099' }), /AAAA-MM-DD/);
});

test('a data vai para a fonte na forma que ela quer', () => {
  assert.equal(dataDaFonte('2099-07-02'), '02.07.2099');
  assert.match(hoje('Europe/Lisbon'), /^\d{4}-\d{2}-\d{2}$/);
});

test('o endereço leva os identificadores como estão no GTFS', () => {
  const u = new URL(endereco(CFG, PEDIDO));
  assert.equal(u.searchParams.get('from_station_id'), A);
  assert.equal(u.searchParams.get('to_station_id'), B);
  assert.equal(u.searchParams.get('departure_date'), '02.07.2099');
  assert.equal(u.searchParams.get('search_by'), 'stations');
});

test('as viagens saem por ordem de partida, e a sem partida não sai', () => {
  const v = normalizar(RESPOSTA);
  // A fixture traz r2, r1, r3 por essa ordem, e uma quarta sem hora de partida.
  assert.deepEqual(
    v.map((x) => x.partida.slice(11, 16)),
    ['07:15', '18:20', '21:40'],
  );
});

test('o preço é o que se paga, com a taxa da plataforma', () => {
  const [primeira] = normalizar(RESPOSTA);
  assert.equal(primeira.preco, 7.25, 'e não os 6,00 do valor sem taxa');
});

test('uma viagem esgotada fica sem preço, e não com zero', () => {
  const esgotada = normalizar(RESPOSTA).find((v) => v.estado === 'sold_out');
  assert.equal(esgotada.preco, null, 'null diz «não se sabe»; zero dizia «é grátis»');
  assert.equal(esgotada.lugares, 0);
  assert.equal(esgotada.direto, false, 'o uid não começa por direct:');
});

test('o nome da paragem de cada ponta vem do dicionário da resposta', () => {
  const [primeira] = normalizar(RESPOSTA);
  // «Vale Escuro (Norte)» e «(Sul)» não são o mesmo sítio para quem lá vai.
  assert.equal(primeira.paragemPartida, 'Pedra Alta (Terminal)');
  assert.equal(primeira.paragemChegada, 'Vale Escuro (Norte)');
});

test('uma resposta que não se reconhece dá zero viagens, não rebenta', () => {
  assert.deepEqual(normalizar({}), []);
  assert.deepEqual(normalizar(null), []);
  assert.deepEqual(normalizar({ trips: [] }), []);
});

test('a fonte em baixo degrada em silêncio', async () => {
  const { buscar } = fonteFalsa(RESPOSTA, false); // resposta não-ok
  const r = await consultar(CFG, PEDIDO, buscar);
  assert.equal(r.falhou, true);
  assert.deepEqual(r.viagens, [], 'e o sítio fica com o horário planeado');

  const rebenta = async () => {
    throw new Error('rede em baixo');
  };
  const r2 = await consultar(CFG, PEDIDO, rebenta);
  assert.equal(r2.falhou, true);
  assert.deepEqual(r2.viagens, []);
});

test('a cache poupa a fonte, e não guarda o que falhou', async () => {
  const { buscar, estado } = fonteFalsa();
  const cache = criarCache(CFG, buscar);
  await cache.obter(PEDIDO);
  await cache.obter(PEDIDO);
  assert.equal(estado.vezes, 1, 'a segunda pergunta não toca na fonte');

  await cache.obter({ ...PEDIDO, data: '2099-07-03' });
  assert.equal(estado.vezes, 2, 'outro dia é outra pergunta');

  const mau = fonteFalsa(RESPOSTA, false);
  const cache2 = criarCache(CFG, mau.buscar);
  await cache2.obter(PEDIDO);
  await cache2.obter(PEDIDO);
  assert.equal(mau.estado.vezes, 2, 'uma falha não se guarda: tenta outra vez');
  assert.equal(cache2.tamanho, 0);
});

test('a cache não cresce sem limite', async () => {
  const { buscar } = fonteFalsa();
  const cache = criarCache(CFG, buscar, 3);
  for (const d of ['2099-07-02', '2099-07-03', '2099-07-04', '2099-07-05']) {
    await cache.obter({ ...PEDIDO, data: d });
  }
  assert.equal(cache.tamanho, 3, 'a mais antiga sai');
});

test('identifica-se à fonte em vez de se disfarçar', async () => {
  let cabecalhos = null;
  await consultar(CFG, PEDIDO, async (_u, o) => {
    cabecalhos = o.headers;
    return { ok: true, json: async () => RESPOSTA };
  });
  assert.match(cabecalhos['user-agent'], /Paragem\.pt/);
});
