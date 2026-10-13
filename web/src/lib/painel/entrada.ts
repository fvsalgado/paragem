import 'server-only';
import { randomBytes } from 'node:crypto';
import { temChaveDeServico } from './base';
import { actorDoDono, emailDoDono } from './autenticacao';
import { abrePortaDoDono } from './configuracao';
import { actorDe, pessoaPorEmail } from './pessoas';
import { DONO } from './sessao';
import { codificarSenha, verificarSenha } from './senha';

/**
 * Quem é, pelo email e pela palavra-passe — ou ninguém.
 *
 * A ORDEM É A DO DESENHO COMUM AOS DOIS PAINÉIS (`CONTAS.md`):
 *
 *   1. a palavra-passe do AMBIENTE (`ADMIN_PASSWORD_HASH`) é a do dono, como
 *      sempre foi, e tem de vir com o email de `ADMIN_EMAIL` (sem olhar a
 *      maiúsculas). Sem `ADMIN_EMAIL` esta porta NÃO abre — entrava com
 *      qualquer email, e era só a palavra-passe a guardá-la (`configuracao.ts`).
 *      Não passa pela base: é por isso que ninguém fica trancado fora no dia
 *      em que as contas chegam;
 *   2. senão, a pessoa com esse email, se estiver ativa e com palavra-passe.
 *
 * O TEMPO NÃO DIZ NADA. Faz-se sempre o mesmo trabalho — a palavra-passe do
 * dono confere-se sempre, e a de uma pessoa que não existe confere-se contra
 * um hash a fingir —, para que a demora da resposta não conte a quem tenta se
 * o email existe. A mensagem também não: é a mesma para os dois casos.
 */

export interface Quem {
  /** `dono`, ou o identificador da pessoa. */
  sub: string;
  /** «Nome · email» — ou «dono · email». */
  actor: string;
  /** O hash que deu certo: a sessão leva a impressão dele. */
  senhaHash: string;
  /** `null` para o dono. */
  pessoaId: string | null;
}

let aFingir: string | null = null;

/** Um hash scrypt com os parâmetros de produção, de uma palavra-passe que ninguém sabe. */
function hashAFingir(): string {
  aFingir ??= codificarSenha(randomBytes(24).toString('base64url'));
  return aFingir;
}

export async function conferirCredenciais(email: string, senha: string): Promise<Quem | null> {
  const doEmail = email.trim().toLowerCase();
  const hashDoDono = process.env.ADMIN_PASSWORD_HASH ?? '';
  const declarado = emailDoDono();

  // Sempre, e antes de tudo: é o que mantém o tempo igual nos dois caminhos.
  const senhaDoDono = verificarSenha(senha, hashDoDono);
  if (abrePortaDoDono(senhaDoDono, doEmail, declarado)) {
    return { sub: DONO, actor: actorDoDono(), senhaHash: hashDoDono, pessoaId: null };
  }

  const pessoa = doEmail && temChaveDeServico() ? await pessoaPorEmail(doEmail) : null;
  const hash = pessoa && !pessoa.desativada_em ? pessoa.senha_hash : null;
  if (!hash) {
    verificarSenha(senha, hashAFingir());
    return null;
  }
  if (!pessoa || !verificarSenha(senha, hash)) return null;
  return { sub: pessoa.id, actor: actorDe(pessoa), senhaHash: hash, pessoaId: pessoa.id };
}
