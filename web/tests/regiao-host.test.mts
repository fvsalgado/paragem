/**
 * A porta do multi-região, frase a frase.
 *
 * Cada teste é uma promessa do produto: um Host vira a sua região, um alias
 * vira 308, um anfitrião desconhecido vira a montra — e NUNCA a rede de outra
 * região. A decisão é pura (`decidir`) e é isso que se testa; o middleware só
 * a traduz para o que o Next entende.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAO_E_ENDERECO,
  decidir,
  dominioDaRegiao,
  esquecerMapa,
  lerMapaNaBase,
  mapaDeDominios,
  mapaDoAmbiente,
  normalizarHost,
  regiaoDoHost,
  regioesDoMapa,
  somar,
  type Mapa,
} from '../src/lib/regiao-host.ts';

const MAPA: Mapa = {
  dominios: { 'prova-municipio.exemplo.pt': 'prova-municipio', 'prova.exemplo.pt': 'prova' },
  redirecionamentos: { 'www.prova-municipio.exemplo.pt': 'prova-municipio.exemplo.pt' },
  origens: { 'prova-municipio': 'prova-municipio.exemplo.pt', prova: 'prova.exemplo.pt' },
};

test('o Host reduz-se ao nome: sem porto, em minúsculas, IPv6 inteiro', () => {
  assert.equal(normalizarHost('Prova.Exemplo.PT:443'), 'prova.exemplo.pt');
  assert.equal(normalizarHost('[::1]:3000'), '[::1]');
  assert.equal(normalizarHost('  '), null);
  assert.equal(normalizarHost(null), null);
});

test('cada domínio serve a sua região, e só a sua', () => {
  assert.equal(regiaoDoHost('prova-municipio.exemplo.pt', MAPA.dominios), 'prova-municipio');
  assert.equal(regiaoDoHost('prova.exemplo.pt:4321', MAPA.dominios), 'prova');
  // Um subdomínio a mais não é o domínio da região: adivinhar era servir a
  // rede de um cliente num endereço que ninguém lhe atribuiu.
  assert.equal(regiaoDoHost('x.prova.exemplo.pt', MAPA.dominios), null);
  assert.equal(regiaoDoHost('127.0.0.1', MAPA.dominios), null);
});

test('num anfitrião de região, o caminho reescreve-se para o segmento dela', () => {
  assert.deepEqual(decidir('prova.exemplo.pt', '/', MAPA), { tipo: 'reescrever', para: '/prova/' });
  assert.deepEqual(decidir('prova.exemplo.pt', '/rede/paragens/x/', MAPA), {
    tipo: 'reescrever',
    para: '/prova/rede/paragens/x/',
  });
});

test('o endereço antigo deixou de existir: /<regiao>/ num anfitrião de região vai para dentro dela', () => {
  // O caminho de outra região pedido a este anfitrião reescreve-se para
  // dentro DESTE — `/prova/prova-municipio/…`, que não é página nenhuma:
  // 404, e não a rede da outra.
  assert.deepEqual(decidir('prova.exemplo.pt', '/prova-municipio/rede/', MAPA), {
    tipo: 'reescrever',
    para: '/prova/prova-municipio/rede/',
  });
});

test('um anfitrião desconhecido vê a montra em /, e mais nada', () => {
  assert.deepEqual(decidir('paragem-abc.vercel.app', '/', MAPA), { tipo: 'passar' });
  assert.deepEqual(decidir(null, '/', MAPA), { tipo: 'passar' });
  // Nem por caminho: `/prova-municipio/` num anfitrião que não é de ninguém não é a
  // rede de ninguém. Vai para um segmento que nenhuma região pode ter.
  const d = decidir('paragem-abc.vercel.app', '/prova-municipio/rede/', MAPA);
  assert.deepEqual(d, { tipo: 'reescrever', para: `${NAO_E_ENDERECO}/prova-municipio/rede/` });
  assert.ok(
    NAO_E_ENDERECO.startsWith('/-'),
    'começa por hífen: nenhum identificador de região o pode ter',
  );
});

test('um alias redireciona para o canónico e nunca serve', () => {
  assert.deepEqual(decidir('www.prova-municipio.exemplo.pt', '/rede/', MAPA), {
    tipo: 'redirecionar',
    host: 'prova-municipio.exemplo.pt',
  });
});

test('a API e os ficheiros passam tal como estão, em qualquer anfitrião', () => {
  for (const host of ['prova.exemplo.pt', 'paragem-abc.vercel.app', null]) {
    assert.deepEqual(decidir(host, '/api/revalidate/', MAPA), { tipo: 'passar' });
    assert.deepEqual(decidir(host, '/robots.txt', MAPA), { tipo: 'passar' });
    assert.deepEqual(decidir(host, '/glifos/Atkinson.woff2', MAPA), { tipo: 'passar' });
  }
});

test('o mapa do ambiente lê «id=host» e ignora o que não é', () => {
  const m = mapaDoAmbiente(
    'prova-municipio=prova-municipio.localhost:4321, prova=Prova.Localhost,mal,=x,MAIUS=y.pt',
  );
  assert.deepEqual(m.dominios, {
    'prova-municipio.localhost': 'prova-municipio',
    'prova.localhost': 'prova',
  });
  assert.deepEqual(regioesDoMapa(m), ['prova-municipio', 'prova']);
  // Para escrever numa ligação, o anfitrião leva o porto com que foi declarado.
  assert.equal(dominioDaRegiao(m, 'prova-municipio'), 'prova-municipio.localhost:4321');
  assert.equal(dominioDaRegiao(m, 'prova'), 'prova.localhost');
  assert.equal(dominioDaRegiao(m, 'nada'), null);
});

test('o ambiente soma-se à base e ganha quando o domínio é o mesmo', () => {
  const m = somar(MAPA, mapaDoAmbiente('outra=prova.exemplo.pt,nova=nova.localhost'));
  assert.equal(m.dominios['prova.exemplo.pt'], 'outra');
  assert.equal(m.dominios['nova.localhost'], 'nova');
  assert.equal(m.dominios['prova-municipio.exemplo.pt'], 'prova-municipio');
});

/** Um `fetch` que responde à base como a porta pública responde. */
function baseDeBrincar(regioes: unknown, aliases: unknown, estado = 200): typeof fetch {
  return (async (entrada: string | URL | Request) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const corpo = url.includes('/regions?') ? regioes : aliases;
    return new Response(JSON.stringify(corpo), { status: estado });
  }) as typeof fetch;
}

test('a base traz os canónicos e os alias, e um alias de região desligada não redireciona', async () => {
  const buscar = baseDeBrincar(
    [{ id: 'prova-municipio', domain: 'Prova-Municipio.Exemplo.PT' }],
    [
      { domain: 'www.prova-municipio.exemplo.pt', region_id: 'prova-municipio' },
      { domain: 'velho.exemplo.pt', region_id: 'desligada' },
    ],
  );
  const m = await lerMapaNaBase(buscar, 'https://x.supabase.co', 'chave');
  assert.deepEqual(m.dominios, { 'prova-municipio.exemplo.pt': 'prova-municipio' });
  assert.deepEqual(m.redirecionamentos, {
    'www.prova-municipio.exemplo.pt': 'prova-municipio.exemplo.pt',
  });
  assert.deepEqual(m.origens, { 'prova-municipio': 'prova-municipio.exemplo.pt' });
});

test('sem base configurada, o mapa é o do ambiente; com a base a falhar, serve-se o que se tinha', async () => {
  esquecerMapa();
  const guardado = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    chave: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    dom: process.env.PARAGEM_DOMINIOS,
  };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.PARAGEM_DOMINIOS = 'prova=prova.localhost';
    let agora = 0;
    const relogio = () => agora;
    const m1 = await mapaDeDominios(baseDeBrincar([], []), relogio);
    assert.deepEqual(m1.dominios, { 'prova.localhost': 'prova' });

    // Agora com base, a responder bem uma vez e depois a falhar: o mapa velho fica.
    esquecerMapa();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'chave';
    const boa = baseDeBrincar(
      [{ id: 'prova-municipio', domain: 'prova-municipio.exemplo.pt' }],
      [],
    );
    const m2 = await mapaDeDominios(boa, relogio);
    assert.deepEqual(Object.keys(m2.dominios).sort(), [
      'prova-municipio.exemplo.pt',
      'prova.localhost',
    ]);
    agora = 10 * 60 * 1000; // o prazo passou
    const m3 = await mapaDeDominios(baseDeBrincar([], [], 500), relogio);
    assert.deepEqual(m3.dominios, m2.dominios, 'a falha não apaga o mapa que se tinha');
  } finally {
    esquecerMapa();
    if (guardado.url) process.env.NEXT_PUBLIC_SUPABASE_URL = guardado.url;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (guardado.chave) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = guardado.chave;
    else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (guardado.dom) process.env.PARAGEM_DOMINIOS = guardado.dom;
    else delete process.env.PARAGEM_DOMINIOS;
  }
});
