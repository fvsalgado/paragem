'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { etiquetaDosAvisos } from '../avisos';
import {
  ETIQUETA_DAS_REGIOES,
  IDENTIFICADOR,
  etiquetaDaRegiao,
  linhas as linhasNoArmazem,
  regiao as regiaoNoArmazem,
} from '../dados';
import { doCampoLocal } from '../fuso';
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

// --- avisos ----------------------------------------------------------------

/** A página dos avisos de uma região. */
function osAvisos(regiao: string): string {
  return `/admin/regioes/${encodeURIComponent(regiao)}/avisos/`;
}

/** As linhas e as paragens entram separadas por vírgula. */
function lista(formData: FormData, campo: string): string[] {
  return texto(formData, campo)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Os modos entram em caixas — várias com o mesmo nome. */
function marcados(formData: FormData, campo: string): string[] {
  return formData
    .getAll(campo)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
}

/**
 * UM AVISO É SOBRE O QUE ESTA AUTORIDADE GERE. Mais nada.
 *
 * O formulário já só oferece os modos próprios, mas o formulário é uma
 * cortesia: uma ação de servidor recebe o que lhe mandarem. Isto é a regra,
 * e está aqui porque é aqui que não se contorna.
 *
 * Um modo alimentado só por feeds de outra entidade aparece no sítio — quem
 * viaja não tem de saber quem gere o quê —, mas um aviso nosso sobre o
 * serviço dela é redistribuir informação que ela publica nos canais dela,
 * por que responde, e que pode desmentir uma hora depois sem nos dizer. É a
 * mesma regra que tira os feeds de terceiros das descargas.
 *
 * Sem dados da região no armazém não se sabe o que ela declara, e aí não se
 * valida: recusar tudo bloqueava o primeiro aviso de uma região nova, que é
 * precisamente quando isto é mais preciso.
 */
async function exigirModosProprios(id: string, modos: string[]): Promise<void> {
  if (modos.length === 0) return;
  const ficha = await regiaoNoArmazem(id).catch(() => null);
  if (!ficha) return;
  const deTerceiros = ficha.modos_de_terceiros ?? [];
  const alheios = modos.filter((m) => deTerceiros.includes(m));
  if (alheios.length) {
    throw new Error(
      `${alheios.join(', ')} ${alheios.length === 1 ? 'é um modo' : 'são modos'} que esta região mostra e não gere. ` +
        'Quem gere o serviço é quem avisa sobre ele.',
    );
  }
  const desconhecidos = modos.filter((m) => !ficha.modos.includes(m));
  if (desconhecidos.length) {
    throw new Error(`esta região não declara ${desconhecidos.join(', ')}`);
  }
}

/**
 * A mesma regra ao nível da linha, e uma segunda que não é sobre direitos mas
 * sobre servir: uma linha que não existe.
 *
 * Um aviso preso a um identificador com uma gralha não aparece em lado nenhum
 * — nem na página da linha, nem para quem consome o feed — e ninguém dá por
 * isso, porque o aviso ESTÁ publicado e a lista do painel mostra-o. É a falha
 * mais silenciosa que esta página tem.
 *
 * As linhas de outro operador saem pela mesma razão que os modos deles: o
 * catálogo marca-as com `operador`, que a rede da casa não leva.
 *
 * Sem catálogo — módulo desligado, ou região sem dados — não se valida.
 */
async function exigirLinhasProprias(id: string, linhas: string[]): Promise<void> {
  if (linhas.length === 0) return;
  const catalogo = await linhasNoArmazem(id).catch(() => []);
  if (catalogo.length === 0) return;
  const porId = new Map(catalogo.map((l) => [l.id, l]));
  const inexistentes = linhas.filter((x) => !porId.has(x));
  if (inexistentes.length) {
    throw new Error(
      `não há linha com o identificador ${inexistentes.join(', ')} — um aviso preso a um identificador errado não aparece a ninguém`,
    );
  }
  const alheias = linhas.filter((x) => (porId.get(x)?.operador ?? '') !== '');
  if (alheias.length) {
    const nomes = [...new Set(alheias.map((x) => porId.get(x)?.operador))].join(', ');
    throw new Error(
      `${alheias.join(', ')} ${alheias.length === 1 ? 'é de' : 'são de'} ${nomes}, que esta região mostra e não gere. ` +
        'Quem gere o serviço é quem avisa sobre ele.',
    );
  }
}

/**
 * Gravar um aviso — novo ou editado. NÃO O PUBLICA: é outro gesto, e é
 * deliberado. Quem redige a meio de uma ocorrência não devia ter de escolher
 * entre gravar a meio e mostrar a meio.
 */
export async function guardarAviso(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const id = texto(formData, 'id');
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const modos = marcados(formData, 'modos');
      const linhas = lista(formData, 'linhas');
      await exigirModosProprios(regiao, modos);
      await exigirLinhasProprias(regiao, linhas);
      const novo = await chamar<string>('upsert_aviso', {
        p_id: id || null,
        p_region_id: regiao,
        p_titulo: texto(formData, 'titulo'),
        p_texto: texto(formData, 'texto'),
        p_gravidade: texto(formData, 'gravidade'),
        p_causa: texto(formData, 'causa'),
        p_efeito: texto(formData, 'efeito'),
        p_inicio: doCampoLocal(texto(formData, 'inicio')),
        p_fim: doCampoLocal(texto(formData, 'fim')),
        p_linhas: linhas,
        p_paragens: lista(formData, 'paragens'),
        p_modos: modos,
        p_url: texto(formData, 'url') || null,
        ...(await rasto()),
      });
      // Um aviso EDITADO que já esteja publicado muda no sítio agora; um
      // rascunho não muda nada, e invalidar a etiqueta à mesma não custa.
      revalidateTag(etiquetaDosAvisos(regiao));
      return comAviso(
        osAvisos(regiao),
        id
          ? 'Aviso gravado.'
          : 'Aviso gravado, por publicar. Enquanto não o publicares, não está no sítio nem no feed.',
        `aviso-${novo}`,
      );
    },
    (mensagem) => comAviso(osAvisos(regiao), `Não foi possível: ${mensagem}`),
  );
}

/** Publicar ou retirar — o gesto que muda o que está no ar. */
export async function publicarAviso(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const id = texto(formData, 'id');
  const publicar = texto(formData, 'publicar') === '1';
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      await chamar<null>('set_aviso_publicado', {
        p_id: id,
        p_publicado: publicar,
        ...(await rasto()),
      });
      revalidateTag(etiquetaDosAvisos(regiao));
      return comAviso(
        osAvisos(regiao),
        publicar
          ? 'Aviso publicado. Está no sítio e no feed GTFS-RT.'
          : 'Aviso retirado. Sai do sítio e do feed; o rasto fica.',
        `aviso-${id}`,
      );
    },
    (mensagem) => comAviso(osAvisos(regiao), `Não foi possível: ${mensagem}`),
  );
}

/**
 * Apagar, que NÃO é o mesmo que retirar. Retirar é «isto deixou de ser
 * verdade»; apagar é «isto nunca devia ter sido escrito». A base guarda o
 * aviso inteiro no rasto, para que apagar não seja esquecer.
 */
export async function apagarAviso(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const id = texto(formData, 'id');
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      await chamar<null>('delete_aviso', { p_id: id, ...(await rasto()) });
      revalidateTag(etiquetaDosAvisos(regiao));
      return comAviso(osAvisos(regiao), 'Aviso apagado. Fica na auditoria, inteiro.');
    },
    (mensagem) => comAviso(osAvisos(regiao), `Não foi possível: ${mensagem}`),
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
