#!/usr/bin/env node
/**
 * Gera o valor de `ADMIN_PASSWORD_HASH`.
 *
 * O painel não tem contas nem registo: tem uma palavra-passe, e dessa
 * palavra-passe o servidor só conhece um hash com sal. Isto é a única forma
 * prevista de o produzir. Uso preferido — a palavra-passe entra por `stdin`
 * e não fica no histórico da shell nem na lista de processos:
 *
 *     printf '%s' 'a-palavra-passe' | node scripts/senha.mjs
 *
 * Também aceita um argumento, para onde o histórico não interessa:
 *
 *     node scripts/senha.mjs 'a-palavra-passe'
 *
 * O que sai é uma linha `scrypt$N$r$p$sal$hash`, pronta a colar na variável.
 * Cada execução dá um valor diferente para a mesma palavra-passe — o sal é
 * novo de cada vez, e é isso que se pretende. Trocar a palavra-passe não
 * invalida as sessões abertas; trocar o `ADMIN_SESSION_SECRET` invalida.
 */
import { randomBytes } from 'node:crypto';
import { COMPRIMENTO_MINIMO, codificarSenha } from '../src/lib/painel/senha.ts';

function lerStdin() {
  return new Promise((resolver, rejeitar) => {
    let texto = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (pedaco) => {
      texto += pedaco;
    });
    process.stdin.on('end', () => resolver(texto));
    process.stdin.on('error', rejeitar);
  });
}

async function lerSenha() {
  const doArgumento = process.argv[2];
  if (typeof doArgumento === 'string' && doArgumento.length > 0) return doArgumento;
  if (process.stdin.isTTY) {
    throw new Error(
      "Passa a palavra-passe por stdin ou como argumento:\n  printf '%s' 'a-palavra-passe' | node scripts/senha.mjs",
    );
  }
  // Só a primeira linha: um `echo` sem `-n` acrescenta um newline que ninguém
  // quer a fazer parte da palavra-passe.
  return (await lerStdin()).split('\n')[0] ?? '';
}

try {
  const senha = await lerSenha();
  if (senha.length < COMPRIMENTO_MINIMO) {
    throw new Error(`A palavra-passe tem de ter pelo menos ${COMPRIMENTO_MINIMO} caracteres.`);
  }
  // O hash vai para `stdout` sozinho, para poder ser redirecionado ou copiado
  // sem limpeza. As instruções vão para `stderr`.
  process.stderr.write('Acrescenta esta linha ao ambiente do servidor:\n\n');
  process.stdout.write(`ADMIN_PASSWORD_HASH=${codificarSenha(senha)}\n`);
  process.stderr.write(
    '\nFalta ainda ADMIN_SESSION_SECRET, com pelo menos 32 caracteres ao acaso — por exemplo:\n' +
      `  ADMIN_SESSION_SECRET=${randomBytes(48).toString('base64url')}\n` +
      '\nE IP_HASH_SALT, com 16 ou mais, para os endereços não se guardarem em claro.\n',
  );
} catch (erro) {
  process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
