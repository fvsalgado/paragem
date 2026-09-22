import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_DA_SESSAO, VALIDADE_DA_SESSAO_S, criarSessao, lerSessao } from './sessao';

/**
 * A ligação da sessão ao pedido em curso.
 *
 * A lógica — o token, a assinatura, o prazo — vive em `sessao.ts`, sem nada
 * do Next, para poder ser testada sem um servidor. Aqui fica só o que precisa
 * mesmo de cookies. Levantado do Coreto (`admin/auth.ts`).
 */

export type Portao =
  | { ok: true; actor: string }
  | { ok: false; razao: 'por-configurar' | 'sem-sessao' };

/**
 * O segredo, ou nada. Um segredo curto vale o mesmo que nenhum: o middleware
 * lê-o em bruto de `process.env`, e é de propósito que aqui se exige mais —
 * são verificações independentes, e é assim que uma apanha o que a outra
 * deixar passar.
 */
export function segredoDaSessao(): string | null {
  const segredo = process.env.ADMIN_SESSION_SECRET ?? '';
  return segredo.length >= 32 ? segredo : null;
}

/** `true` quando o painel tem configuração suficiente para existir. */
export function painelConfigurado(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH) && segredoDaSessao() !== null;
}

/** O estado de sessão do pedido em curso. */
export async function sessaoAtual(): Promise<Portao> {
  const segredo = segredoDaSessao();
  if (!painelConfigurado() || !segredo) return { ok: false, razao: 'por-configurar' };
  const jarra = await cookies();
  const sessao = await lerSessao(jarra.get(COOKIE_DA_SESSAO)?.value, segredo);
  return sessao ? { ok: true, actor: sessao.actor } : { ok: false, razao: 'sem-sessao' };
}

/**
 * Quem age, ou uma exceção. É a terceira barreira: cada ação volta a pedir a
 * sessão do seu lado, e o nome que devolve é o que vai para a auditoria.
 */
export async function exigirSessao(): Promise<string> {
  const portao = await sessaoAtual();
  if (!portao.ok) throw new Error('sessão do painel em falta');
  return portao.actor;
}

export async function abrirSessao(actor: string): Promise<void> {
  const segredo = segredoDaSessao();
  if (!segredo) throw new Error('ADMIN_SESSION_SECRET em falta ou curto de mais');
  const jarra = await cookies();
  jarra.set(COOKIE_DA_SESSAO, await criarSessao(actor, segredo), {
    httpOnly: true,
    // Nos testes o sítio corre em `http://*.localhost`, e um cookie `Secure`
    // não entra por HTTP. `PARAGEM_ESQUEMA=http` é a mesma variável que já diz
    // ao sítio que as outras origens são `http://` — em produção não existe.
    secure: process.env.PARAGEM_ESQUEMA !== 'http',
    sameSite: 'strict',
    path: '/admin',
    maxAge: VALIDADE_DA_SESSAO_S,
  });
}

export async function fecharSessao(): Promise<void> {
  const jarra = await cookies();
  jarra.delete({ name: COOKIE_DA_SESSAO, path: '/admin' });
}
