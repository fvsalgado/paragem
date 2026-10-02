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
import { criarSessao, impressaoDaSenha, lerSessao, DONO } from '../src/lib/painel/sessao.ts';
import { assinar, base64url } from '../src/lib/painel/token-assinado.ts';

const SEGREDO = randomBytes(32).toString('base64url');
const QUEM = { sub: DONO, actor: 'dono', v: 'impressao-de-teste' };

test('aceita o próprio token, e diz de quem é', async () => {
  const token = await criarSessao(QUEM, SEGREDO);
  const sessao = await lerSessao(token, SEGREDO);
  assert.equal(sessao?.sub, DONO);
  assert.equal(sessao?.actor, 'dono');
  assert.equal(sessao?.v, 'impressao-de-teste');
});

test('uma pessoa leva o identificador dela, e não um papel', async () => {
  const id = '1f0c6a52-0000-4000-8000-000000000001';
  const token = await criarSessao(
    { sub: id, actor: 'Ana Silva · ana@exemplo.pt', v: 'x' },
    SEGREDO,
  );
  assert.equal((await lerSessao(token, SEGREDO))?.sub, id);
});

test('recusa um token assinado com outro segredo', async () => {
  const token = await criarSessao(QUEM, SEGREDO);
  assert.equal(await lerSessao(token, randomBytes(32).toString('base64url')), null);
});

test('recusa um corpo trocado por baixo da mesma assinatura', async () => {
  const token = await criarSessao(QUEM, SEGREDO);
  const assinatura = token.slice(token.lastIndexOf('.') + 1);
  const forjado = Buffer.from(
    JSON.stringify({ sub: DONO, actor: 'intruso', v: 'x', exp: 9e9, jti: 'x' }),
  ).toString('base64url');
  assert.equal(await lerSessao(`${forjado}.${assinatura}`, SEGREDO), null);
});

test('recusa uma assinatura adulterada', async () => {
  const token = await criarSessao(QUEM, SEGREDO);
  const ponto = token.lastIndexOf('.');
  const corpo = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);
  const trocada = assinatura.slice(0, -1) + (assinatura.endsWith('a') ? 'b' : 'a');
  assert.equal(await lerSessao(`${corpo}.${trocada}`, SEGREDO), null);
});

test('recusa um token expirado', async () => {
  const haNoveHoras = Date.now() - 9 * 60 * 60 * 1000;
  const token = await criarSessao(QUEM, SEGREDO, haNoveHoras);
  assert.equal(await lerSessao(token, SEGREDO), null);
});

test('aceita um token ainda dentro das oito horas', async () => {
  const haSeteHoras = Date.now() - 7 * 60 * 60 * 1000;
  const token = await criarSessao(QUEM, SEGREDO, haSeteHoras);
  assert.notEqual(await lerSessao(token, SEGREDO), null);
});

test('recusa lixo em vez de rebentar', async () => {
  for (const valor of ['', 'sem-ponto', '.', 'a.b', undefined]) {
    assert.equal(await lerSessao(valor, SEGREDO), null);
  }
});

test('não repete o mesmo token para a mesma sessão', async () => {
  const [primeiro, segundo] = await Promise.all([
    criarSessao(QUEM, SEGREDO),
    criarSessao(QUEM, SEGREDO),
  ]);
  assert.notEqual(primeiro, segundo);
});

// O TOKEN DE ANTES DAS CONTAS — `{ actor, exp, jti }`, bem assinado — já não
// serve: não diz de quem é, nem que palavra-passe o abriu. O dono entra outra
// vez, com a mesma palavra-passe.
test('recusa um token de antes das contas, mesmo bem assinado', async () => {
  const corpo = base64url(
    new TextEncoder().encode(
      JSON.stringify({ actor: 'gestor', exp: Math.floor(Date.now() / 1000) + 3600, jti: 'x' }),
    ),
  );
  const antigo = `${corpo}.${await assinar(corpo, SEGREDO)}`;
  assert.equal(await lerSessao(antigo, SEGREDO), null);
});

// A IMPRESSÃO DA PALAVRA-PASSE: é ela que faz uma palavra-passe nova expulsar
// quem estava dentro com a antiga — e tem de mudar com o hash, não depender
// só do segredo, nem revelar o hash a quem tem o cookie.
test('a impressão muda com o hash, e não se calcula sem o segredo', async () => {
  const a = await impressaoDaSenha('scrypt$32768$8$1$c2Fs$aGFzaA==', SEGREDO);
  const b = await impressaoDaSenha('scrypt$32768$8$1$b3V0cm8=$b3V0cm8=', SEGREDO);
  const outroSegredo = await impressaoDaSenha(
    'scrypt$32768$8$1$c2Fs$aGFzaA==',
    randomBytes(32).toString('base64url'),
  );
  assert.equal(a, await impressaoDaSenha('scrypt$32768$8$1$c2Fs$aGFzaA==', SEGREDO));
  assert.notEqual(a, b);
  assert.notEqual(a, outroSegredo);
  assert.equal(a.length, 22);
  assert.ok(!a.includes('scrypt'));
});
