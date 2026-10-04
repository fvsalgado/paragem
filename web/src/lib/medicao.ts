/**
 * O que se mede, e o que não se mede.
 *
 * Para uma autoridade de transportes, isto não é vaidade: **os pedidos que não
 * têm resposta são a lista da procura que a rede não serve.** Alguém que
 * escreve duas terras e não obtém caminho está a dizer que precisa dessa
 * ligação. Saber quantos são, e para onde, é matéria de planeamento de rede —
 * é provavelmente o dado mais valioso que este sítio produz.
 *
 * ## A configuração é sem cookies de propósito, e dá MAIS dados e não menos
 *
 * Um rastreador com identificador exige consentimento no espaço europeu, e um
 * aviso de consentimento recusado por metade das pessoas dá metade dos dados.
 * Sem identificador, sem armazenamento no dispositivo e sem endereço IP não há
 * dado pessoal: mede-se **toda a gente**, não só quem carrega em «aceito».
 *
 * E para o que interessa aqui não faz falta nenhuma saber QUEM procurou — faz
 * falta saber O QUE se procurou. As duas perguntas são diferentes e só a
 * segunda planeia uma rede.
 *
 * Se um dia for preciso seguir a mesma pessoa entre visitas — funis de
 * conversão, coortes —, isso é outra decisão: exige aviso de consentimento,
 * política de privacidade com base legal, e contrato de subcontratação com
 * quem processa. Está escrito em `docs/MEDICAO.md` o que isso implica.
 */
import type { PostHog } from 'posthog-js/dist/module.slim.no-external';

const CHAVE = process.env.NEXT_PUBLIC_PARAGEM_POSTHOG ?? '';
const SERVIDOR = process.env.NEXT_PUBLIC_PARAGEM_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/** `true` quando se segue a mesma pessoa entre visitas — e aí é preciso consentimento. */
const COM_IDENTIFICADOR = process.env.NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA === '1';

/**
 * A BIBLIOTECA CHEGA DEPOIS DA PÁGINA, e não com ela (P3-006).
 *
 * Era importada no topo deste ficheiro, e este ficheiro é do invólucro de
 * TODAS as páginas: 96 kB comprimidos (290 kB de JavaScript a avaliar) no
 * caminho de cada uma delas — mais do que o React —, para mandar uma visita.
 * Medido na região real: era o maior ficheiro do tarifário, uma página de
 * 12 kB de HTML. E vinha mesmo sem chave, num sítio que não mede nada.
 *
 * Agora só se descarrega com chave, e só depois de a página ter acabado de
 * carregar e de o navegador ficar livre: a medição não pode atrasar a
 * resposta que se está a medir. O que se pede antes disso espera numa fila,
 * com a hora a que aconteceu — uma visita contada dois segundos depois
 * continua a ser contada à hora certa.
 *
 * E CHEGA A VERSÃO LEVE. A de omissão traz junto cerca de vinte extensões —
 * marcadores de funcionalidades, captura automática de cliques, gravação de
 * sessões, mapas de calor, inquéritos, erros, a barra de ferramentas — e este
 * sítio não usa nenhuma: conta visitas, saídas e meia dúzia de eventos, e
 * isso é do núcleo. Medido na 1.434: 99 kB comprimidos e 317 kB a avaliar na
 * de omissão, 52 kB e 166 kB nesta — que nunca vai buscar scripts de fora,
 * diga a configuração o que disser. O caminho entra em `dist/` porque o
 * pacote ainda não a publica como `posthog-js/slim`, que a documentação dele
 * já nomeia; se uma versão nova a mudar de sítio, a construção falha alto, e
 * não em silêncio.
 */
let carregada: Promise<PostHog | null> | null = null;

function quandoLivre(fazer: () => void): void {
  // Sem `requestIdleCallback` (o Safari só o tem há pouco), um prazo fixo.
  const depois = () =>
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(fazer, { timeout: 4000 })
      : window.setTimeout(fazer, 1500);
  if (document.readyState === 'complete') depois();
  else window.addEventListener('load', depois, { once: true });
}

export function comecar(): void {
  if (carregada || !CHAVE || typeof window === 'undefined') return;
  carregada = new Promise((resolver) =>
    quandoLivre(() => {
      import('posthog-js/dist/module.slim.no-external')
        .then(({ default: posthog }) => {
          posthog.init(CHAVE, {
            api_host: SERVIDOR,
            // A visita à página é nossa de contar: o autocapture apanharia cliques em
            // elementos com texto lá dentro — e o texto, aqui, são nomes de paragens
            // que a pessoa escreveu.
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: true,
            disable_session_recording: true,
            // NADA DE SCRIPTS DE FORA. Sem isto o PostHog ia buscar o dos
            // inquéritos (35 kB, medido no início da região real) e os que um
            // dia se ligassem no painel dele — código que não passou por aqui,
            // a correr num sítio de uma autoridade pública. Não há inquéritos.
            disable_surveys: true,
            disable_external_dependency_loading: true,
            // Sem armazenamento no dispositivo: nada fica lá quando a pessoa fecha.
            persistence: COM_IDENTIFICADOR ? 'localStorage+cookie' : 'memory',
            // O endereço IP não entra. É dado pessoal e não serve para nada do que
            // aqui se quer saber.
            property_denylist: COM_IDENTIFICADOR ? [] : ['$ip'],
            ip: COM_IDENTIFICADOR,
            person_profiles: COM_IDENTIFICADOR ? 'always' : 'never',
          });
          resolver(posthog);
        })
        // Uma medição que não carregou não parte a página: fica por medir.
        .catch(() => resolver(null));
    }),
  );
}

/** Conta agora, com a hora de agora — mesmo que a biblioteca ainda esteja a chegar. */
function contar(nome: string, propriedades: Record<string, unknown>): void {
  if (!carregada) return;
  const quando = new Date();
  carregada.then((p) => p?.capture(nome, propriedades, { timestamp: quando }));
}

export function pagina(caminho: string, extra: Record<string, unknown> = {}): void {
  contar('$pageview', { $current_url: caminho, ...extra });
}

export function evento(nome: string, propriedades: Record<string, unknown> = {}): void {
  contar(nome, propriedades);
}

/**
 * Uma viagem procurada.
 *
 * Guarda-se o NOME da origem e do destino, e não as coordenadas: o que
 * interessa a quem planeia a rede é «esta terra → aquela terra», não
 * «39.80,-8.09 → 39.59,-8.41». Os nomes são públicos — vêm do horário da
 * operadora.
 */
export function viagemProcurada(p: {
  /**
   * A região, pelo identificador. Sem ela, o relatório do painel (P4-030)
   * tinha de adivinhar a região pelo domínio de onde o evento veio — que muda
   * quando a região muda de endereço.
   */
  regiao?: string;
  de: string;
  para: string;
  data: string;
  hora: string;
  opcoes: number;
  minutosMelhor: number | null;
  transbordosMelhor: number | null;
  linhas: string[];
}): void {
  evento('viagem_procurada', {
    ...(p.regiao ? { regiao: p.regiao } : {}),
    de: p.de,
    para: p.para,
    ligacao: `${p.de} → ${p.para}`,
    data: p.data,
    hora: p.hora,
    // A hora a que se procura e o dia da semana dizem quando é que as pessoas
    // planeiam — que não é o mesmo que quando viajam.
    dia_da_semana: new Date(`${p.data}T12:00:00`).getDay(),
    opcoes: p.opcoes,
    teve_resposta: p.opcoes > 0,
    minutos_melhor: p.minutosMelhor,
    transbordos_melhor: p.transbordosMelhor,
    linhas: p.linhas,
  });
}

/**
 * Uma viagem SEM resposta. É a lista da procura que a rede não serve.
 *
 * Vai como evento próprio e não só como propriedade da anterior, para que se
 * consiga pôr num painel sem escrever uma consulta — o que aumenta as
 * hipóteses de alguém olhar para ela.
 */
export function viagemSemResposta(p: {
  regiao?: string;
  de: string;
  para: string;
  data: string;
  hora: string;
}): void {
  evento('viagem_sem_resposta', {
    ...p,
    ligacao: `${p.de} → ${p.para}`,
    dia_da_semana: new Date(`${p.data}T12:00:00`).getDay(),
  });
}

/** O motor em baixo. Se isto aparecer, alguém tem de ir ver — ver `docs/ALOJAMENTO.md`. */
export function motorIndisponivel(razao: string): void {
  evento('motor_indisponivel', { razao });
}
