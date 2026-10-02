import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { temChaveDeServico } from './base';
import { CAMINHO_DA_ENTRADA } from './guarda';
import { pode, type Acesso, type Papel } from './papeis';
import { actorDe, papeisDe, pessoaPorId, type Pessoa } from './pessoas';
import {
  COOKIE_DA_SESSAO,
  DONO,
  VALIDADE_DA_SESSAO_S,
  criarSessao,
  impressaoDaSenha,
  lerSessao,
} from './sessao';
import { iguaisEmTempoConstante } from './token-assinado';

/**
 * A ligação da sessão ao pedido em curso — e QUEM está dentro.
 *
 * A lógica do token — a assinatura, o prazo — vive em `sessao.ts`, sem nada
 * do Next, para poder ser testada sem um servidor. Aqui fica o que precisa de
 * cookies e de base: a pessoa e os papéis dela leem-se da base EM CADA PEDIDO,
 * sem memória entre pedidos. Desativar uma pessoa, ou tirar-lhe um papel, tem
 * efeito no clique seguinte — e não quando o cookie dela expirar.
 *
 * Levantado do Coreto (`admin/auth.ts`).
 */

export interface Dentro extends Acesso {
  ok: true;
  /** `dono`, ou o identificador da pessoa. */
  sub: string;
  /** `null` para o dono, que não é uma linha da base. */
  pessoa: Pessoa | null;
  /** «Nome · email»: o que a auditoria escreve. */
  actor: string;
}

export type Portao = Dentro | { ok: false; razao: 'por-configurar' | 'sem-sessao' };

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

/**
 * O email do dono, quando está declarado (`ADMIN_EMAIL`). Sem ele, o dono
 * entra com qualquer email e a palavra-passe dele — como entrava antes das
 * contas, quando não havia email nenhum. A segurança é a mesma de então: o
 * segredo é a palavra-passe. Declará-lo é o que tira o dono do caminho de
 * quem escreve outro email (`docs/PAINEL.md`).
 */
export function emailDoDono(): string | null {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  return email || null;
}

/** «dono», ou «dono · email» quando o email está declarado. */
export function actorDoDono(): string {
  const email = emailDoDono();
  return email ? `${DONO} · ${email}` : DONO;
}

const SEM_SESSAO = { ok: false, razao: 'sem-sessao' } as const;

/**
 * O estado de sessão do pedido em curso. Uma vez por pedido (`cache`): o
 * layout, a página e a ação perguntam todos, e é uma ida à base e não três.
 */
export const sessaoAtual = cache(async (): Promise<Portao> => {
  const segredo = segredoDaSessao();
  if (!painelConfigurado() || !segredo) return { ok: false, razao: 'por-configurar' };
  const jarra = await cookies();
  const sessao = await lerSessao(jarra.get(COOKIE_DA_SESSAO)?.value, segredo);
  if (!sessao) return SEM_SESSAO;

  if (sessao.sub === DONO) {
    // A impressão da palavra-passe do ambiente: trocar o `ADMIN_PASSWORD_HASH`
    // expulsa as sessões do dono que estavam abertas — que é o que quem troca
    // uma palavra-passe por precaução espera que aconteça.
    const v = await impressaoDaSenha(process.env.ADMIN_PASSWORD_HASH ?? '', segredo);
    if (!iguaisEmTempoConstante(v, sessao.v)) return SEM_SESSAO;
    return {
      ok: true,
      dono: true,
      papeis: {},
      sub: DONO,
      pessoa: null,
      actor: actorDoDono(),
    };
  }

  // Uma pessoa só se confere com a base: sem ela, não há quem confirme que
  // ainda existe, que está ativa e que a palavra-passe é a mesma.
  if (!temChaveDeServico()) return SEM_SESSAO;
  const pessoa = await pessoaPorId(sessao.sub);
  if (!pessoa || pessoa.desativada_em || !pessoa.senha_hash) return SEM_SESSAO;
  const v = await impressaoDaSenha(pessoa.senha_hash, segredo);
  if (!iguaisEmTempoConstante(v, sessao.v)) return SEM_SESSAO;
  return {
    ok: true,
    dono: false,
    papeis: await papeisDe(pessoa.id),
    sub: pessoa.id,
    pessoa,
    actor: actorDe(pessoa),
  };
});

/** O erro de quem não pode — a mesma frase em todas as ações. */
export class SemPermissao extends Error {
  constructor(mensagem = 'não tens permissão para isto') {
    super(mensagem);
    this.name = 'SemPermissao';
  }
}

/**
 * Quem está dentro, ou uma exceção. É a terceira barreira: cada ação volta a
 * pedir a sessão do seu lado, e o nome que devolve é o que vai para a
 * auditoria.
 */
export async function exigirSessao(): Promise<Dentro> {
  const portao = await sessaoAtual();
  if (!portao.ok) throw new SemPermissao('a sessão do painel acabou; entra outra vez');
  return portao;
}

/** Só o dono: regiões, domínios, licenças, pessoas. */
export async function exigirDono(): Promise<Dentro> {
  const dentro = await exigirSessao();
  if (!dentro.dono) throw new SemPermissao('isto é só para o dono do produto');
  return dentro;
}

/**
 * Pelo menos este papel nesta região. A ação volta a perguntar ANTES de
 * escrever, mesmo que a página só lhe tenha mostrado o botão a quem podia:
 * uma ação de servidor recebe o que lhe mandarem.
 */
export async function exigirPapel(regiao: string, minimo: Papel): Promise<Dentro> {
  const dentro = await exigirSessao();
  if (!pode(dentro, regiao, minimo)) {
    throw new SemPermissao('não tens permissão para isto nesta região');
  }
  return dentro;
}

/**
 * Para as PÁGINAS: quem está dentro, ou a entrada. O layout já barrou — mas
 * o Next rende o layout e a página ao mesmo tempo, e uma página que lê dados
 * não fica à espera de saber se o layout a deixou.
 */
export async function dentroDaPagina(): Promise<Dentro> {
  const portao = await sessaoAtual();
  if (!portao.ok) redirect(CAMINHO_DA_ENTRADA);
  return portao;
}

/**
 * Uma página de uma região, para quem tem pelo menos este papel nela. Para
 * quem não tem, a página NÃO EXISTE — 404, e não «sem permissão»: uma pessoa
 * de uma autoridade de transportes nem fica a saber que identificadores têm
 * as regiões dos outros clientes.
 */
export async function paginaDaRegiao(regiao: string, minimo: Papel): Promise<Dentro> {
  const dentro = await dentroDaPagina();
  if (!pode(dentro, regiao, minimo)) notFound();
  return dentro;
}

/** Uma página só do dono — as pessoas, uma região nova. Para os outros, não existe. */
export async function paginaDoDono(): Promise<Dentro> {
  const dentro = await dentroDaPagina();
  if (!dentro.dono) notFound();
  return dentro;
}

export async function abrirSessao(quem: {
  sub: string;
  actor: string;
  senhaHash: string;
}): Promise<void> {
  const segredo = segredoDaSessao();
  if (!segredo) throw new Error('ADMIN_SESSION_SECRET em falta ou curto de mais');
  const jarra = await cookies();
  const v = await impressaoDaSenha(quem.senhaHash, segredo);
  jarra.set(COOKIE_DA_SESSAO, await criarSessao({ sub: quem.sub, actor: quem.actor, v }, segredo), {
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
