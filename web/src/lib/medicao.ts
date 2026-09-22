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
import posthog from 'posthog-js';

const CHAVE = process.env.NEXT_PUBLIC_PARAGEM_POSTHOG ?? '';
const SERVIDOR = process.env.NEXT_PUBLIC_PARAGEM_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/** `true` quando se segue a mesma pessoa entre visitas — e aí é preciso consentimento. */
const COM_IDENTIFICADOR = process.env.NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA === '1';

let ligado = false;

export function comecar(): void {
  if (ligado || !CHAVE || typeof window === 'undefined') return;
  ligado = true;

  posthog.init(CHAVE, {
    api_host: SERVIDOR,
    // A visita à página é nossa de contar: o autocapture apanharia cliques em
    // elementos com texto lá dentro — e o texto, aqui, são nomes de paragens
    // que a pessoa escreveu.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
    // Sem armazenamento no dispositivo: nada fica lá quando a pessoa fecha.
    persistence: COM_IDENTIFICADOR ? 'localStorage+cookie' : 'memory',
    // O endereço IP não entra. É dado pessoal e não serve para nada do que
    // aqui se quer saber.
    property_denylist: COM_IDENTIFICADOR ? [] : ['$ip'],
    ip: COM_IDENTIFICADOR,
    person_profiles: COM_IDENTIFICADOR ? 'always' : 'never',
  });
}

export function pagina(caminho: string, extra: Record<string, unknown> = {}): void {
  if (!ligado) return;
  posthog.capture('$pageview', { $current_url: caminho, ...extra });
}

export function evento(nome: string, propriedades: Record<string, unknown> = {}): void {
  if (!ligado) return;
  posthog.capture(nome, propriedades);
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
