/**
 * SEM `ADMIN_EMAIL`, O PAINEL NÃO ABRE.
 *
 * Era opcional, e sem ela a palavra-passe do dono entrava com QUALQUER email.
 * Agora é uma das três variáveis sem as quais o painel fica «por configurar»
 * — e a porta do dono, por cima disso, só abre com o email declarado.
 *
 * Os valores aqui são inventados para o teste: nada disto é um segredo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { abrePortaDoDono, emailDeclarado, faltaNoPainel } from '../src/lib/painel/configuracao.ts';

const COMPLETO = {
  ADMIN_PASSWORD_HASH: 'scrypt$16384$8$1$sal$hash',
  ADMIN_SESSION_SECRET: 'x'.repeat(48),
  ADMIN_EMAIL: 'Dono@Exemplo.pt ',
};

test('com as três variáveis, não falta nada', () => {
  assert.deepEqual(faltaNoPainel(COMPLETO), []);
});

test('sem ADMIN_EMAIL, o painel fica por configurar — e diz que é ela que falta', () => {
  const { ADMIN_EMAIL: _, ...semEmail } = COMPLETO;
  assert.deepEqual(faltaNoPainel(semEmail), ['ADMIN_EMAIL']);
  assert.deepEqual(faltaNoPainel({ ...COMPLETO, ADMIN_EMAIL: '   ' }), ['ADMIN_EMAIL']);
});

test('o que falta diz-se pelo nome, e todas as que faltarem', () => {
  assert.deepEqual(faltaNoPainel({}), [
    'ADMIN_PASSWORD_HASH',
    'ADMIN_SESSION_SECRET',
    'ADMIN_EMAIL',
  ]);
  assert.deepEqual(faltaNoPainel({ ...COMPLETO, ADMIN_SESSION_SECRET: 'curto' }), [
    'ADMIN_SESSION_SECRET',
  ]);
});

test('a lista de falta nunca leva valores', () => {
  const falta = faltaNoPainel({ ADMIN_SESSION_SECRET: 'um-segredo-curto' });
  assert.ok(!falta.some((x) => x.includes('um-segredo-curto')));
});

test('o email do dono compara-se sem espaços nem maiúsculas', () => {
  assert.equal(emailDeclarado(COMPLETO), 'dono@exemplo.pt');
  assert.equal(emailDeclarado({}), null);
});

test('a porta do dono só abre com a palavra-passe certa E o email declarado', () => {
  const declarado = emailDeclarado(COMPLETO);
  assert.equal(abrePortaDoDono(true, 'dono@exemplo.pt', declarado), true);
  assert.equal(abrePortaDoDono(true, '  DONO@exemplo.PT', declarado), true);
  assert.equal(abrePortaDoDono(true, 'outra@exemplo.pt', declarado), false, 'outro email');
  assert.equal(abrePortaDoDono(false, 'dono@exemplo.pt', declarado), false, 'senha errada');
});

test('sem email declarado, a porta do dono não abre com email nenhum', () => {
  // Era o caso que deixava entrar com qualquer email.
  assert.equal(abrePortaDoDono(true, 'qualquer@exemplo.pt', null), false);
  assert.equal(abrePortaDoDono(true, '', null), false);
});
