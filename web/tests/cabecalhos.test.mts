/**
 * Os cabeçalhos de segurança, lidos da configuração tal como o Next os serve.
 *
 * Não havia nenhum: só o HSTS de omissão da plataforma, e a entrada do painel
 * podia ser emoldurada por outro sítio. Cada teste é uma porta que tem de
 * ficar fechada — e a das caixas para as câmaras, que tem de ficar aberta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import config, { FICHEIROS, IMAGENS, PAGINAS as FONTE_DAS_PAGINAS } from '../next.config.mjs';
// O comparador com que o próprio Next decide que regra serve cada caminho.
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match.js';

type Cabecalho = { key: string; value: string };
type Regra = { source: string; headers: Cabecalho[] };

const regras = (await config.headers()) as Regra[];
const de = (fonte: string) => {
  const regra = regras.find((r) => r.source === fonte);
  assert.ok(regra, `não há regra para ${fonte}`);
  return Object.fromEntries(regra.headers.map((h) => [h.key, h.value]));
};
const PAGINAS = de(FONTE_DAS_PAGINAS);
const CAIXAS = de('/widget/:caminho*');
const DOS_FICHEIROS = de(FICHEIROS);
const DAS_IMAGENS = de(IMAGENS);
const casa = (fonte: string) => {
  const m = getPathMatch(fonte, { removeUnnamedParams: true, strict: true });
  return (caminho: string) => m(caminho) !== false;
};

test('as páginas não se deixam emoldurar, e o painel também não', () => {
  assert.equal(PAGINAS['X-Frame-Options'], 'DENY');
  assert.match(PAGINAS['Content-Security-Policy'], /frame-ancestors 'none'/);
  // A expressão apanha o painel e deixa as caixas de fora.
  const fonte = casa(FONTE_DAS_PAGINAS);
  assert.ok(fonte('/admin/entrar/'));
  assert.ok(fonte('/'));
  assert.ok(fonte('/rede/paragens/x/'));
  assert.ok(!fonte('/widget/paragem/x/'));
});

test('as caixas para as câmaras deixam-se emoldurar por qualquer sítio', () => {
  assert.equal(CAIXAS['X-Frame-Options'], undefined);
  assert.match(CAIXAS['Content-Security-Policy'], /frame-ancestors \*/);
});

test('scripts, objetos, bases e formulários só do próprio sítio', () => {
  const csp = PAGINAS['Content-Security-Policy'];
  assert.match(csp, /script-src 'self' 'unsafe-inline'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /worker-src 'self' blob:/);
});

test('os cabeçalhos de sempre, e a localização só para o próprio sítio', () => {
  assert.equal(PAGINAS['X-Content-Type-Options'], 'nosniff');
  assert.equal(PAGINAS['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(PAGINAS['Strict-Transport-Security'], 'max-age=86400');
  assert.equal(PAGINAS['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.match(PAGINAS['Permissions-Policy'], /geolocation=\(self\)/);
  assert.match(PAGINAS['Permissions-Policy'], /camera=\(\)/);
});

test('as caixas também levam os cabeçalhos que não dependem da moldura', () => {
  assert.equal(CAIXAS['X-Content-Type-Options'], 'nosniff');
  assert.equal(CAIXAS['Strict-Transport-Security'], 'max-age=86400');
});

test('os ficheiros só levam o nosniff, e as páginas não caem nessa regra', () => {
  // A política de conteúdo num pedaço de JavaScript não faz nada e pesa
  // 1,1 KiB por resposta (ver `next.config.mjs`).
  assert.deepEqual(DOS_FICHEIROS, { 'X-Content-Type-Options': 'nosniff' });
  const paginas = casa(FONTE_DAS_PAGINAS);
  const ficheiros = casa(FICHEIROS);
  for (const f of [
    '/_next/static/chunks/main-app-b92263b3a1edb572.js',
    '/_next/static/media/9816a0e0ed309b6c-s.p.woff2',
    '/maplibre/5.0.0/maplibre-gl-csp-worker.js',
    '/glifos/Atkinson%20Hyperlegible%20Regular/0-255.pbf',
  ]) {
    assert.ok(ficheiros(f), `${f} devia ser ficheiro`);
    assert.ok(!paginas(f), `${f} não devia levar os cabeçalhos das páginas`);
  }
  for (const p of ['/', '/rede/', '/admin/entrar/', '/viagem/']) {
    assert.ok(!ficheiros(p), `${p} não é ficheiro`);
    assert.ok(paginas(p), `${p} devia levar os cabeçalhos das páginas`);
  }
});

test('as imagens fecham tudo menos os estilos que trazem, e não são páginas', () => {
  // Um SVG aberto sozinho é um documento: sem isto podia correr scripts.
  assert.equal(
    DAS_IMAGENS['Content-Security-Policy'],
    "default-src 'none'; style-src 'unsafe-inline'",
  );
  assert.equal(DAS_IMAGENS['X-Content-Type-Options'], 'nosniff');
  const paginas = casa(FONTE_DAS_PAGINAS);
  const imagens = casa(IMAGENS);
  for (const f of ['/icon.svg', '/apple-icon.png', '/favicon.ico', '/logotipo/09f44f7a.svg']) {
    assert.ok(imagens(f), `${f} devia ser imagem`);
    assert.ok(!paginas(f), `${f} não devia levar os cabeçalhos das páginas`);
  }
  for (const p of ['/', '/rede/', '/sitemap.xml', '/.well-known/security.txt']) {
    assert.ok(!imagens(p), `${p} não é imagem`);
    assert.ok(paginas(p), `${p} devia levar os cabeçalhos das páginas`);
  }
});
