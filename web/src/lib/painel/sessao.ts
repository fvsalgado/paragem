import { assinar, base64url, deBase64url, iguaisEmTempoConstante } from './token-assinado.ts';

/**
 * O token de sessão do painel.
 *
 * Um cookie com `corpo.assinatura`, os dois em base64url: o corpo diz quem
 * age e até quando, a assinatura é um HMAC com o `ADMIN_SESSION_SECRET`. Não
 * há tabela de sessões — o servidor não guarda nada, e trocar o segredo
 * invalida todas as sessões abertas de uma vez, que é o que se quer quando
 * se troca um segredo.
 *
 * Puro, sem nada do Next, para poder ser testado sem servidor e para correr
 * tal e qual no middleware (edge) e nas páginas (Node). A verificação da
 * palavra-passe vive em `senha.ts`, que é de propósito outro ficheiro: usa
 * scrypt, só corre no servidor, e o middleware não precisa dela.
 *
 * Levantado do Coreto (`src/lib/admin/session.ts`).
 */

export const COOKIE_DA_SESSAO = 'paragem_admin';
export const VALIDADE_DA_SESSAO_S = 8 * 60 * 60;

/** Tentativas de entrada por origem, e a janela em que contam. */
export const LIMITE_DE_TENTATIVAS = 5;
export const JANELA_DAS_TENTATIVAS_S = 15 * 60;

export interface Sessao {
  /** Quem agiu, para a auditoria. Há um só, mas o registo pede um nome. */
  actor: string;
  /** Instante de expiração, em segundos desde a época. */
  exp: number;
  /** Ruído, para duas sessões seguidas não terem o mesmo valor. */
  jti: string;
}

/** Constrói o valor do cookie: `corpo.assinatura`, ambos em base64url. */
export async function criarSessao(
  actor: string,
  segredo: string,
  agora = Date.now(),
): Promise<string> {
  const sessao: Sessao = {
    actor,
    exp: Math.floor(agora / 1000) + VALIDADE_DA_SESSAO_S,
    jti: base64url(crypto.getRandomValues(new Uint8Array(9))),
  };
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(sessao)));
  return `${corpo}.${await assinar(corpo, segredo)}`;
}

/**
 * Lê um token de sessão. Devolve `null` para tudo o que não seja um token
 * válido, dentro do prazo e com a assinatura certa.
 */
export async function lerSessao(
  token: string | undefined,
  segredo: string,
  agora = Date.now(),
): Promise<Sessao | null> {
  if (!token) return null;
  const ponto = token.lastIndexOf('.');
  if (ponto <= 0) return null;

  const corpo = token.slice(0, ponto);
  const assinatura = token.slice(ponto + 1);
  if (!iguaisEmTempoConstante(assinatura, await assinar(corpo, segredo))) return null;

  try {
    const sessao = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as Sessao;
    if (typeof sessao.exp !== 'number' || sessao.exp * 1000 < agora) return null;
    if (typeof sessao.actor !== 'string' || sessao.actor.length === 0) return null;
    return sessao;
  } catch {
    return null;
  }
}
