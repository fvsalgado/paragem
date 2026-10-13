/**
 * Os cabeçalhos de segurança, lidos da configuração tal como o Next os serve.
 *
 * Não havia nenhum: só o HSTS de omissão da plataforma, e a entrada do painel
 * podia ser emoldurada por outro sítio. Cada teste é uma porta que tem de
 * ficar fechada — e a das caixas para as câmaras, que tem de ficar aberta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.mjs';

type Cabecalho = { key: string; value: string };
type Regra = { source: string; headers: Cabecalho[] };

const regras = (await config.headers()) as Regra[];
const de = (fonte: string) => {
  const regra = regras.find((r) => r.source === fonte);
  assert.ok(regra, `não há regra para ${fonte}`);
  return Object.fromEntries(regra.headers.map((h) => [h.key, h.value]));
};
const PAGINAS = de('/((?!widget/).*)');
const CAIXAS = de('/widget/:caminho*');

test('as páginas não se deixam emoldurar, e o painel também não', () => {
  assert.equal(PAGINAS['X-Frame-Options'], 'DENY');
  assert.match(PAGINAS['Content-Security-Policy'], /frame-ancestors 'none'/);
  // A expressão apanha o painel e deixa as caixas de fora.
  const fonte = new RegExp(`^${'/((?!widget/).*)'}$`);
  assert.ok(fonte.test('/admin/entrar/'));
  assert.ok(fonte.test('/'));
  assert.ok(!fonte.test('/widget/paragem/x/'));
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
  assert.equal(PAGINAS['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
  assert.equal(PAGINAS['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.match(PAGINAS['Permissions-Policy'], /geolocation=\(self\)/);
  assert.match(PAGINAS['Permissions-Policy'], /camera=\(\)/);
});

test('as caixas também levam os cabeçalhos que não dependem da moldura', () => {
  assert.equal(CAIXAS['X-Content-Type-Options'], 'nosniff');
  assert.equal(CAIXAS['Strict-Transport-Security'], 'max-age=63072000; includeSubDomains');
});
