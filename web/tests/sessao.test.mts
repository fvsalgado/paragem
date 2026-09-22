/**
 * O token de sessão do painel: aceita o seu, recusa tudo o resto.
 *
 * O segredo gera-se a cada execução e não está escrito no ficheiro: uma
 * cadeia com ar de segredo num ficheiro versionado é indistinguível de um
 * segredo a sério para quem varre o repositório, e um alerta que se aprende
 * a ignorar deixa de valer alguma coisa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { criarSessao, lerSessao } from '../src/lib/painel/sessao.ts';

const SEGREDO = randomBytes(32).toString('base64url');

test('aceita o próprio token', async () => {
  const token = await criarSessao('gestor', SEGREDO);
  assert.equal((await lerSessao(token, SEGREDO))?.actor, 'gestor');
});

test('recusa um token assinado com outro segredo', async () => {
  const token = await criarSessao('gestor', SEGREDO);
  assert.equal(await lerSessao(token, randomBytes(32).toString('base64url')), null);
});

test('recusa um corpo trocado por baixo da mesma assinatura', async () => {
  const token = await criarSessao('gestor', SEGREDO);
  const assinatura = token.slice(token.lastIndexOf('.') + 1);
  const forjado = Buffer.from(JSON.stringify({ actor: 'intruso', exp: 9e9, jti: 'x' })).toString(
    'base64url',
  );
  assert.equal(await lerSessao(`${forjado}.${assinatura}`, SEGREDO), null);
});

test('recusa uma assinatura adulterada', async () => {
  const token = await criarSessao('gestor', SEGREDO);
  const ponto = token.lastIndexOf('.');
  const corpo = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);
  const trocada = assinatura.slice(0, -1) + (assinatura.endsWith('a') ? 'b' : 'a');
  assert.equal(await lerSessao(`${corpo}.${trocada}`, SEGREDO), null);
});

test('recusa um token expirado', async () => {
  const haNoveHoras = Date.now() - 9 * 60 * 60 * 1000;
  const token = await criarSessao('gestor', SEGREDO, haNoveHoras);
  assert.equal(await lerSessao(token, SEGREDO), null);
});

test('aceita um token ainda dentro das oito horas', async () => {
  const haSeteHoras = Date.now() - 7 * 60 * 60 * 1000;
  const token = await criarSessao('gestor', SEGREDO, haSeteHoras);
  assert.notEqual(await lerSessao(token, SEGREDO), null);
});

test('recusa lixo em vez de rebentar', async () => {
  for (const valor of ['', 'sem-ponto', '.', 'a.b', undefined]) {
    assert.equal(await lerSessao(valor, SEGREDO), null);
  }
});

test('não repete o mesmo token para a mesma sessão', async () => {
  const [primeiro, segundo] = await Promise.all([
    criarSessao('gestor', SEGREDO),
    criarSessao('gestor', SEGREDO),
  ]);
  assert.notEqual(primeiro, segundo);
});
