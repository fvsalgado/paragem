'use server';

import { createHash, randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { abrirSessao, exigirDono, type Dentro } from './autenticacao';
import { chamar, ehEsquemaPorAplicar } from './base';
import { traduzirErro } from './base-pura';
import { CAMINHO_DA_ATIVACAO } from './guarda';
import { hashDoIp } from './ip';
import { ehPapel, inicioDe, type Papel } from './papeis';
import { papeisDe } from './pessoas';
import { COMPRIMENTO_MINIMO, codificarSenha } from './senha';
import { listarRegioes } from './consultas';

/**
 * As ações das pessoas do painel — só do dono, menos uma: a ativação, que é
 * da própria pessoa e se faz com a ligação que o dono lhe mandou.
 *
 * NÃO SAI CORREIO NENHUM DAQUI. O painel gera a ligação de ativação e mostra-a
 * UMA VEZ, a quem a gerou, com um botão de copiar; quem a envia é o dono, pelo
 * meio que usar com aquela pessoa. Um painel que mandasse correio precisava de
 * um serviço de envio, de um remetente verificado e de explicar porque é que a
 * mensagem foi parar ao lixo — e a ligação ia na mesma por um canal que não é
 * nosso.
 *
 * A LIGAÇÃO NÃO VAI NA BARRA DE ENDEREÇOS de quem a gera, como os avisos das
 * outras ações: ficava no histórico do navegador e nos registos do servidor.
 * Volta como estado do formulário (`useActionState`), e some-se na navegação
 * seguinte — é isso que «mostrar uma vez» quer dizer.
 */

export type EstadoDaLigacao =
  | null
  | { ok: true; nome: string; email: string; ligacao: string; ate: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

async function rasto(dentro: Dentro): Promise<{ p_actor: string; p_ip_hash: string }> {
  return { p_actor: dentro.actor, p_ip_hash: hashDoIp(await headers()) };
}

function mensagemDe(erro: unknown): string {
  if (ehEsquemaPorAplicar(erro)) {
    return 'a base ainda não tem as contas por pessoa — falta aplicar a migração 0009';
  }
  return traduzirErro(erro);
}

/** O endereço deste painel, tal como quem está a usá-lo o vê. */
async function origem(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
  const esquema =
    h.get('x-forwarded-proto') ?? (process.env.PARAGEM_ESQUEMA === 'http' ? 'http' : 'https');
  return `${esquema.split(',')[0]?.trim() || 'https'}://${host}`;
}

/**
 * Uma ligação nova para esta pessoa: 32 bytes ao acaso, em base64url. A base
 * guarda só o sha256 — quem roubasse a tabela não ficava com ligação nenhuma.
 */
async function novaLigacao(
  pessoa: string,
  dentro: Dentro,
): Promise<{ ligacao: string; ate: string }> {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  const ate = await chamar<string>('create_convite', {
    p_pessoa: pessoa,
    p_token_hash: hash,
    ...(await rasto(dentro)),
  });
  return { ligacao: `${await origem()}${CAMINHO_DA_ATIVACAO}?t=${token}`, ate };
}

/** Os papéis do formulário: um `<select name="papel:<região>">` por região. */
function papeisDoFormulario(formData: FormData): Record<string, Papel | null> {
  const papeis: Record<string, Papel | null> = {};
  for (const [campo, valor] of formData.entries()) {
    if (!campo.startsWith('papel:') || typeof valor !== 'string') continue;
    papeis[campo.slice('papel:'.length)] = ehPapel(valor) ? valor : null;
  }
  return papeis;
}

/**
 * Convidar uma pessoa: criá-la, dar-lhe os papéis e gerar a primeira ligação.
 * Três funções da base, três linhas na auditoria — cada gesto com o seu nome.
 */
export async function convidarPessoa(
  _antes: EstadoDaLigacao,
  formData: FormData,
): Promise<EstadoDaLigacao> {
  const nome = texto(formData, 'nome');
  const email = texto(formData, 'email').toLowerCase();
  const papeis = papeisDoFormulario(formData);
  const campos = {
    nome,
    email,
    ...Object.fromEntries(Object.entries(papeis).map(([r, p]) => [`papel:${r}`, p ?? ''])),
  };
  try {
    const dentro = await exigirDono();
    const regioes = new Set((await listarRegioes()).map((r) => r.id));
    const comPapel = Object.entries(papeis).filter(
      (x): x is [string, Papel] => x[1] !== null && regioes.has(x[0]),
    );
    if (comPapel.length === 0) {
      return {
        ok: false,
        erro: 'Escolhe pelo menos uma região e o papel nela — sem papel, a pessoa entrava e não via nada.',
        campos,
      };
    }
    const id = await chamar<string>('create_pessoa', {
      p_email: email,
      p_nome: nome,
      ...(await rasto(dentro)),
    });
    for (const [regiao, papel] of comPapel) {
      await chamar<boolean>('set_papel', {
        p_pessoa: id,
        p_region: regiao,
        p_papel: papel,
        ...(await rasto(dentro)),
      });
    }
    const { ligacao, ate } = await novaLigacao(id, dentro);
    return { ok: true, nome, email, ligacao, ate };
  } catch (erro) {
    return { ok: false, erro: `Não foi possível: ${mensagemDe(erro)}`, campos };
  }
}

/** Uma ligação nova para quem já existe: a primeira perdeu-se, ou esqueceu-se da palavra-passe. */
export async function gerarLigacao(
  _antes: EstadoDaLigacao,
  formData: FormData,
): Promise<EstadoDaLigacao> {
  const pessoa = texto(formData, 'pessoa');
  try {
    const dentro = await exigirDono();
    const { ligacao, ate } = await novaLigacao(pessoa, dentro);
    return {
      ok: true,
      nome: texto(formData, 'nome'),
      email: texto(formData, 'email'),
      ligacao,
      ate,
    };
  } catch (erro) {
    return { ok: false, erro: `Não foi possível: ${mensagemDe(erro)}` };
  }
}

function comAviso(aviso: string, ancora?: string): string {
  return `/admin/pessoas/?aviso=${encodeURIComponent(aviso)}${ancora ? `#${ancora}` : ''}`;
}

/** Os papéis de uma pessoa, região a região — só o que mudou chega à base. */
export async function mudarPapeis(formData: FormData): Promise<void> {
  const pessoa = texto(formData, 'pessoa');
  const nome = texto(formData, 'nome');
  let destino: string;
  try {
    const dentro = await exigirDono();
    const regioes = new Set((await listarRegioes()).map((r) => r.id));
    const antes = await papeisDe(pessoa);
    let mudaram = 0;
    for (const [regiao, papel] of Object.entries(papeisDoFormulario(formData))) {
      if (!regioes.has(regiao) || (antes[regiao] ?? null) === papel) continue;
      if (
        await chamar<boolean>('set_papel', {
          p_pessoa: pessoa,
          p_region: regiao,
          p_papel: papel,
          ...(await rasto(dentro)),
        })
      ) {
        mudaram += 1;
      }
    }
    destino = comAviso(
      mudaram === 0
        ? 'Os papéis já eram esses; nada mudou.'
        : `Papéis de ${nome} mudados. Fazem efeito no próximo clique dela.`,
      `pessoa-${pessoa}`,
    );
  } catch (erro) {
    destino = comAviso(`Não foi possível: ${mensagemDe(erro)}`, `pessoa-${pessoa}`);
  }
  redirect(destino);
}

/** Desativar e reativar. Desativar não apaga: o nome dela fica em cada linha da auditoria. */
export async function ativarOuDesativarPessoa(formData: FormData): Promise<void> {
  const pessoa = texto(formData, 'pessoa');
  const nome = texto(formData, 'nome');
  const ativa = texto(formData, 'ativa') === '1';
  let destino: string;
  try {
    const dentro = await exigirDono();
    const mudou = await chamar<boolean>('set_pessoa_ativa', {
      p_pessoa: pessoa,
      p_ativa: ativa,
      ...(await rasto(dentro)),
    });
    destino = comAviso(
      !mudou
        ? 'Já estava assim; nada mudou.'
        : ativa
          ? `${nome} volta a poder entrar. Se não se lembrar da palavra-passe, gera-lhe uma ligação nova.`
          : `${nome} deixou de poder entrar — já no próximo clique. A auditoria guarda o que fez.`,
      `pessoa-${pessoa}`,
    );
  } catch (erro) {
    destino = comAviso(`Não foi possível: ${mensagemDe(erro)}`, `pessoa-${pessoa}`);
  }
  redirect(destino);
}

/**
 * A pessoa abre a ligação e escolhe a palavra-passe — sem sessão de ninguém.
 *
 * O token chega em claro (veio na ligação) e vai à base reduzido ao sha256; a
 * palavra-passe vai reduzida ao hash scrypt, como a do dono. A base gasta a
 * ligação e regista a ativação em nome da própria pessoa. Feito isto, entra:
 * acabou de provar quem é.
 */
export async function ativarConta(formData: FormData): Promise<void> {
  const token = texto(formData, 't');
  const senha = String(formData.get('senha') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');
  const deVolta = (erro: string) =>
    `${CAMINHO_DA_ATIVACAO}?${new URLSearchParams({ t: token, erro })}`;

  if (senha.length < COMPRIMENTO_MINIMO) redirect(deVolta('curta'));
  if (senha !== confirmacao) redirect(deVolta('diferentes'));

  let destino: string;
  try {
    const hash = codificarSenha(senha);
    const linhas = await chamar<{ id: string; nome: string; email: string }[]>(
      'ativar_com_convite',
      {
        p_token_hash: createHash('sha256').update(token).digest('hex'),
        p_senha_hash: hash,
        p_ip_hash: hashDoIp(await headers()),
      },
    );
    const pessoa = linhas[0];
    if (!pessoa) throw new Error('esta ligação não é válida');
    const actor = `${pessoa.nome} · ${pessoa.email}`;
    await abrirSessao({ sub: pessoa.id, actor, senhaHash: hash });
    // Escolher a palavra-passe é também a primeira entrada — e a lista das
    // pessoas dizia «ainda não entrou» a quem já estava lá dentro.
    await chamar('registar_acesso', {
      p_pessoa: pessoa.id,
      p_actor: actor,
      p_ip_hash: hashDoIp(await headers()),
    }).catch((erro: unknown) => console.error('registar_acesso', erro));
    destino = inicioDe({ dono: false, papeis: await papeisDe(pessoa.id) });
  } catch (erro) {
    destino = `${CAMINHO_DA_ATIVACAO}?${new URLSearchParams({ t: token, erro: 'base', mensagem: mensagemDe(erro) })}`;
  }
  redirect(destino);
}
