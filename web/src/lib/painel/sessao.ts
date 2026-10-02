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
 * QUEM AGE É UMA PESSOA, E NÃO UM PAPEL (0009). O corpo leva `sub` — o
 * identificador da pessoa, ou `dono` — e o nome com o email para o rasto. Os
 * papéis NÃO vão no cookie: leem-se da base em cada pedido (`autenticacao.ts`),
 * para que tirar um papel ou desativar uma pessoa tenha efeito no clique
 * seguinte, e não oito horas depois.
 *
 * E LEVA A IMPRESSÃO DA PALAVRA-PASSE (`v`), que é o que faz uma palavra-passe
 * nova expulsar quem estava dentro com a antiga. Não vai na chave da
 * assinatura, de propósito: o middleware, que é a primeira barreira, corre no
 * edge sem base — consegue conferir o segredo, e não consegue saber o hash de
 * uma pessoa. A assinatura fica só com o segredo, que ele confere; a
 * impressão confere-se no servidor, contra a base (ou contra o ambiente, no
 * caso do dono), em cada pedido. É um HMAC do hash com o segredo: sem o
 * segredo não se calcula, e do cookie não se tira nada da palavra-passe.
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

/** Tentativas FALHADAS de entrada, por origem e por email, e a janela em que contam. */
export const LIMITE_DE_TENTATIVAS = 5;
export const JANELA_DAS_TENTATIVAS_S = 15 * 60;

/** O `sub` de quem tem a palavra-passe do ambiente. */
export const DONO = 'dono';

export interface Sessao {
  /** O identificador da pessoa, ou `dono`. */
  sub: string;
  /** «Nome · email», para a auditoria — e só para ela: quem age lê-se da base. */
  actor: string;
  /** A impressão da palavra-passe em vigor quando se entrou (`impressaoDaSenha`). */
  v: string;
  /** Instante de expiração, em segundos desde a época. */
  exp: number;
  /** Ruído, para duas sessões seguidas não terem o mesmo valor. */
  jti: string;
}

/**
 * A impressão de um hash de palavra-passe: 22 caracteres de um HMAC com o
 * segredo de sessão. Muda quando o hash muda — e o hash muda sempre que se
 * escolhe uma palavra-passe, mesmo a mesma, porque o sal é novo.
 */
export async function impressaoDaSenha(senhaHash: string, segredo: string): Promise<string> {
  return (await assinar(`senha\n${senhaHash}`, segredo)).slice(0, 22);
}

/** Constrói o valor do cookie: `corpo.assinatura`, ambos em base64url. */
export async function criarSessao(
  quem: { sub: string; actor: string; v: string },
  segredo: string,
  agora = Date.now(),
): Promise<string> {
  const sessao: Sessao = {
    sub: quem.sub,
    actor: quem.actor,
    v: quem.v,
    exp: Math.floor(agora / 1000) + VALIDADE_DA_SESSAO_S,
    jti: base64url(crypto.getRandomValues(new Uint8Array(9))),
  };
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(sessao)));
  return `${corpo}.${await assinar(corpo, segredo)}`;
}

const texto = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/**
 * Lê um token de sessão. Devolve `null` para tudo o que não seja um token
 * válido, dentro do prazo e com a assinatura certa.
 *
 * Um token de antes das contas — sem `sub` nem `v` — também é `null`: o dono
 * volta a entrar uma vez, com a mesma palavra-passe, e fica com um dos novos.
 * Aceitá-lo era ter de explicar, durante oito horas, uma sessão que não diz
 * de quem é.
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
    if (!texto(sessao.actor) || !texto(sessao.sub) || !texto(sessao.v)) return null;
    return sessao;
  } catch {
    return null;
  }
}
