/**
 * A rota que o sítio serve — `web/src/app/api/station_status/route.js`.
 *
 * Vivia na raiz, em `api/`, enquanto o sítio era exportação estática e não
 * podia ter rotas dentro. Entrou para dentro do Next (CLAUDE.md §11.7), mas é
 * irmã do contentor e do mesmo núcleo, por isso continua a ser testada aqui:
 * um só `node --test` cobre os dois invólucros.
 *
 * O que isto guarda é o que produção corre. Sem ele, a rota só tinha sido
 * vista a funcionar uma vez, à mão.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(
  fileURLToPath(new URL("./fixtures/painel.html", import.meta.url)),
  "utf-8",
);

const ROTA = "../web/src/app/api/station_status/route.js";
const ORIGEM = "https://sitio-de-teste.pt";
let fonte;
let rota;

before(async () => {
  fonte = createServer((_pedido, resposta) => {
    resposta.writeHead(200, { "content-type": "text/html" });
    resposta.end(html);
  });
  await new Promise((pronto) => fonte.listen(0, pronto));

  // O invólucro lê o ambiente quando é carregado, por isso a configuração tem
  // de estar posta ANTES do import.
  process.env.PARAGEM_PAINEL_URL = `http://127.0.0.1:${fonte.address().port}/`;
  process.env.PARAGEM_ORIGEM = ORIGEM;
  process.env.PARAGEM_CACHE_S = "60";
  rota = await import(ROTA);
});

after(() => fonte?.close());

test("um GET devolve o GBFS com as contagens", async () => {
  const r = await rota.GET();
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.version, "2.3");
  const terminal = corpo.data.stations.find(
    (e) => e.station_id === "pedra-alta-terminal",
  );
  assert.equal(terminal.num_bikes_available, 2);
  assert.equal(terminal.num_docks_available, 8);
  // O zero do outro sistema continua a ser um zero, e não «sem dados».
  const sub = corpo.data.stations.find((e) => e.station_id.startsWith("bute-"));
  assert.equal(sub.num_bikes_available, 0);
});

test("o CORS fica preso à origem declarada, e nunca é `*`", async () => {
  const r = await rota.GET();
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGEM);
  assert.notEqual(r.headers.get("access-control-allow-origin"), "*");
});

test("sem origem declarada não vai cabeçalho nenhum — só a mesma origem lê", async () => {
  // É o caso normal: a rota é servida ao lado do sítio, na mesma origem, e o
  // navegador nem chega a perguntar. Não mandar cabeçalho é mais fechado do
  // que mandar um — e muito mais do que mandar `*`.
  const guardada = process.env.PARAGEM_ORIGEM;
  try {
    delete process.env.PARAGEM_ORIGEM;
    // A configuração é lida no carregamento, por isso carrega-se outra vez —
    // a consulta no endereço é o que faz o Node tratar isto como módulo novo.
    const semOrigem = await import(`${ROTA}?recarga=${Date.now()}`);
    const r = await semOrigem.GET();
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    assert.equal(
      r.status,
      200,
      "continua a responder — só não deixa ler de fora",
    );
  } finally {
    process.env.PARAGEM_ORIGEM = guardada;
  }
});

test("a resposta manda a rede guardá-la, para poupar a fonte", async () => {
  // É isto que faz de cem visitantes no mesmo minuto UMA leitura da página do
  // operador. Numa função não há processo a viver entre pedidos: sem este
  // cabeçalho, a cache em memória não chegava.
  const r = await rota.GET();
  const cache = r.headers.get("cache-control");
  assert.match(cache, /s-maxage=\d+/);
  assert.match(cache, /stale-while-revalidate=\d+/);
});

test("o pré-voo do navegador responde sem corpo", async () => {
  const r = await rota.OPTIONS();
  assert.equal(r.status, 204);
  assert.match(r.headers.get("access-control-allow-methods"), /GET/);
});

test("só GET e OPTIONS existem — o Next responde 405 ao resto sozinho", () => {
  assert.equal(typeof rota.GET, "function");
  assert.equal(typeof rota.OPTIONS, "function");
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"])
    assert.equal(rota[metodo], undefined);
});
