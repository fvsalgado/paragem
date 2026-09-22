/**
 * A palavra-passe do painel: o formato, a conferência, e o que se recusa.
 *
 * Os valores geram-se a cada execução, e os parâmetros do scrypt são baixos
 * de propósito: os de produção pedem 32 MiB por verificação e tornariam a
 * suíte lenta sem provar mais nada sobre o formato.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { codificarSenha, verificarSenha } from '../src/lib/painel/senha.ts';

const CUSTO = 1024;
const BLOCO = 8;

const aoAcaso = () => randomBytes(24).toString('base64url');

test('recusa um hash mal formado sem rebentar', () => {
  for (const codificada of ['', 'lixo', 'scrypt$16384$8$1$só-quatro', 'bcrypt$1$2$3$4$5']) {
    assert.equal(verificarSenha(aoAcaso(), codificada), false);
  }
});

test('confere com a palavra-passe certa', () => {
  const senha = aoAcaso();
  assert.equal(verificarSenha(senha, codificarSenha(senha, CUSTO, BLOCO)), true);
});

test('falha com a palavra-passe errada, e com a vazia', () => {
  const codificada = codificarSenha(aoAcaso(), CUSTO, BLOCO);
  assert.equal(verificarSenha(aoAcaso(), codificada), false);
  assert.equal(verificarSenha('', codificada), false);
});

test('o mesmo texto dá hashes diferentes — o sal é novo de cada vez', () => {
  const senha = aoAcaso();
  assert.notEqual(codificarSenha(senha, CUSTO, BLOCO), codificarSenha(senha, CUSTO, BLOCO));
});

test('o formato é o que o script promete: scrypt$N$r$p$sal$hash', () => {
  const partes = codificarSenha(aoAcaso(), CUSTO, BLOCO).split('$');
  assert.equal(partes.length, 6);
  assert.deepEqual(partes.slice(0, 4), ['scrypt', String(CUSTO), String(BLOCO), '1']);
});
