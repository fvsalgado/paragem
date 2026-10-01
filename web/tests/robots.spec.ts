/**
 * QUEM SE DEIXA INDEXAR, anfitrião a anfitrião.
 *
 * Havia um `robots.txt` só, servido igual a todos, e o `Disallow: /` que
 * existe por causa dos horários (§4.4) fechava também a página do produto,
 * que não tem horários nenhuns — quem procurava o produto pelo nome não o
 * encontrava. Agora são dois, e cada um tem a sua promessa:
 *
 *   · o da REGIÃO continua fechado, e é a única tranca que há em produção —
 *     um interruptor de painel desliga-se sem deixar rasto, isto não;
 *   · o do PRODUTO deixa indexar, e aponta o mapa do sítio.
 *
 * E o mapa do sítio de cada um não pode mentir: cada endereço que lá está tem
 * de responder 200. Um mapa com um 404 lá dentro ensina o motor de busca a
 * não confiar nele.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { DEMONSTRACOES, PORTA, PRODUTO, anfitriao, regioes } from './anfitrioes';

/**
 * Um pedido a uma região pelo endereço da máquina, com o `Host` dela à mão:
 * o Node não resolve `*.localhost`, e o navegador sim — mas o navegador é
 * lento para dezenas de endereços seguidos.
 */
async function naRegiao(request: APIRequestContext, id: string, caminho: string) {
  return await request.get(`http://127.0.0.1:${PORTA}${caminho}`, {
    headers: { host: `${id}.localhost:${PORTA}` },
    maxRedirects: 0,
  });
}

test('o anfitrião do produto deixa-se indexar, e diz onde está o mapa do sítio', async ({
  request,
}) => {
  const r = await request.get(`${PRODUTO}/robots.txt`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/plain');
  const texto = await r.text();
  expect(texto).toMatch(/User-agent:\s*\*/i);
  expect(texto).toMatch(/^Allow:\s*\/\s*$/m);
  expect(texto, 'o produto não pode fechar a porta inteira').not.toMatch(/^Disallow:\s*\/\s*$/m);
  expect(texto).toContain(`Sitemap: ${PRODUTO}/sitemap.xml`);
});

test('cada região continua a dizer aos motores de busca para não a indexarem', async ({
  request,
}) => {
  // Enquanto houver preços por confirmar e viagens sem dias, isto não se
  // indexa: a página diz o que não sabe, um resultado de pesquisa não. Sai
  // quando a autoridade de transportes autorizar (Fase 5), num commit que
  // alguém assina — e sem `Sitemap:`, que era convidar a ler o que se pede
  // para não indexar.
  for (const id of regioes()) {
    const r = await naRegiao(request, id, '/robots.txt');
    expect(r.status(), id).toBe(200);
    const texto = await r.text();
    expect(texto, id).toMatch(/User-agent:\s*\*/i);
    expect(texto, id).toMatch(/^Disallow:\s*\/\s*$/m);
    expect(texto, id).not.toMatch(/^Sitemap:/im);
    expect(texto, `${id}: o comentário do §4.4 vai com a regra`).toContain('§4.4');
  }
});

/** Os `<loc>` de um mapa do sítio, pela ordem em que lá estão. */
const enderecos = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

test('o mapa do sítio do produto tem as páginas do produto, e todas respondem', async ({
  request,
}) => {
  const r = await request.get(`${PRODUTO}/sitemap.xml`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('xml');
  const locs = enderecos(await r.text());
  expect(locs).toEqual(
    ['/', '/contacto/', '/privacidade/', '/acessibilidade/'].map((c) => `${PRODUTO}${c}`),
  );
  for (const loc of locs) expect((await request.get(loc)).status(), loc).toBe(200);
});

test('o mapa do sítio de cada região é XML, no domínio dela, e cada página dele existe', async ({
  request,
}) => {
  test.setTimeout(240_000);
  for (const id of regioes()) {
    const r = await naRegiao(request, id, '/sitemap.xml');
    expect(r.status(), id).toBe(200);
    expect(r.headers()['content-type'], id).toContain('xml');
    const locs = enderecos(await r.text());
    expect(locs.length, `${id}: o mapa do sítio está vazio`).toBeGreaterThan(5);
    for (const loc of locs) expect(loc.startsWith(`${anfitriao(id)}/`), loc).toBe(true);
    // As demonstrações pedem-se inteiras, que são poucas dezenas. Uma região
    // a sério tem milhares de paragens: pede-se uma amostra espalhada, que
    // apanha um molde partido sem esperar um quarto de hora.
    const passo = DEMONSTRACOES.includes(id) ? 1 : Math.max(1, Math.floor(locs.length / 120));
    for (const loc of locs.filter((_, i) => i % passo === 0)) {
      const resposta = await naRegiao(request, id, new URL(loc).pathname);
      expect(resposta.status(), loc).toBe(200);
    }
  }
});

test('os endereços de cada anfitrião não se cruzam', async ({ request }) => {
  // O contacto do produto não aparece com a casa de uma autoridade à volta, e
  // o segmento onde as páginas do produto vivem por dentro não se alcança de
  // fora — nem numa região, nem fora dela.
  const [primeira] = regioes();
  expect((await naRegiao(request, primeira, '/contacto/')).status()).toBe(404);
  expect((await naRegiao(request, primeira, '/-produto/contacto/')).status()).toBe(404);
  expect((await request.get(`${PRODUTO}/-produto/contacto/`)).status()).toBe(404);
});
