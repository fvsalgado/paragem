/**
 * O núcleo partilhado pelos dois invólucros — a função e o contentor.
 *
 * Se estes testes passam, os dois alojamentos dão a mesma resposta: é para
 * isso que o núcleo existe. Não vai à rede — o `fetch` entra por parâmetro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configuracao, criarCache, faltaNaConfiguracao, lerPainel, stationStatus } from './nucleo.mjs';

const html = readFileSync(
  fileURLToPath(new URL('./fixtures/painel.html', import.meta.url)),
  'utf-8',
);

/** Um `fetch` de mentira que devolve a fixture e conta as vezes que foi usado. */
function fonteFalsa(corpo = html, ok = true) {
  const estado = { vezes: 0 };
  const buscar = async () => {
    estado.vezes += 1;
    return { ok, status: ok ? 200 : 502, text: async () => corpo };
  };
  return { buscar, estado };
}

const CFG = configuracao({
  PARAGEM_PAINEL_URL: 'http://exemplo/painel',
  PARAGEM_ORIGEM: 'https://sitio.pt',
});

test('só o endereço da página é obrigatório', () => {
  assert.deepEqual(faltaNaConfiguracao(CFG), []);
  const vazia = configuracao({});
  assert.deepEqual(
    faltaNaConfiguracao(vazia).length,
    1,
    'sem endereço não há nada para ler; a origem é outra conversa',
  );
  // A ORIGEM NUNCA TEM OMISSÃO, e muito menos `*`. Sem ela não se manda
  // cabeçalho de CORS nenhum — só a mesma origem lê, que é o mais fechado.
  assert.equal(vazia.origem, '');
  assert.equal(faltaNaConfiguracao(configuracao({ PARAGEM_PAINEL_URL: 'x' })).length, 0);
});

test('uma leitura traz as estações e a hora', async () => {
  const { buscar } = fonteFalsa();
  const antes = Date.now();
  const d = await lerPainel(CFG, buscar);
  assert.equal(d.estacoes.length, 3);
  assert.ok(d.gerado >= antes);
});

test('o filtro deixa de fora o sistema que não se quer', async () => {
  const { buscar } = fonteFalsa();
  const cfg = configuracao({ ...CFG, PARAGEM_PAINEL_URL: 'x', PARAGEM_ORIGEM: 'y', PARAGEM_EXCLUIR: 'BUTe' });
  const d = await lerPainel(cfg, buscar);
  assert.equal(d.estacoes.length, 2);
  assert.ok(!d.estacoes.some((e) => e.nome.startsWith('BUTe')));
});

test('uma página que não traz estações é uma leitura falhada', async () => {
  const { buscar } = fonteFalsa('<html>outra coisa</html>');
  await assert.rejects(() => lerPainel(CFG, buscar), /estação nenhuma/);
});

test('o GBFS sai com as contagens, e o zero é um zero', async () => {
  const { buscar } = fonteFalsa();
  const s = stationStatus(await lerPainel(CFG, buscar), 60);
  assert.equal(s.version, '2.3');
  assert.equal(s.ttl, 60);
  const terminal = s.data.stations.find((e) => e.station_id === 'pedra-alta-terminal');
  assert.equal(terminal.num_bikes_available, 2);
  assert.equal(terminal.num_docks_available, 8);
  const sub = s.data.stations.find((e) => e.station_id.startsWith('bute-'));
  assert.equal(sub.num_bikes_available, 0);
  // Cada estação leva a hora da leitura.
  assert.equal(terminal.last_reported, s.last_updated);
});

test('a cache poupa a fonte: muitos pedidos, uma leitura', async () => {
  const { buscar, estado } = fonteFalsa();
  const cache = criarCache(CFG, buscar);
  await Promise.all(Array.from({ length: 20 }, () => cache.obter()));
  await cache.obter();
  assert.equal(estado.vezes, 1, 'vinte e um pedidos deviam dar UMA leitura');
});

test('a fonte em baixo não derruba o serviço: serve-se a última leitura boa', async () => {
  const boa = fonteFalsa();
  const cache = criarCache(configuracao({ ...CFG, PARAGEM_CACHE_S: '0' }), async (...a) => {
    if (boa.estado.vezes === 0) return boa.buscar(...a);
    throw new Error('a fonte caiu');
  });
  const primeira = await cache.obter();
  assert.equal(primeira.estacoes.length, 3);
  // A fonte caiu, mas continua a haver resposta — com a hora da leitura velha,
  // que é o navegador que julga pelo prazo de validade.
  const segunda = await cache.obter();
  assert.equal(segunda.gerado, primeira.gerado);
});

test('sem leitura nenhuma, rebenta em vez de publicar vazio', async () => {
  const cache = criarCache(CFG, async () => {
    throw new Error('a fonte caiu');
  });
  await assert.rejects(() => cache.obter(), /caiu/);
});
