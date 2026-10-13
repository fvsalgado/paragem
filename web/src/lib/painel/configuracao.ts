/**
 * O QUE O PAINEL PRECISA PARA ABRIR, e a porta do dono — sem nada do Next, para
 * se testar sem servidor (`tests/configuracao-do-painel.test.mts`).
 *
 * Fala das variáveis pelo NOME e nunca pelo valor: a página «Painel por
 * configurar» diz quais faltam a quem gere a instalação, e não pode dizer
 * mais nada.
 *
 * `ADMIN_EMAIL` PASSOU A SER OBRIGATÓRIA. Sem ela, a palavra-passe do ambiente
 * entrava com QUALQUER email: a segurança da porta do dono era só a
 * palavra-passe, e uma pessoa convidada que escrevesse outro email com a
 * palavra-passe dele entrava como dono. Agora, sem email declarado, o painel
 * não abre — e diz porquê —, em vez de abrir com a porta encostada.
 */

type Ambiente = Record<string, string | undefined>;

/** Um segredo curto vale o mesmo que nenhum. */
export const SEGREDO_MINIMO = 32;

/** O email do dono, como se compara: sem espaços e em minúsculas. `null` sem ele. */
export function emailDeclarado(env: Ambiente = process.env): string | null {
  const email = (env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  return email || null;
}

/**
 * Os nomes das variáveis que faltam para o painel abrir — vazio quando não
 * falta nenhuma. É esta lista que decide se o painel está «por configurar».
 */
export function faltaNoPainel(env: Ambiente = process.env): string[] {
  const falta: string[] = [];
  if (!env.ADMIN_PASSWORD_HASH) falta.push('ADMIN_PASSWORD_HASH');
  if ((env.ADMIN_SESSION_SECRET ?? '').length < SEGREDO_MINIMO) falta.push('ADMIN_SESSION_SECRET');
  if (!emailDeclarado(env)) falta.push('ADMIN_EMAIL');
  return falta;
}

/**
 * A porta do dono: a palavra-passe do ambiente certa E o email declarado, sem
 * olhar a maiúsculas. Sem email declarado não abre — nunca «qualquer email».
 *
 * É a segunda barreira: a primeira é o painel nem abrir sem `ADMIN_EMAIL`
 * (`faltaNoPainel`). Ficam as duas, para uma não depender da outra.
 */
export function abrePortaDoDono(
  senhaDoDonoCerta: boolean,
  emailEscrito: string,
  declarado: string | null,
): boolean {
  return senhaDoDonoCerta && declarado !== null && declarado === emailEscrito.trim().toLowerCase();
}
