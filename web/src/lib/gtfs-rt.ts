/**
 * GTFS-RT Service Alerts, codificado à mão.
 *
 * PORQUÊ À MÃO, e não com a biblioteca de referência. O que um feed de avisos
 * precisa são nove campos de três tipos — cadeia, varint e mensagem embutida.
 * A biblioteca oficial traz um interpretador de `.proto` inteiro para isso,
 * e num sítio que corre em funções de borda o que se carrega por pedido conta.
 *
 * MAS PROTOBUF MAL CODIFICADO NÃO DÁ ERRO: dá um ficheiro que a aplicação do
 * outro lado lê ao contrário, em silêncio, e ninguém descobre até alguém
 * perder um autocarro. Por isso a biblioteca oficial não desapareceu — está
 * nas dependências de desenvolvimento, e o teste DESCODIFICA COM ELA o que
 * isto codifica. Se um número de campo aqui estiver errado, o teste não
 * reconhece o que sai.
 *
 * Os números de campo e os valores dos enums são os de
 * `gtfs-realtime.proto`, versão 2.0.
 */

// --- o arame -----------------------------------------------------------------

const VARINT = 0;
const DELIMITADO = 2;

function varint(n: number): number[] {
  // Sem `bigint`: os nossos maiores números são instantes em segundos, que só
  // passam de 2^53 daqui a uns milhões de anos.
  const saida: number[] = [];
  let v = Math.max(0, Math.floor(n));
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v > 0) b |= 0x80;
    saida.push(b);
  } while (v > 0);
  return saida;
}

function etiqueta(campo: number, tipo: number): number[] {
  return varint(campo * 8 + tipo);
}

function campoVarint(campo: number, valor: number | undefined): number[] {
  if (valor === undefined || valor === null) return [];
  return [...etiqueta(campo, VARINT), ...varint(valor)];
}

function campoBytes(campo: number, bytes: number[]): number[] {
  if (bytes.length === 0) return [];
  return [...etiqueta(campo, DELIMITADO), ...varint(bytes.length), ...bytes];
}

function campoTexto(campo: number, texto: string | undefined | null): number[] {
  if (!texto) return [];
  return campoBytes(campo, [...new TextEncoder().encode(texto)]);
}

// --- as mensagens ------------------------------------------------------------

/** `TranslatedString` com uma tradução só — a língua da região. */
function textoTraduzido(campo: number, texto: string | undefined | null, lingua: string): number[] {
  if (!texto) return [];
  const traducao = [...campoTexto(1, texto), ...campoTexto(2, lingua)];
  return campoBytes(campo, campoBytes(1, traducao));
}

/** `TimeRange`: início e fim em segundos desde a época. Ambos opcionais. */
function periodo(inicio?: number, fim?: number): number[] {
  if (inicio === undefined && fim === undefined) return [];
  return campoBytes(1, [...campoVarint(1, inicio), ...campoVarint(2, fim)]);
}

/**
 * `EntitySelector`: a que é que o aviso diz respeito.
 *
 * VAZIO QUER DIZER «A REDE TODA», e é o que a especificação manda: um alerta
 * sem `informed_entity` aplica-se a tudo. É raro e deve ser deliberado — por
 * isso o painel avisa quem o deixar assim.
 */
function entidades(linhas: string[], paragens: string[]): number[] {
  return [
    ...linhas.flatMap((r) => campoBytes(5, campoTexto(2, r))),
    ...paragens.flatMap((s) => campoBytes(5, campoTexto(5, s))),
  ];
}

export const CAUSA = {
  UNKNOWN_CAUSE: 1,
  OTHER_CAUSE: 2,
  TECHNICAL_PROBLEM: 3,
  STRIKE: 4,
  DEMONSTRATION: 5,
  ACCIDENT: 6,
  HOLIDAY: 7,
  WEATHER: 8,
  MAINTENANCE: 9,
  CONSTRUCTION: 10,
  POLICE_ACTIVITY: 11,
  MEDICAL_EMERGENCY: 12,
} as const;

export const EFEITO = {
  NO_SERVICE: 1,
  REDUCED_SERVICE: 2,
  SIGNIFICANT_DELAYS: 3,
  DETOUR: 4,
  ADDITIONAL_SERVICE: 5,
  MODIFIED_SERVICE: 6,
  OTHER_EFFECT: 7,
  UNKNOWN_EFFECT: 8,
  STOP_MOVED: 9,
  NO_EFFECT: 10,
  ACCESSIBILITY_ISSUE: 11,
} as const;

export const GRAVIDADE = {
  UNKNOWN_SEVERITY: 1,
  INFO: 2,
  WARNING: 3,
  SEVERE: 4,
} as const;

/**
 * Os nomes, como tipos. É isto que faz com que os rótulos em português
 * (`avisos.ts`) e estes números não possam divergir sem o compilador dar por
 * isso: o mesmo enum escrito duas vezes é o mesmo enum até alguém acrescentar
 * um valor só de um lado.
 */
export type Causa = keyof typeof CAUSA;
export type Efeito = keyof typeof EFEITO;
export type Gravidade = keyof typeof GRAVIDADE;

export type AvisoRT = {
  id: string;
  titulo: string;
  texto: string;
  gravidade: string;
  causa: string;
  efeito: string;
  inicio?: string | Date | null;
  fim?: string | Date | null;
  linhas?: string[];
  paragens?: string[];
  url?: string | null;
};

const segundos = (d: string | Date | null | undefined): number | undefined =>
  d === null || d === undefined ? undefined : Math.floor(new Date(d).getTime() / 1000);

/**
 * O feed inteiro, pronto a servir.
 *
 * `incrementality` fica no valor por omissão (`FULL_DATASET`): cada pedido traz
 * TODOS os avisos em vigor, e o que não vier deixou de valer. É o modo certo
 * para quem publica dezenas de avisos por ano e não milhares por minuto — e é
 * o único que se pode servir de uma cache sem mentir.
 */
export function feedDeAvisos(avisos: AvisoRT[], lingua = 'pt', agora = new Date()): Uint8Array {
  const cabecalho = [
    ...campoTexto(1, '2.0'),
    ...campoVarint(3, Math.floor(agora.getTime() / 1000)),
  ];

  const entidades_ = avisos.flatMap((a) => {
    const alerta = [
      ...periodo(segundos(a.inicio), segundos(a.fim)),
      ...entidades(a.linhas ?? [], a.paragens ?? []),
      ...campoVarint(6, CAUSA[a.causa as Causa] ?? CAUSA.UNKNOWN_CAUSE),
      ...campoVarint(7, EFEITO[a.efeito as Efeito] ?? EFEITO.OTHER_EFFECT),
      ...textoTraduzido(8, a.url, lingua),
      ...textoTraduzido(10, a.titulo, lingua),
      ...textoTraduzido(11, a.texto, lingua),
      ...campoVarint(14, GRAVIDADE[a.gravidade as Gravidade] ?? GRAVIDADE.UNKNOWN_SEVERITY),
    ];
    return campoBytes(2, [...campoTexto(1, a.id), ...campoBytes(5, alerta)]);
  });

  return new Uint8Array([...campoBytes(1, cabecalho), ...entidades_]);
}
