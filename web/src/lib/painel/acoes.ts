'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ETIQUETA_DAS_REGIOES, IDENTIFICADOR, etiquetaDaRegiao } from '../dados';
import { abrirSessao, exigirSessao, fecharSessao, painelConfigurado } from './autenticacao';
import { chamar } from './base';
import { CAMINHO_DA_ENTRADA, destinoSeguro } from './guarda';
import { hashDoIp } from './ip';
import { verificarLimite } from './limite';
import { listarRegioes } from './consultas';
import { ehModulo } from './modulos';
import { verificarSenha } from './senha';
import { JANELA_DAS_TENTATIVAS_S, LIMITE_DE_TENTATIVAS } from './sessao';

/**
 * As ações do painel.
 *
 * Nenhuma escreve numa tabela: todas chamam a função SQL que é o único
 * caminho de escrita e a que deixa a linha em `admin_actions`
 * (`docs/BASE-DE-DADOS.md`). Cada uma volta a exigir a sessão do seu lado —
 * a terceira barreira, depois do middleware e do layout —, e cada uma acaba
 * num `redirect` com o aviso na barra de endereços: o que a base disse, em
 * português, para quem carregou no botão.
 *
 * O `redirect` do Next é uma exceção, e por isso nunca está dentro de um
 * `try`: o destino calcula-se primeiro, com a falha apanhada, e só depois se
 * salta para lá.
 */

const ACTOR = 'gestor';

function ficha(regiao: string): string {
  return `/admin/regioes/${encodeURIComponent(regiao)}/`;
}

/** O aviso vai na barra de endereços, e a âncora leva à secção onde se mexeu. */
function comAviso(caminho: string, aviso: string, ancora?: string): string {
  const separador = caminho.includes('?') ? '&' : '?';
  return `${caminho}${separador}aviso=${encodeURIComponent(aviso)}${ancora ? `#${ancora}` : ''}`;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Calcula o destino — apanhando o que a base recusar — e salta para lá. */
async function seguir(
  calcular: () => Promise<string>,
  emErro: (mensagem: string) => string,
): Promise<never> {
  let destino: string;
  try {
    destino = await calcular();
  } catch (erro) {
    destino = emErro(mensagemDe(erro));
  }
  redirect(destino);
}

async function rasto(): Promise<{ p_actor: string; p_ip_hash: string }> {
  const actor = await exigirSessao();
  return { p_actor: actor, p_ip_hash: hashDoIp(await headers()) };
}

function exigirRegiaoValida(id: string): string {
  if (!IDENTIFICADOR.test(id)) throw new Error('identificador de região inválido');
  return id;
}

// --- entrar e sair ---------------------------------------------------------

export async function entrar(formData: FormData): Promise<void> {
  const destino = destinoSeguro(texto(formData, 'destino'));
  const senha = String(formData.get('senha') ?? '');

  if (!painelConfigurado()) redirect(`${CAMINHO_DA_ENTRADA}?erro=configuracao`);

  // O limite é por origem e a janela é curta: chega para travar quem tenta
  // às cegas sem trancar quem se enganou a escrever.
  const limite = await verificarLimite(
    `admin-entrar:${hashDoIp(await headers())}`,
    JANELA_DAS_TENTATIVAS_S,
    LIMITE_DE_TENTATIVAS,
  );
  if (!limite.permitido) redirect(`${CAMINHO_DA_ENTRADA}?erro=demasiadas`);

  if (!verificarSenha(senha, process.env.ADMIN_PASSWORD_HASH ?? '')) {
    redirect(`${CAMINHO_DA_ENTRADA}?erro=credenciais`);
  }

  await abrirSessao(ACTOR);
  redirect(destino);
}

export async function sair(): Promise<void> {
  await fecharSessao();
  redirect(CAMINHO_DA_ENTRADA);
}

// --- regiões ---------------------------------------------------------------

export async function ligarOuDesligarRegiao(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const ligar = texto(formData, 'ligar') === '1';
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const mudou = await chamar<boolean>('set_region_enabled', {
        p_region: regiao,
        p_enabled: ligar,
        ...(await rasto()),
      });
      // A lista das regiões ligadas e o mapa de domínios levam esta etiqueta:
      // a montra e as páginas sabem-no à próxima visita; o middleware, com a
      // memória de módulo dele, em cinco minutos.
      revalidateTag(ETIQUETA_DAS_REGIOES);
      revalidateTag(etiquetaDaRegiao(regiao));
      return comAviso(
        ficha(regiao),
        mudou
          ? ligar
            ? 'Região ligada. O domínio dela responde daqui a cinco minutos, no máximo.'
            : 'Região desligada. O domínio dela passa a mostrar a montra daqui a cinco minutos, no máximo.'
          : 'Já estava assim; nada mudou.',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`),
  );
}

export async function criarRegiao(formData: FormData): Promise<void> {
  const campos = {
    id: texto(formData, 'id'),
    nome: texto(formData, 'nome'),
    artigo: texto(formData, 'artigo'),
    dominio: texto(formData, 'dominio'),
    ordem: texto(formData, 'ordem'),
  };
  const deVolta = new URLSearchParams(campos).toString();
  await seguir(
    async () => {
      const id = await chamar<string>('create_region', {
        p_id: campos.id,
        p_name: campos.nome,
        p_article: campos.artigo,
        p_domain: campos.dominio,
        p_sort_order: Number(campos.ordem || '0') || 0,
        ...(await rasto()),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(id),
        `Região «${campos.nome}» criada, desligada. Quando os dados dela estiverem no armazém, liga-se aqui; o domínio entra no projeto da plataforma pelo guia docs/NOVA-REGIAO.md.`,
      );
    },
    (mensagem) => comAviso(`/admin/regioes/nova/?${deVolta}`, `Não foi possível: ${mensagem}`),
  );
}

export async function mudarDominio(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const dominio = texto(formData, 'dominio');
  const manterAlias = texto(formData, 'manter_alias') === '1';
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const mudou = await chamar<boolean>('set_region_domain', {
        p_region: regiao,
        p_domain: dominio,
        p_keep_alias: manterAlias,
        ...(await rasto()),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(regiao),
        mudou
          ? `Domínio mudado para ${dominio.toLowerCase()}.${manterAlias ? ' O antigo fica a redirecionar.' : ''} Falta o domínio no projeto da plataforma e no regiao.yaml — o CI confere.`
          : 'Já era esse o domínio; nada mudou.',
        'dominio',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'dominio'),
  );
}

export async function acrescentarAlias(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const dominio = texto(formData, 'dominio');
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const mudou = await chamar<boolean>('add_region_alias', {
        p_domain: dominio,
        p_region: regiao,
        ...(await rasto()),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(regiao),
        mudou
          ? `${dominio.toLowerCase()} passa a redirecionar para o canónico daqui a cinco minutos, no máximo — depois de entrar no projeto da plataforma.`
          : 'Já era alias desta região; nada mudou.',
        'dominio',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'dominio'),
  );
}

export async function retirarAlias(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const dominio = texto(formData, 'dominio');
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const mudou = await chamar<boolean>('remove_region_alias', {
        p_domain: dominio,
        ...(await rasto()),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(regiao),
        mudou
          ? `${dominio.toLowerCase()} deixa de redirecionar.`
          : 'Não havia esse alias; nada mudou.',
        'dominio',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'dominio'),
  );
}

// --- módulos ---------------------------------------------------------------

export async function alternarModulo(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const modulo = texto(formData, 'modulo');
  const ligar = texto(formData, 'ligar') === '1';
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      if (!ehModulo(modulo)) throw new Error(`não há módulo com o identificador ${modulo}`);
      const mudou = await chamar<boolean>('set_modulo', {
        p_region: regiao,
        p_id: modulo,
        p_enabled: ligar,
        ...(await rasto()),
      });
      // As páginas da região leem os módulos com a etiqueta dela.
      revalidateTag(etiquetaDaRegiao(regiao));
      return comAviso(
        ficha(regiao),
        mudou
          ? `Módulo «${modulo}» ${ligar ? 'ligado' : 'desligado'}.`
          : 'Já estava assim; nada mudou.',
        'modulos',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'modulos'),
  );
}

// --- licenças --------------------------------------------------------------

export async function registarLicenca(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const inicio = texto(formData, 'inicio');
      const fim = texto(formData, 'fim');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio))
        throw new Error('a licença precisa da data de início');
      if (fim && !/^\d{4}-\d{2}-\d{2}$/.test(fim)) throw new Error('a data de fim não se lê');
      await chamar<string>('add_region_license', {
        p_region_id: regiao,
        p_starts_on: inicio,
        p_ends_on: fim || null,
        p_kind: texto(formData, 'tipo'),
        p_notes: texto(formData, 'notas') || null,
        ...(await rasto()),
      });
      return comAviso(ficha(regiao), 'Licença registada.', 'licencas');
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'licencas'),
  );
}

// --- o sítio ---------------------------------------------------------------

/**
 * O mesmo sinal que o pipeline manda no fim de publicar (`/api/revalidate`),
 * à mão: a lista das regiões e as páginas de todas. Para o dia em que o aviso
 * do pipeline se perdeu e o sítio está a mostrar dados de ontem.
 */
export async function revalidarSitio(): Promise<void> {
  await seguir(
    async () => {
      await exigirSessao();
      const regioes = await listarRegioes();
      revalidateTag(ETIQUETA_DAS_REGIOES);
      for (const r of regioes) revalidateTag(etiquetaDaRegiao(r.id));
      return comAviso(
        '/admin/',
        `Sítio revalidado: a lista das regiões e as páginas de ${regioes.length} ${regioes.length === 1 ? 'região' : 'regiões'} rendem-se de novo à próxima visita.`,
      );
    },
    (mensagem) => comAviso('/admin/', `Não foi possível: ${mensagem}`),
  );
}
