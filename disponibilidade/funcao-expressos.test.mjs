/**
 * A rota dos expressos — `web/src/app/api/expressos/route.js`.
 *
 * Irmã da do `station_status`, e testada aqui pela mesma razão: vive dentro
 * do sítio, mas é do mesmo núcleo, e um só `node --test` cobre os dois
 * invólucros.
 *
 * A fonte aqui é um servidor local que devolve a fixture inventada — nada
 * nestes testes toca na rede a sério.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESPOSTA = readFileSync(
  fileURLToPath(new URL("./fixtures/expressos.json", import.meta.url)),
  "utf-8",
);

const ROTA = "../web/src/app/api/expressos/route.js";
const ORIGEM = "https://sitio-de-teste.pt";
const A = "11111111-2222-3333-4444-555555555555";
const B = "66666666-7777-8888-9999-aaaaaaaaaaaa";

let fonte;
let rota;
let pedidos = 0;
let devolver = 200;

before(async () => {
  fonte = createServer((_pedido, resposta) => {
    pedidos += 1;
    resposta.writeHead(devolver, { "content-type": "application/json" });
    resposta.end(RESPOSTA);
  });
  await new Promise((pronto) => fonte.listen(0, pronto));

  // O invólucro lê o ambiente ao ser carregado: a configuração vem ANTES.
  process.env.PARAGEM_EXPRESSOS_URL = `http://127.0.0.1:${fonte.address().port}/`;
  process.env.PARAGEM_ORIGEM = ORIGEM;
  process.env.PARAGEM_EXPRESSOS_CACHE_S = "300";
  rota = await import(ROTA);
});

after(() => fonte?.close());

/** Um pedido como o navegador o faz: os parâmetros vão na consulta do endereço. */
const pedir = async (consulta) => {
  const q = new URLSearchParams(consulta).toString();
  const r = await rota.GET(
    new Request(`https://sitio-de-teste.pt/api/expressos/?${q}`),
  );
  return { codigo: r.status, cabecalhos: r.headers, corpo: await r.json() };
};

test("um GET com um par válido devolve as viagens", async () => {
  const { codigo, corpo } = await pedir({ de: A, para: B, data: "2099-07-02" });
  assert.equal(codigo, 200);
  assert.equal(corpo.falhou, false);
  assert.equal(corpo.viagens.length, 3);
  assert.equal(corpo.viagens[0].preco, 7.25);
  assert.ok(corpo.lido > 0, "e diz a que horas foi lido");
});

test("um par inválido nem chega à fonte", async () => {
  const antes = pedidos;
  const { codigo, corpo } = await pedir({ de: "lisboa", para: B });
  assert.equal(codigo, 400);
  assert.match(corpo.erro, /partida/);
  assert.equal(pedidos, antes, "a fonte não foi tocada");
});

test("a mesma pergunta duas vezes toca na fonte uma vez", async () => {
  const antes = pedidos;
  await pedir({ de: A, para: B, data: "2099-08-01" });
  await pedir({ de: A, para: B, data: "2099-08-01" });
  assert.equal(pedidos, antes + 1);
});

test("a fonte em baixo dá 200 com lista vazia, e não um 503", async () => {
  devolver = 500;
  const { codigo, corpo, cabecalhos } = await pedir({
    de: A,
    para: B,
    data: "2099-09-09",
  });
  devolver = 200;
  // Quem está a ver a página não tem avaria nenhuma: tem o horário planeado.
  assert.equal(codigo, 200);
  assert.equal(corpo.falhou, true);
  assert.deepEqual(corpo.viagens, []);
  assert.equal(
    cabecalhos.get("cache-control"),
    "no-store",
    "e uma falha não se guarda",
  );
});

test("o CORS fica preso à origem declarada, e nunca é `*`", async () => {
  const { cabecalhos } = await pedir({ de: A, para: B, data: "2099-07-02" });
  assert.equal(cabecalhos.get("access-control-allow-origin"), ORIGEM);
  assert.notEqual(cabecalhos.get("access-control-allow-origin"), "*");
});

test("só GET e OPTIONS existem — o Next responde 405 ao resto sozinho", async () => {
  assert.equal((await rota.OPTIONS()).status, 204);
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"])
    assert.equal(rota[metodo], undefined);
});
