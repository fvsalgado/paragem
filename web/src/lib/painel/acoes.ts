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
import {
  SemPermissao,
  abrirSessao,
  exigirDono,
  exigirPapel,
  fecharSessao,
  painelConfigurado,
  type Dentro,
} from './autenticacao';
import { avisoPorId } from './avisos';
import {
  chamar,
  dominioValido,
  ehEsquemaPorAplicar,
  normalizarDominio,
  traduzirErro,
} from './base';
import { conferirCredenciais } from './entrada';
import { CAMINHO_DA_ENTRADA, destinoSeguro } from './guarda';
import { hashDoEmail, hashDoIp } from './ip';
import { contarFalhada, limparDepoisDeEntrar, verificarEntrada } from './limite';
import { listarRegioes, type RegiaoNaBase } from './consultas';
import { confirmacaoBate, naFrase, verificarEndereco } from './ficha';
import { ehModulo, nomeDoModulo } from './modulos';
import { JANELA_DAS_TENTATIVAS_S, LIMITE_DE_TENTATIVAS } from './sessao';

/**
 * As ações do painel.
 *
 * Nenhuma escreve numa tabela: todas chamam a função SQL que é o único
 * caminho de escrita e a que deixa a linha em `admin_actions`
 * (`docs/BASE-DE-DADOS.md`). Cada uma volta a exigir a sessão do seu lado —
 * a terceira barreira, depois do middleware e do layout —, E O PAPEL: o dono
 * para o que é dele (regiões, domínios, licenças), o gestor da região para a
 * ficha dela, o editor para os avisos. A página só mostra o botão a quem pode;
 * a ação pergunta outra vez, porque recebe o que lhe mandarem. Cada uma acaba
 * num `redirect` com o aviso na barra de endereços: o que a base disse, em
 * português, para quem carregou no botão — e o nome de quem o carregou vai
 * para a auditoria.
 *
 * O `redirect` do Next é uma exceção, e por isso nunca está dentro de um
 * `try`: o destino calcula-se primeiro, com a falha apanhada, e só depois se
 * salta para lá.
 */

function ficha(regiao: string): string {
  return `/admin/regioes/${encodeURIComponent(regiao)}/`;
}

/**
 * O aviso vai na barra de endereços — e a SECÇÃO onde se mexeu também (P4-014).
 *
 * A âncora sozinha não chegava: o Next deita-a fora no redirecionamento de uma
 * ação, e cada gesto devolvia ao topo de uma ficha de quatro mil pixéis, com a
 * mensagem longe do interruptor que se acabou de mudar. Com `secao`, a página
 * põe a mensagem DENTRO da secção, e leva lá o ecrã e o foco
 * (`IrParaSecao`). A âncora fica para quem não tem JavaScript, onde o
 * navegador a respeita.
 */
function comAviso(
  caminho: string,
  aviso: string,
  secao?: string,
  extra: Record<string, string> = {},
): string {
  const url = new URL(caminho, 'http://painel');
  url.searchParams.set('aviso', aviso);
  if (secao) url.searchParams.set('secao', secao);
  for (const [chave, valor] of Object.entries(extra)) url.searchParams.set(chave, valor);
  return `${url.pathname}${url.search}${secao ? `#${secao}` : ''}`;
}

function mensagemDe(erro: unknown): string {
  return traduzirErro(erro);
}

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Calcula o destino — apanhando o que a base recusar — e salta para lá.
 *
 * UMA RECUSA POR FALTA DE PAPEL volta ao início de quem tentou, e não à página
 * que a ação pedia: essa é de uma região onde a pessoa não tem papel, e para
 * ela não existe. Mandá-la para lá era mostrar-lhe um 404 em vez da frase que
 * diz o que aconteceu.
 */
async function seguir(
  calcular: () => Promise<string>,
  emErro: (mensagem: string) => string,
): Promise<never> {
  let destino: string;
  try {
    destino = await calcular();
  } catch (erro) {
    destino =
      erro instanceof SemPermissao
        ? comAviso('/admin/', `Não foi possível: ${erro.message}`)
        : emErro(mensagemDe(erro));
  }
  redirect(destino);
}

/** Quem fez, e de onde — o que cada função da base leva para a auditoria. */
async function rasto(dentro: Dentro): Promise<{ p_actor: string; p_ip_hash: string }> {
  return { p_actor: dentro.actor, p_ip_hash: hashDoIp(await headers()) };
}

function exigirRegiaoValida(id: string): string {
  if (!IDENTIFICADOR.test(id)) throw new Error('identificador de região inválido');
  return id;
}

// --- entrar e sair ---------------------------------------------------------

export async function entrar(formData: FormData): Promise<void> {
  const destino = destinoSeguro(texto(formData, 'destino'));
  const email = texto(formData, 'email').toLowerCase();
  const senha = String(formData.get('senha') ?? '');
  // O destino viaja com o erro, para não se perder o gesto a meio de uma gralha.
  const deVolta = (erro: string) =>
    `${CAMINHO_DA_ENTRADA}?${new URLSearchParams({
      erro,
      ...(email ? { email } : {}),
      ...(destino !== '/admin/' ? { destino } : {}),
    })}`;

  if (!painelConfigurado()) redirect(`${CAMINHO_DA_ENTRADA}?erro=configuracao`);

  // O LIMITE CONTA SÓ AS FALHADAS, por origem e por email (`limite.ts`): uma
  // equipa inteira a entrar à mesma hora não se tranca a si própria, e quem
  // tenta às cegas — de onde for, contra o email que for — tranca-se.
  const ipHash = hashDoIp(await headers());
  const baldes = [
    `admin-entrar:${ipHash}`,
    ...(email ? [`admin-entrar-email:${hashDoEmail(email)}`] : []),
  ];
  const limite = await verificarEntrada(baldes, JANELA_DAS_TENTATIVAS_S, LIMITE_DE_TENTATIVAS);
  if (!limite.permitido) redirect(deVolta('demasiadas'));

  const quem = await conferirCredenciais(email, senha);
  if (!quem) {
    await contarFalhada(baldes, limite.modo, JANELA_DAS_TENTATIVAS_S, LIMITE_DE_TENTATIVAS);
    redirect(deVolta('credenciais'));
  }

  await limparDepoisDeEntrar(baldes, limite.modo);
  await abrirSessao(quem);
  // QUEM ENTROU fica na auditoria — o dono também. Antes da 0009 a função não
  // existe, e entrar não pode depender dela.
  try {
    await chamar('registar_acesso', {
      p_pessoa: quem.pessoaId,
      p_actor: quem.actor,
      p_ip_hash: ipHash,
    });
  } catch (erro) {
    if (!ehEsquemaPorAplicar(erro)) console.error('registar_acesso', erro);
  }
  redirect(destino);
}

export async function sair(): Promise<void> {
  await fecharSessao();
  redirect(CAMINHO_DA_ENTRADA);
}

// --- regiões ---------------------------------------------------------------

/** A linha da região na base — o nome é o que se pede na confirmação, e o que as frases dizem. */
async function regiaoNaBase(id: string): Promise<RegiaoNaBase> {
  const r = (await listarRegioes()).find((x) => x.id === id);
  if (!r) throw new Error(`não há região com o identificador ${id}`);
  return r;
}

/**
 * Um domínio como chegou do formulário → o domínio, ou a frase de porque não.
 * Colar «https://www.exemplo.pt/» é o gesto natural, e devolvia o erro cru da
 * base, em inglês (P4-012).
 */
function dominioDoFormulario(entrada: string): string {
  const dominio = normalizarDominio(entrada);
  if (!dominioValido(dominio)) {
    throw new Error(
      `«${entrada}» não se lê como um endereço — escreve só o domínio, por exemplo transportes.exemplo.pt, sem https:// nem barras`,
    );
  }
  return dominio;
}

/** O esquema das ligações para outras origens: `http` nos testes, `https` no resto. */
const ESQUEMA = process.env.PARAGEM_ESQUEMA === 'http' ? 'http' : 'https';

/**
 * Ligar e desligar o sítio inteiro de uma região — o gesto mais pesado do
 * painel, e por isso o que mais pede.
 *
 * DESLIGAR PEDE O NOME DA REGIÃO ESCRITO (P4-011). Era um clique, sem
 * confirmação, no primeiro botão da ficha: um engano tirava do ar os horários
 * de uma autoridade inteira em cinco minutos. A confirmação vem do formulário
 * da zona de perigo, e confere-se AQUI — uma ação de servidor recebe o que lhe
 * mandarem, e a caixa do formulário é uma cortesia.
 *
 * LIGAR PEDE DADOS PUBLICADOS (P4-015). O painel deixava ligar uma região sem
 * nada no armazém e prometia que «responde daqui a cinco minutos» — e o que
 * respondia era um 404 no domínio de um cliente, no dia da estreia dele.
 */
export async function ligarOuDesligarRegiao(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const ligar = texto(formData, 'ligar') === '1';
  await seguir(
    async () => {
      const dentro = await exigirDono();
      exigirRegiaoValida(regiao);
      const r = await regiaoNaBase(regiao);
      if (ligar) {
        if (!(await regiaoNoArmazem(regiao).catch(() => null))) {
          throw new Error(
            `ainda não há dados ${naFrase(r).de} publicados, e ligar agora punha ${r.domain} a responder «página não encontrada». O botão volta quando a primeira construção estiver publicada`,
          );
        }
      } else if (!confirmacaoBate(texto(formData, 'confirmacao'), r.name)) {
        throw new Error(
          `para desligar, escreve o nome da região — ${r.name} — na caixa da confirmação`,
        );
      }
      const mudou = await chamar<boolean>('set_region_enabled', {
        p_region: regiao,
        p_enabled: ligar,
        ...(await rasto(dentro)),
      });
      // A lista das regiões ligadas e o mapa de domínios levam esta etiqueta:
      // a página do produto e as da região sabem-no à próxima visita; o
      // middleware, com a memória de módulo dele, em cinco minutos.
      revalidateTag(ETIQUETA_DAS_REGIOES);
      revalidateTag(etiquetaDaRegiao(regiao));
      return comAviso(
        ficha(regiao),
        !mudou
          ? 'Já estava assim; nada mudou.'
          : ligar
            ? `${naFrase(r).Com} ${naFrase(r).esta} no ar. Em cinco minutos, no máximo, ${ESQUEMA}://${r.domain}/ mostra os transportes ${naFrase(r).de}.`
            : `${naFrase(r).Com} ${naFrase(r).esta} ${naFrase(r).adj('desligad')}. Em cinco minutos, no máximo, ${r.domain} passa a mostrar a página do Paragem.pt. Os dados e os avisos ficam guardados: liga-se outra vez aqui.`,
        'estado',
      );
    },
    (mensagem) =>
      comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, ligar ? 'estado' : 'perigo'),
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
      const dentro = await exigirDono();
      const dominio = dominioDoFormulario(campos.dominio);
      const id = await chamar<string>('create_region', {
        p_id: campos.id,
        p_name: campos.nome,
        p_article: campos.artigo,
        p_domain: dominio,
        p_sort_order: Number(campos.ordem || '0') || 0,
        ...(await rasto(dentro)),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(id),
        `${campos.nome} existe no painel, desligada, com o endereço ${dominio}. Liga-se aqui quando os dados dela estiverem publicados.`,
        'estado',
      );
    },
    (mensagem) => comAviso(`/admin/regioes/nova/?${deVolta}`, `Não foi possível: ${mensagem}`),
  );
}

/**
 * Trocar o endereço principal — DEPOIS de o endereço novo responder (P4-013).
 *
 * Aplicava-se antes de o domínio novo existir, e o antigo passava a levar a
 * um endereço que não servia nada. Agora o endereço novo entra primeiro como
 * um que leva ao principal (`acrescentarAlias`); o DNS e a plataforma fazem-se
 * a seguir; e só quando ele já responde a levar a esta região — que é o que
 * `verificarEndereco` pergunta — o painel troca. Quem precisar de trocar antes
 * (um domínio que se sabe estar a caminho) pode, marcando que sabe o que faz,
 * e a frase de volta di-lo outra vez. Pede o nome da região escrito, como
 * desligar: é o outro gesto que tira um sítio do ar por engano.
 */
export async function mudarDominio(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const manterAlias = texto(formData, 'manter_alias') === '1';
  const naMesma = texto(formData, 'mesmo_sem_resposta') === '1';
  await seguir(
    async () => {
      const dentro = await exigirDono();
      exigirRegiaoValida(regiao);
      const r = await regiaoNaBase(regiao);
      const dominio = dominioDoFormulario(texto(formData, 'dominio'));
      if (dominio === r.domain) {
        return comAviso(
          ficha(regiao),
          `${dominio} já é o endereço principal; nada mudou.`,
          'perigo',
        );
      }
      if (!confirmacaoBate(texto(formData, 'confirmacao'), r.name)) {
        throw new Error(
          `para mudar o endereço principal, escreve o nome da região — ${r.name} — na caixa da confirmação`,
        );
      }
      const verificacao = await verificarEndereco(dominio, r.domain, fetch, ESQUEMA);
      if (!verificacao.ok && !naMesma) {
        throw new Error(
          `${verificacao.porque}. Mudar agora deixava o sítio sem responder. Acrescenta-o primeiro em «Endereço», trata do DNS e da plataforma, e volta aqui — ou marca que mudas na mesma`,
        );
      }
      const mudou = await chamar<boolean>('set_region_domain', {
        p_region: regiao,
        p_domain: dominio,
        p_keep_alias: manterAlias,
        ...(await rasto(dentro)),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      revalidateTag(etiquetaDaRegiao(regiao));
      return comAviso(
        ficha(regiao),
        !mudou
          ? `${dominio} já era o endereço principal; nada mudou.`
          : `O endereço principal ${naFrase(r).de} passa a ser ${dominio}` +
              (manterAlias ? `, e ${r.domain} fica a levar a ele` : '') +
              '. ' +
              (verificacao.ok
                ? 'Já respondia antes da mudança.'
                : 'Mudaste sem ele responder: até o DNS e a plataforma estarem feitos, o sítio não responde nele.') +
              ' Falta a declaração da região dizer o mesmo — ver «Para quem gere a instalação».',
        'endereco',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'perigo'),
  );
}

export async function acrescentarAlias(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  await seguir(
    async () => {
      const dentro = await exigirDono();
      exigirRegiaoValida(regiao);
      const dominio = dominioDoFormulario(texto(formData, 'dominio'));
      const mudou = await chamar<boolean>('add_region_alias', {
        p_domain: dominio,
        p_region: regiao,
        ...(await rasto(dentro)),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(regiao),
        mudou
          ? `Fica ${dominio}. Leva ao endereço principal assim que responder — falta pô-lo no DNS e no projeto da plataforma; depois, até cinco minutos.`
          : `${dominio} já levava ao endereço principal; nada mudou.`,
        'endereco',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'endereco'),
  );
}

export async function retirarAlias(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const dominio = normalizarDominio(texto(formData, 'dominio'));
  await seguir(
    async () => {
      const dentro = await exigirDono();
      exigirRegiaoValida(regiao);
      const mudou = await chamar<boolean>('remove_region_alias', {
        p_domain: dominio,
        ...(await rasto(dentro)),
      });
      revalidateTag(ETIQUETA_DAS_REGIOES);
      return comAviso(
        ficha(regiao),
        mudou
          ? `${dominio} deixou de levar ao endereço principal: quem o usar fica sem resposta, em cinco minutos no máximo.`
          : `${dominio} não levava a esta região; nada mudou.`,
        'endereco',
      );
    },
    (mensagem) => comAviso(ficha(regiao), `Não foi possível: ${mensagem}`, 'endereco'),
  );
}

// --- módulos ---------------------------------------------------------------

/**
 * Ligar e desligar um modo — com confirmação para desligar, e «Desfazer» na
 * mensagem (P4-011). Desligar o táxi tira do sítio a página dele, os pontos do
 * mapa, a procura e os ficheiros: não apaga nada, mas some-se a quem o
 * procura, e um clique ao lado do interruptor certo não podia fazer isso
 * calado. A confirmação chega do formulário (`confirmado`), e confere-se aqui.
 */
export async function alternarModulo(formData: FormData): Promise<void> {
  const regiao = texto(formData, 'regiao');
  const modulo = texto(formData, 'modulo');
  const ligar = texto(formData, 'ligar') === '1';
  await seguir(
    async () => {
      exigirRegiaoValida(regiao);
      const dentro = await exigirPapel(regiao, 'gestor');
      if (!ehModulo(modulo)) throw new Error(`não há modo com o identificador ${modulo}`);
      const nome = nomeDoModulo(modulo);
      if (!ligar && texto(formData, 'confirmado') !== '1') {
        throw new Error(`desligar ${nome.toLowerCase()} pede confirmação`);
      }
      const mudou = await chamar<boolean>('set_modulo', {
        p_region: regiao,
        p_id: modulo,
        p_enabled: ligar,
        ...(await rasto(dentro)),
      });
      // As páginas da região leem os módulos com a etiqueta dela.
      revalidateTag(etiquetaDaRegiao(regiao));
      return comAviso(
        ficha(regiao),
        !mudou
          ? 'Já estava assim; nada mudou.'
          : ligar
            ? `${nome}: ligado. Volta ao sítio à próxima visita de cada página.`
            : `${nome}: desligado. Saiu do sítio — a página, o mapa, a procura e os ficheiros —, e os dados ficam guardados.`,
        'modulos',
        mudou && !ligar ? { desfazer: modulo } : {},
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
      const dentro = await exigirDono();
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
        ...(await rasto(dentro)),
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * O AVISO TEM DE SER DESTA REGIÃO. Publicar, retirar e apagar recebem o
 * identificador do aviso e o da região, e a permissão é sobre a região: sem
 * esta conferência, quem edita os avisos de uma região publicava ou apagava
 * os de outra só por trocar o identificador no formulário. Corrigir já estava
 * guardado pela base (`upsert_aviso` recusa mudar um aviso de região); estes
 * dois gestos não.
 */
async function exigirAvisoDaRegiao(id: string, regiao: string): Promise<void> {
  const aviso = UUID.test(id) ? await avisoPorId(id) : null;
  if (!aviso || aviso.region_id !== regiao) {
    throw new Error('não há aviso com esse identificador nesta região');
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
      const dentro = await exigirPapel(regiao, 'editor');
      if (id) await exigirAvisoDaRegiao(id, regiao);
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
        ...(await rasto(dentro)),
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
      const dentro = await exigirPapel(regiao, 'editor');
      await exigirAvisoDaRegiao(id, regiao);
      await chamar<null>('set_aviso_publicado', {
        p_id: id,
        p_publicado: publicar,
        ...(await rasto(dentro)),
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
      const dentro = await exigirPapel(regiao, 'editor');
      await exigirAvisoDaRegiao(id, regiao);
      await chamar<null>('delete_aviso', { p_id: id, ...(await rasto(dentro)) });
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
      await exigirDono();
      const regioes = await listarRegioes();
      revalidateTag(ETIQUETA_DAS_REGIOES);
      for (const r of regioes) revalidateTag(etiquetaDaRegiao(r.id));
      return comAviso(
        '/admin/',
        `Páginas atualizadas: a lista das regiões e as páginas de ${regioes.length} ${regioes.length === 1 ? 'região' : 'regiões'} refazem-se à próxima visita, com os dados publicados.`,
      );
    },
    (mensagem) => comAviso('/admin/', `Não foi possível: ${mensagem}`),
  );
}
