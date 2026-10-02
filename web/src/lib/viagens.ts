/**
 * O PLANEADOR DE VIAGENS, A CORRER NO TELEMÓVEL DE QUEM PERGUNTA.
 *
 * Isto substitui um servidor. Havia um OpenTripPlanner com o grafo de ruas de
 * 104 MB a responder «de onde para onde, a que horas» — uma máquina a manter e
 * a pagar para sempre, e que, enquanto não existiu, deixou a caixa de procura
 * a falhar a toda a gente.
 *
 * A pergunta cabe cá dentro. Medido nesta região: 33 535 horas, 1 413 viagens,
 * 4 850 paragens e 7 172 transbordos a pé — **321 kB comprimidos**, menos do
 * que os mosaicos do mapa que a página inicial já descarrega. E a resposta é
 * instantânea, porque não há ida ao servidor nenhuma.
 *
 * O QUE ISTO SABE E O QUE NÃO SABE
 * ---------------------------------
 * Sabe horários, e sabe-os exatamente: são os mesmos ficheiros que o motor
 * usava. Sabe transbordos entre paragens ao segundo, porque esses foram
 * calculados pelo OTP sobre as ruas a sério, uma vez, na construção.
 *
 * **Não sabe ruas.** O troço entre o ponto de onde alguém parte e a primeira
 * paragem é uma ESTIMATIVA: a linha reta multiplicada por um fator de desvio
 * que também foi medido — 1,115 nesta região, sobre sete mil pares. A
 * interface tem de dizer que é estimativa, e diz.
 *
 * O ALGORITMO É O RAPTOR, e a escolha não é por moda: percorre a rede por
 * RONDAS, e uma ronda é um transbordo. Isso dá de graça a coisa que quem viaja
 * mais quer — «e sem mudar de autocarro?» — sem a procurar à parte.
 */
import { descodificarLinha, type Itinerario, type Perna } from './otp.ts';

// --- o que se lê do disco --------------------------------------------------

export type GrelhaCrua = {
  fuso: string;
  /** `[id, lat, lon, nome]` */
  paragens: [string, number, number, string][];
  /** `[codigo, nome, cor, modo, fuso]` — o `fuso` é um índice em `fusos`. */
  linhas: [string, string, string | null, string, number][];
  /**
   * Os fusos horários que as agências declaram.
   *
   * Um feed pan-europeu declara `UTC` e os locais declaram `Europe/Lisbon`. As
   * horas de uma viagem leem-se no fuso da agência DELA — não no da região —,
   * e ignorá-lo adiantava os expressos uma hora no verão.
   */
  fusos: string[];
  /** `[linha, servico, [paragem, chegada, partida, …]]` */
  viagens: [number, number, number[]][];
  servicos: string[];
  /** `AAAAMMDD` → índices dos serviços que correm nesse dia. */
  datas: Record<string, number[]>;
  folga_transbordo?: number;
};

export type TransbordosCrus = {
  fator_de_desvio: number;
  pelo_motor: number;
  em_linha_reta: number;
  pares: [number, number, number][];
};

/** Um ponto de onde se parte ou para onde se vai. Pode não ser uma paragem. */
export type Lugar = { nome: string; lat: number; lon: number };

// --- as constantes, e porque é que valem o que valem ------------------------

/**
 * A folga entre chegar e apanhar o seguinte.
 *
 * Dois minutos, que é o `transferSlack` que o motor usava. Tem de bater certo
 * com ele enquanto os dois coexistirem: se divergirem, o mesmo itinerário sai
 * possível num e impossível no outro, e o oráculo do CI apanha-o.
 */
const FOLGA_SEGUNDOS = 120;

/** A velocidade a pé do OTP. Mudá-la aqui muda as estimativas, não os transbordos. */
const METROS_POR_SEGUNDO = 1.33;

/** Até onde se anda para apanhar a primeira paragem. Mais do que isto e é outra viagem. */
const RAIO_INICIAL_METROS = 1500;

/** Quantas paragens de cada lado se experimentam. Mais do que isto não muda a resposta. */
const QUANTAS_PARAGENS = 8;

/**
 * Quantos transbordos se admitem.
 *
 * Quatro rondas são três transbordos. Numa rede com 122 linhas ninguém faz
 * quatro — e cada ronda a mais é uma varredura inteira da rede por uma
 * resposta que ninguém ia escolher.
 */
const RONDAS = 4;

/** Um dia tem isto de segundos. O GTFS passa dos 24 h de propósito. */
const DIA = 86_400;

// --- a rede preparada ------------------------------------------------------

type Padrao = {
  /** A sequência de paragens, igual para todas as viagens deste padrão. */
  paragens: number[];
  /** Cada viagem: a linha, o serviço, e as horas alinhadas com `paragens`. */
  viagens: { linha: number; servico: number; chegada: number[]; partida: number[] }[];
};

export type Rede = {
  grelha: GrelhaCrua;
  padroes: Padrao[];
  /** Paragem → os padrões que a servem, e em que posição. */
  porParagem: Map<number, [number, number][]>;
  /** Paragem → os transbordos a pé a partir dela. */
  aPe: Map<number, [number, number][]>;
  fatorDeDesvio: number;
  /** Quantos transbordos vieram de ruas a sério, e quantos de linha reta. */
  precisao: { pelo_motor: number; em_linha_reta: number };
};

/**
 * Prepara a rede uma vez, para muitas perguntas.
 *
 * O trabalho está em agrupar as viagens por PADRÃO — a sequência de paragens
 * que percorrem. É o que o RAPTOR varre: 1 413 viagens colapsam em algumas
 * centenas de padrões, e varrer padrões em vez de viagens é a diferença entre
 * responder num piscar de olhos e responder daqui a um bocado.
 */
/**
 * `semModos` são os módulos que o painel desligou nesta região: as viagens
 * das linhas desses modos ficam de fora da rede, e o planeador nunca as
 * propõe. É aqui e não à saída — uma viagem com uma perna de comboio
 * desligado não é uma viagem a mais, é uma rede a menos.
 */
export function prepararRede(
  g: GrelhaCrua,
  t: TransbordosCrus,
  semModos: readonly string[] = [],
): Rede {
  const porChave = new Map<string, Padrao>();
  for (const [linha, servico, horas] of g.viagens) {
    if (semModos.length && semModos.includes(g.linhas[linha]?.[3])) continue;
    const paragens: number[] = [];
    const chegada: number[] = [];
    const partida: number[] = [];
    for (let i = 0; i < horas.length; i += 3) {
      paragens.push(horas[i]);
      chegada.push(horas[i + 1]);
      partida.push(horas[i + 2]);
    }
    const chave = paragens.join(',');
    let p = porChave.get(chave);
    if (!p) {
      p = { paragens, viagens: [] };
      porChave.set(chave, p);
    }
    p.viagens.push({ linha, servico, chegada, partida });
  }

  const padroes = [...porChave.values()];
  // Ordenadas pela partida da primeira paragem: é assim que se acha depressa a
  // primeira viagem que serve, e é assim que o resultado fica determinista.
  for (const p of padroes) p.viagens.sort((a, b) => a.partida[0] - b.partida[0]);

  const porParagem = new Map<number, [number, number][]>();
  padroes.forEach((p, pi) => {
    p.paragens.forEach((s, pos) => {
      const lista = porParagem.get(s);
      if (lista) lista.push([pi, pos]);
      else porParagem.set(s, [[pi, pos]]);
    });
  });

  const aPe = new Map<number, [number, number][]>();
  const juntar = (a: number, b: number, s: number) => {
    const lista = aPe.get(a);
    if (lista) lista.push([b, s]);
    else aPe.set(a, [[b, s]]);
  };
  // O ficheiro guarda um sentido por par. A pé não há sentido único.
  for (const [a, b, s] of t.pares) {
    juntar(a, b, s);
    juntar(b, a, s);
  }

  return {
    grelha: g,
    padroes,
    porParagem,
    aPe,
    fatorDeDesvio: t.fator_de_desvio || 1.4,
    precisao: { pelo_motor: t.pelo_motor ?? 0, em_linha_reta: t.em_linha_reta ?? 0 },
  };
}

// --- geometria -------------------------------------------------------------

/**
 * Quantas horas para a frente se procura, e se mostra.
 *
 * Um dia inteiro. Menos do que isto deixa de fora o serviço normal do dia
 * seguinte a quem pergunta ao fim da tarde, e o que sobra são os desvios —
 * medido a 21/09 num par de cidades às 18:45, onde a única resposta eram 258
 * minutos por fora da região num par com carreira direta de 60.
 *
 * É UM NÚMERO SÓ de propósito: a procura e o corte da apresentação leem o
 * mesmo. Eram dois iguais em sítios diferentes, e dois números iguais em
 * sítios diferentes são um número prestes a ficar diferente.
 */
const HORIZONTE_H = 24;

/**
 * Três horas à espera de uma ligação. Acima disto não é uma viagem com um
 * transbordo: são duas viagens, e quem as faz não as procurou juntas.
 *
 * Sobrava uma de 805 minutos: apanhar um autocarro às 18:10, dormir algures,
 * e apanhar outro de manhã.
 */
const ESPERA_MAXIMA_MS = 3 * 3600 * 1000;

function semEsperaAbsurda(pernas: { startTime: number; endTime: number }[]): boolean {
  return pernas.every((l, i) => i === 0 || l.startTime - pernas[i - 1].endTime <= ESPERA_MAXIMA_MS);
}

export function metros(a: [number, number], b: [number, number]): number {
  const dy = (a[0] - b[0]) * 111_320;
  const dx = (a[1] - b[1]) * 111_320 * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

/**
 * Codifica uma linha em polilinha do Google, que é o que o mapa já sabe ler.
 *
 * O `descodificarLinha` do `otp.ts` é o par disto. Existe porque o motor
 * mandava as pernas assim, e mantê-lo poupa mexer no mapa — e permite que as
 * duas fontes de itinerários sejam intercambiáveis.
 */
export function codificarLinha(pontos: [number, number][]): string {
  let saida = '';
  let latAnterior = 0;
  let lonAnterior = 0;
  const um = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lon] of pontos) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    saida += um(la - latAnterior) + um(lo - lonAnterior);
    latAnterior = la;
    lonAnterior = lo;
  }
  return saida;
}

/** As paragens mais perto de um ponto, com o tempo a pé estimado. */
function paragensPerto(
  rede: Rede,
  l: Lugar,
  raio = RAIO_INICIAL_METROS,
): [number, number, number][] {
  const perto: [number, number, number][] = [];
  rede.grelha.paragens.forEach((p, i) => {
    const d = metros([l.lat, l.lon], [p[1], p[2]]);
    if (d <= raio) perto.push([i, d, Math.round((d * rede.fatorDeDesvio) / METROS_POR_SEGUNDO)]);
  });
  perto.sort((a, b) => a[1] - b[1]);
  return perto.slice(0, QUANTAS_PARAGENS);
}

// --- o calendário ----------------------------------------------------------

/**
 * Que serviços correm, e com que desvio de horas.
 *
 * **ISTO É O SÍTIO ONDE UM PLANEADOR MENTE MAIS FACILMENTE.** Uma viagem que
 * parte às 00:30 está escrita no GTFS como «24:30 do dia anterior». Olhar só
 * para o dia que a pessoa escreveu perde-a — e o que a pessoa vê é «não há
 * nada a essa hora» para um autocarro que passa mesmo.
 *
 * Por isso olham-se três dias: o de ontem com as horas a recuar um dia, o de
 * hoje, e o de amanhã a avançar um dia.
 */
function diasAConsiderar(g: GrelhaCrua, data: string): { ativos: Set<number>; passo: number }[] {
  const base = new Date(`${data}T00:00:00Z`);
  const saida: { ativos: Set<number>; passo: number }[] = [];
  for (const passo of [-1, 0, 1]) {
    const d = new Date(base.getTime() + passo * DIA * 1000);
    const chave =
      `${d.getUTCFullYear()}` +
      `${String(d.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(d.getUTCDate()).padStart(2, '0')}`;
    saida.push({ ativos: new Set(g.datas[chave] ?? []), passo });
  }
  return saida;
}

// --- a procura -------------------------------------------------------------

type Etiqueta =
  | { tipo: 'inicio'; paragem: number; chegada: number; metros: number }
  | { tipo: 'pe'; de: number; paragem: number; chegada: number; segundos: number }
  | {
      tipo: 'viagem';
      padrao: number;
      viagem: number;
      desvio: number;
      deIdx: number;
      paraIdx: number;
      chegada: number;
    };

type Ativa = { v: Padrao['viagens'][number]; desvio: number };

/**
 * Uma varredura do RAPTOR: a chegada mais cedo a cada paragem, por rondas.
 *
 * Devolve, para cada ronda, a etiqueta de como se lá chegou — é com ela que se
 * reconstrói a viagem no fim. Guardar o caminho enquanto se procura custa
 * memória; recalculá-lo depois custa a resposta inteira.
 */
function varrer(
  rede: Rede,
  origens: [number, number, number][],
  partida: number,
  ativasPorPadrao: Ativa[][],
): { melhor: Float64Array; rondas: Map<number, Etiqueta>[] } {
  const n = rede.grelha.paragens.length;
  const melhor = new Float64Array(n).fill(Infinity);
  const rondas: Map<number, Etiqueta>[] = [];
  let anterior = new Float64Array(n).fill(Infinity);
  let marcados = new Set<number>();

  const zero = new Map<number, Etiqueta>();
  for (const [s, d, segs] of origens) {
    const t = partida + segs;
    if (t < melhor[s]) {
      melhor[s] = t;
      anterior[s] = t;
      zero.set(s, { tipo: 'inicio', paragem: s, chegada: t, metros: d });
      marcados.add(s);
    }
  }
  rondas.push(zero);

  for (let k = 1; k <= RONDAS && marcados.size; k++) {
    const etiquetas = new Map<number, Etiqueta>();
    const atual = new Float64Array(n).fill(Infinity);

    // Que padrões vale a pena varrer, e a partir de que posição. Entrar num
    // padrão mais à frente do que é preciso perde as ligações; entrar mais
    // atrás é trabalho por nada.
    const aVarrer = new Map<number, number>();
    for (const s of marcados) {
      for (const [pi, pos] of rede.porParagem.get(s) ?? []) {
        const tem = aVarrer.get(pi);
        if (tem === undefined || pos < tem) aVarrer.set(pi, pos);
      }
    }

    // A folga só conta a partir da segunda ronda: quem vem a pé de casa não
    // precisa de dois minutos para se mudar de um autocarro que não apanhou.
    const folga = k === 1 ? 0 : FOLGA_SEGUNDOS;

    for (const [pi, desde] of aVarrer) {
      const padrao = rede.padroes[pi];
      const ativas = ativasPorPadrao[pi];
      if (!ativas.length) continue;
      let aBordo: { a: Ativa; deIdx: number } | null = null;

      for (let i = desde; i < padrao.paragens.length; i++) {
        const s = padrao.paragens[i];

        if (aBordo) {
          const chegada = aBordo.a.v.chegada[i] + aBordo.a.desvio;
          if (chegada < melhor[s]) {
            melhor[s] = chegada;
            atual[s] = chegada;
            etiquetas.set(s, {
              tipo: 'viagem',
              padrao: pi,
              viagem: ativas.indexOf(aBordo.a),
              desvio: aBordo.a.desvio,
              deIdx: aBordo.deIdx,
              paraIdx: i,
              chegada,
            });
          }
        }

        // Apanhar aqui uma viagem mais cedo do que a que se traz.
        const disponivel = anterior[s];
        if (!Number.isFinite(disponivel)) continue;
        const limite = disponivel + folga;
        let melhorAqui: Ativa | null = null;
        let melhorPartida = aBordo ? aBordo.a.v.partida[i] + aBordo.a.desvio : Infinity;
        for (const a of ativas) {
          const p = a.v.partida[i] + a.desvio;
          if (p >= limite && p < melhorPartida) {
            melhorPartida = p;
            melhorAqui = a;
          }
        }
        if (melhorAqui) aBordo = { a: melhorAqui, deIdx: i };
      }
    }

    // E a pé, a partir do que esta ronda melhorou. Um transbordo a pé não
    // gasta uma ronda: quem anda 200 metros entre duas paragens não mudou de
    // autocarro duas vezes.
    for (const [s, e] of [...etiquetas]) {
      for (const [outro, segs] of rede.aPe.get(s) ?? []) {
        const chegada = e.chegada + segs;
        if (chegada < melhor[outro]) {
          melhor[outro] = chegada;
          atual[outro] = chegada;
          etiquetas.set(outro, { tipo: 'pe', de: s, paragem: outro, chegada, segundos: segs });
        }
      }
    }

    rondas.push(etiquetas);
    marcados = new Set(etiquetas.keys());
    anterior = atual;
  }

  return { melhor, rondas };
}

// --- do dia de serviço para a hora do relógio ------------------------------

/**
 * O desvio do fuso num instante, sem trazer uma biblioteca de fusos.
 *
 * O `Intl` do navegador já sabe todas as regras de horário de verão; o que não
 * dá é o desvio em número. Formata-se o instante no fuso pedido, lê-se de
 * volta como se fosse UTC, e a diferença é o desvio.
 */
function desvioDoFuso(epoch: number, fuso: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(epoch))) p[x.type] = x.value;
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return comoUtc - epoch;
}

/**
 * A meia-noite de um dia de serviço, em milissegundos desde a época.
 *
 * Duas passagens, e a segunda não é preciosismo: no dia em que o relógio muda,
 * a primeira estimativa cai do lado errado da mudança e erra uma hora. Uma
 * hora num horário de autocarros é a diferença entre apanhá-lo e vê-lo passar.
 */
function meiaNoiteDe(data: string, fuso: string): number {
  const palpite = Date.parse(`${data}T00:00:00Z`);
  const uma = palpite - desvioDoFuso(palpite, fuso);
  return palpite - desvioDoFuso(uma, fuso);
}

/** `AAAA-MM-DD` mais `dias` dias, sem a mudança da hora a comer um dia. */
export function diaMais(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// --- reconstruir a viagem --------------------------------------------------

function etiquetaEm(rondas: Map<number, Etiqueta>[], paragem: number, ate: number) {
  for (let j = ate; j >= 0; j--) {
    const e = rondas[j].get(paragem);
    if (e) return { e, ronda: j };
  }
  return null;
}

/** As pernas, do fim para o princípio e depois viradas ao direito. */
function reconstruir(
  rede: Rede,
  rondas: Map<number, Etiqueta>[],
  ativasPorPadrao: Ativa[][],
  paragemFinal: number,
  ronda: number,
): Etiqueta[] {
  const passos: Etiqueta[] = [];
  let paragem = paragemFinal;
  let k = ronda;
  for (let guarda = 0; guarda < RONDAS * 4; guarda++) {
    const achado = etiquetaEm(rondas, paragem, k);
    if (!achado) break;
    const { e } = achado;
    passos.push(e);
    if (e.tipo === 'inicio') break;
    if (e.tipo === 'pe') {
      paragem = e.de;
      k = achado.ronda;
      // Um passo a pé dentro da mesma ronda: o que o trouxe até aqui está
      // nessa ronda ou antes. Não se desce de ronda por andar.
      const anterior = rondas[achado.ronda].get(e.de);
      if (!anterior) k = achado.ronda - 1;
      continue;
    }
    const padrao = rede.padroes[e.padrao];
    paragem = padrao.paragens[e.deIdx];
    k = achado.ronda - 1;
  }
  return passos.reverse();
}

// --- a resposta, na forma que o sítio já espera ----------------------------

function perna(
  rede: Rede,
  ativasPorPadrao: Ativa[][],
  e: Etiqueta,
  meiaNoite: () => number,
): Perna | null {
  const P = rede.grelha.paragens;
  // Os segundos já vêm no referencial do dia perguntado, no fuso da região:
  // o `desvio` tratou disso quando as viagens foram escolhidas.
  const ms = (segundos: number) => meiaNoite() + segundos * 1000;

  if (e.tipo === 'pe') {
    const d = metros([P[e.de][1], P[e.de][2]], [P[e.paragem][1], P[e.paragem][2]]);
    return {
      mode: 'WALK',
      duration: e.segundos,
      distance: Math.round(d),
      startTime: ms(e.chegada - e.segundos),
      endTime: ms(e.chegada),
      route: null,
      from: { name: P[e.de][3] },
      to: { name: P[e.paragem][3] },
      legGeometry: {
        points: codificarLinha([
          [P[e.de][1], P[e.de][2]],
          [P[e.paragem][1], P[e.paragem][2]],
        ]),
      },
    };
  }
  if (e.tipo !== 'viagem') return null;

  const padrao = rede.padroes[e.padrao];
  const a = ativasPorPadrao[e.padrao][e.viagem];
  if (!a) return null;
  const linha = rede.grelha.linhas[a.v.linha];
  const pontos: [number, number][] = [];
  for (let i = e.deIdx; i <= e.paraIdx; i++) {
    const p = P[padrao.paragens[i]];
    pontos.push([p[1], p[2]]);
  }
  const inicio = a.v.partida[e.deIdx] + a.desvio;
  const fim = a.v.chegada[e.paraIdx] + a.desvio;
  return {
    // O modo em maiúsculas, como o motor o mandava: é o que a cor da perna e
    // os ícones já esperam, e mudá-lo era mexer em três sítios por nada.
    mode: linha?.[3] === 'comboio' ? 'RAIL' : 'BUS',
    duration: fim - inicio,
    distance: Math.round(pontos.slice(1).reduce((s, p, i) => s + metros(pontos[i], p), 0)),
    startTime: ms(inicio),
    endTime: ms(fim),
    route: {
      shortName: linha?.[0] || null,
      longName: linha?.[1] || null,
      color: linha?.[2] ?? null,
    },
    from: { name: P[padrao.paragens[e.deIdx]][3] },
    to: { name: P[padrao.paragens[e.paraIdx]][3] },
    // A linha reta de paragem em paragem, que é o que se desenha enquanto o
    // traçado da linha não chegar — e o que fica se ele não existir.
    legGeometry: { points: codificarLinha(pontos) },
    traco: { linha: a.v.linha, paragens: padrao.paragens.slice(e.deIdx, e.paraIdx + 1) },
    modo: linha?.[3] || undefined,
    // Até o traçado chegar, é a reta — e diz-se (`planeador.ts` desfaz isto
    // nas pernas que o tiverem).
    aproximado: true,
  };
}

/**
 * O traçado de uma perna, colado troço a troço.
 *
 * **Onde falta, fica a reta.** A cobertura é de 87 % dos troços: os outros são
 * pares de paragens que a base geométrica não tem, ou troços que se recusaram
 * por darem uma volta implausível. Um pedaço reto no meio de estrada a sério
 * é honesto; inventar a estrada que falta não é.
 */
export function percursoDaPerna(
  rede: Rede,
  traco: { linha: number; paragens: number[] },
  trocos: Record<string, string>,
  descodificar: (s: string) => [number, number][],
): string | null {
  const P = rede.grelha.paragens;
  const pontos: [number, number][] = [];
  let algum = false;
  for (let i = 0; i < traco.paragens.length - 1; i++) {
    const a = traco.paragens[i];
    const b = traco.paragens[i + 1];
    const pol = trocos[`${a}>${b}`];
    if (pol) {
      algum = true;
      // O `descodificarLinha` devolve [lon, lat] para o GeoJSON; aqui
      // precisamos de [lat, lon], que é a ordem da polilinha.
      const pedaco = descodificar(pol).map(([lon, lat]) => [lat, lon] as [number, number]);
      for (const ponto of pedaco) {
        if (!pontos.length || pontos[pontos.length - 1].join() !== ponto.join()) pontos.push(ponto);
      }
    } else {
      for (const s of [a, b]) {
        const ponto: [number, number] = [P[s][1], P[s][2]];
        if (!pontos.length || pontos[pontos.length - 1].join() !== ponto.join()) pontos.push(ponto);
      }
    }
  }
  return algum && pontos.length > 1 ? codificarLinha(pontos) : null;
}

/**
 * As viagens de cada padrão que correm nos dias em causa, já postas no relógio
 * de quem pergunta.
 *
 * O `desvio` faz DUAS coisas ao mesmo tempo, e é por isso que não é um número
 * fixo. Muda o dia — uma viagem escrita como «24:30 de ontem» é 00:30 de hoje
 * — e muda o FUSO, porque as horas de cada viagem se leem no fuso da agência
 * dela. Calcular os dois juntos, a partir da meia-noite real de cada dia em
 * cada fuso, acerta também nos dias em que o relógio muda.
 */
function ativasNos(
  rede: Rede,
  dias: { ativos: Set<number>; passo: number }[],
  desvioDe: (passo: number, fuso: number) => number,
): Ativa[][] {
  return rede.padroes.map((p) => {
    const saida: Ativa[] = [];
    for (const dia of dias) {
      if (!dia.ativos.size) continue;
      for (const v of p.viagens) {
        if (!dia.ativos.has(v.servico)) continue;
        saida.push({ v, desvio: desvioDe(dia.passo, rede.grelha.linhas[v.linha]?.[4] ?? 0) });
      }
    }
    saida.sort((a, b) => a.v.partida[0] + a.desvio - (b.v.partida[0] + b.desvio));
    return saida;
  });
}

/**
 * Vale a pena mostrar este troço a pé?
 *
 * **Não, quando é da paragem para ela própria.** Quem procura a partir de uma
 * paragem via «A pé · Ribeira Branca (Centro) → Ribeira Branca (Centro) ·
 * 07:05 · 0 min · 7 m» — uma linha inteira do itinerário a dizer que não é
 * preciso andar. Os 7 m são a diferença entre o ponto que o índice guarda e a
 * paragem do horário, e isso não é uma caminhada.
 *
 * Vinte e cinco metros: abaixo disso é a largura de uma rua, e ninguém
 * precisa de instruções para a atravessar.
 */
function vale(p: Perna): boolean {
  if (p.from.name === p.to.name) return false;
  return p.distance > 25;
}

function aPeEntre(
  a: Lugar,
  b: { lat: number; lon: number; nome: string },
  fator: number,
  quando: number,
) {
  const d = metros([a.lat, a.lon], [b.lat, b.lon]);
  const segundos = Math.round((d * fator) / METROS_POR_SEGUNDO);
  return {
    mode: 'WALK',
    duration: segundos,
    distance: Math.round(d),
    startTime: quando,
    endTime: quando + segundos * 1000,
    route: null,
    from: { name: a.nome },
    to: { name: b.nome },
    legGeometry: {
      points: codificarLinha([
        [a.lat, a.lon],
        [b.lat, b.lon],
      ]),
    },
  } satisfies Perna;
}

/**
 * De onde para onde, à hora que for: os itinerários, sem servidor nenhum.
 *
 * Devolve-os na MESMA FORMA que o motor devolvia. É isso que permite ter os
 * dois: uma região com servidor usa-o e ganha as ruas; uma sem servidor usa
 * isto. A página não sabe a diferença, e não tem de saber.
 *
 * **As opções vêm por partidas sucessivas, e não por variações da mesma.**
 * Depois de achar a melhor, volta a perguntar a partir do minuto seguinte à
 * partida que ela usou. É o que dá «o próximo é às 10:20, e o outro às 11:05»
 * em vez de cinco maneiras de apanhar o mesmo autocarro.
 */
export function planearLocal(
  rede: Rede,
  de: Lugar,
  para: Lugar,
  data: string,
  hora: string,
  quantos = 5,
): Itinerario[] {
  const [h, m] = hora.split(':').map((x) => parseInt(x, 10));
  const partidaInicial = (h || 0) * 3600 + (m || 0) * 60;

  const dias = diasAConsiderar(rede.grelha, data);
  if (!dias.some((d) => d.ativos.size)) return [];

  const fuso = rede.grelha.fuso || 'UTC';
  const zero = meiaNoiteDe(data, fuso);
  const cache = new Map<string, number>();
  // Quanto é preciso somar às horas de uma viagem daquele dia e daquele fuso
  // para as ler no relógio de quem pergunta.
  const desvioDe = (passo: number, iFuso: number) => {
    const chave = `${passo}/${iFuso}`;
    let v = cache.get(chave);
    if (v === undefined) {
      const zona = rede.grelha.fusos?.[iFuso] || fuso;
      v = Math.round((meiaNoiteDe(diaMais(data, passo), zona) - zero) / 1000);
      cache.set(chave, v);
    }
    return v;
  };
  const meiaNoite = () => zero;

  const ativasPorPadrao = ativasNos(rede, dias, desvioDe);

  const origens = paragensPerto(rede, de);
  const destinos = paragensPerto(rede, para);
  if (!origens.length || !destinos.length) return [];
  const chegadaExtra = new Map(destinos.map(([s, , segs]) => [s, segs]));

  const itinerarios: Itinerario[] = [];
  const vistos = new Set<string>();
  let partida = partidaInicial;
  // A MESMA JANELA QUE O `arrumar` DEIXA PASSAR, e não outra. Eram duas — a
  // procura parava às doze horas e o `arrumar` cortava às doze horas — e
  // enquanto foram iguais ninguém dava por isso. Separá-las é a maneira de
  // procurar durante um dia inteiro para deitar metade fora no fim.
  const limite = partidaInicial + HORIZONTE_H * 3600;

  for (let volta = 0; volta < quantos * 3 && partida <= limite; volta++) {
    const { melhor, rondas } = varrer(rede, origens, partida, ativasPorPadrao);

    let alvo = -1;
    let ronda = -1;
    let chegada = Infinity;
    for (const [s, extra] of chegadaExtra) {
      const t = melhor[s] + extra;
      if (t >= chegada) continue;
      for (let k = rondas.length - 1; k >= 1; k--) {
        if (rondas[k].has(s)) {
          alvo = s;
          ronda = k;
          chegada = t;
          break;
        }
      }
    }
    if (alvo < 0 || !Number.isFinite(chegada)) break;

    const passos = reconstruir(rede, rondas, ativasPorPadrao, alvo, ronda);
    const viagens = passos.filter((p) => p.tipo === 'viagem');
    if (!viagens.length) break;

    const pernas: Perna[] = [];
    const inicio = passos[0];
    const primeira = viagens[0] as Extract<Etiqueta, { tipo: 'viagem' }>;
    const aPrimeira = rede.padroes[primeira.padrao].paragens[primeira.deIdx];
    const pa = rede.grelha.paragens[inicio.tipo === 'inicio' ? inicio.paragem : aPrimeira];

    // A perna a pé do princípio ancora-se à PARTIDA DO AUTOCARRO e não à hora
    // perguntada: ninguém quer saber que podia ter saído de casa às 9h05 para
    // esperar 40 minutos na paragem. Sai-se a tempo.
    const embarque =
      zero +
      (ativasPorPadrao[primeira.padrao][primeira.viagem].v.partida[primeira.deIdx] +
        primeira.desvio) *
        1000;
    const aPe1 = aPeEntre(de, { lat: pa[1], lon: pa[2], nome: pa[3] }, rede.fatorDeDesvio, 0);
    aPe1.endTime = embarque;
    aPe1.startTime = embarque - aPe1.duration * 1000;
    if (vale(aPe1)) pernas.push(aPe1);

    for (const p of passos) {
      const feita = perna(rede, ativasPorPadrao, p, meiaNoite);
      if (feita) pernas.push(feita);
    }

    const ultimaViagem = viagens[viagens.length - 1] as Extract<Etiqueta, { tipo: 'viagem' }>;
    const ultimaParagemIdx =
      passos[passos.length - 1].tipo === 'pe'
        ? (passos[passos.length - 1] as Extract<Etiqueta, { tipo: 'pe' }>).paragem
        : rede.padroes[ultimaViagem.padrao].paragens[ultimaViagem.paraIdx];
    const pb = rede.grelha.paragens[ultimaParagemIdx];
    const fimTransporte = pernas[pernas.length - 1]?.endTime ?? 0;
    const aPe2 = aPeEntre(
      { nome: pb[3], lat: pb[1], lon: pb[2] },
      { lat: para.lat, lon: para.lon, nome: para.nome },
      rede.fatorDeDesvio,
      fimTransporte,
    );
    if (vale(aPe2)) pernas.push(aPe2);

    if (!pernas.length) break;
    const comeca = pernas[0].startTime;
    const acaba = pernas[pernas.length - 1].endTime;
    const chave = `${comeca}/${acaba}/${pernas.length}`;
    // A ESPERA DECIDE-SE AQUI, E NÃO NO FIM, e a diferença não é de estilo.
    //
    // O `quantos` conta o que se ACHA. Enquanto o corte da espera vivia só no
    // `arrumar`, cinco candidatos «viajar hoje à noite e dormir algures»
    // gastavam a quota inteira, o laço parava, e o `arrumar` deitava quatro
    // fora — o utilizador ficava com UM. Medido a 21/09 num par de cidades às
    // 18:45: cinco achados, quatro cortados, e a única resposta que sobrava
    // era o desvio de 258 minutos por fora da região.
    //
    // Recusada aqui, a volta seguinte procura outra em vez de dar a quota por
    // gasta. O corte continua no `arrumar` também: é lá que os itinerários
    // que vêm do motor passam, e esses não passam por aqui.
    if (!vistos.has(chave) && semEsperaAbsurda(pernas)) {
      vistos.add(chave);
      itinerarios.push({
        duration: Math.round((acaba - comeca) / 1000),
        startTime: comeca,
        endTime: acaba,
        walkDistance: pernas.filter((p) => p.mode === 'WALK').reduce((s, p) => s + p.distance, 0),
        legs: pernas,
      });
    }
    if (itinerarios.length >= quantos) break;

    // A volta seguinte parte de depois deste embarque. Sem isto responde-se
    // sempre a mesma coisa.
    const partiuAs =
      ativasPorPadrao[primeira.padrao][primeira.viagem].v.partida[primeira.deIdx] + primeira.desvio;
    partida = Math.max(partida + 60, partiuAs + 60);
  }

  return arrumar(itinerarios, zero + partidaInicial * 1000);
}

/**
 * O que se mostra, do que se achou. Três cortes, e os três doem se faltarem.
 *
 * **A JANELA, E PORQUE É QUE DUPLICOU.** A procura olha para o dia de ontem e
 * o de amanhã, e tem de olhar: uma viagem que parte às 00:30 está escrita no
 * GTFS como «24:30 de ontem».
 *
 * A janela era de DOZE horas, e a razão estava escrita aqui: «mostrar o
 * autocarro das 07:00 de amanhã a quem perguntou pelas 09:00 de hoje é mentir
 * com a verdade — a interface mostra a hora e não o dia, e quem lê vê 07:00 e
 * pensa que é já». A cautela era justa e o preço dela era alto. Medido a
 * 21/09 num par de cidades às 18:45: a única opção que sobrava eram 258
 * minutos de comboio e autocarro POR FORA DA REGIÃO, para um par que tem
 * carreira direta de 60 minutos. A direta seguinte partia às 07:30 do dia a
 * seguir —
 * doze horas e quarenta e cinco minutos depois — e era cortada por vinte e
 * cinco minutos.
 *
 * A interface passou a dizer o dia (`diaDe`, em `otp.ts`), e por isso a
 * janela passa a vinte e quatro horas: um dia inteiro de serviço a seguir à
 * pergunta, seja a que hora for que alguém pergunte. O que impedia de o fazer
 * não era esta função — era a outra ponta.
 *
 * **A DOMINAÇÃO, COM UM QUARTO DE HORA DE TOLERÂNCIA.** Uma opção que parte
 * depois e chega antes torna a outra inútil. Mas a comparação estrita deixava
 * passar uma opção das 12:39 que chega às 15:52, ao lado de outra das 12:34
 * que chega às 13:35 — cinco minutos mais cedo a sair, duas horas e um quarto
 * mais cedo a chegar. Formalmente não se dominam; na prática ninguém escolhe
 * a primeira.
 *
 * Quinze minutos é o que se dá por dormir mais um bocado. Acima disso já é
 * uma escolha a sério, e as duas ficam.
 *
 * **A ESPERA.** Sobrava uma de 805 minutos: apanhar um autocarro às 18:10,
 * dormir algures, e apanhar outro de manhã. Ninguém a escolheria.
 *
 * O primeiro corte que tentei foi pela DURAÇÃO — fora as que demorassem mais
 * do dobro da melhor — e estava errado. Cortava a opção das 09:24, que
 * demora 148 minutos contra 61 mas **chega uma hora e meia mais cedo**, por
 * partir três horas antes. Quem tem de estar lá às 12h quer essa, e a
 * duração sozinha não sabe disso.
 *
 * O disparate não é a viagem ser longa: é uma ESPERA de treze horas no meio.
 * É essa que se corta, e o resto decide-se pela dominação.
 */
function arrumar(todos: Itinerario[], janelaInicio: number): Itinerario[] {
  const janelaFim = janelaInicio + HORIZONTE_H * 3600 * 1000;
  const primeiroTransporte = (it: Itinerario) =>
    it.legs.find((l) => l.mode !== 'WALK')?.startTime ?? it.startTime;

  const naJanela = todos.filter((it) => {
    const t = primeiroTransporte(it);
    return t >= janelaInicio && t <= janelaFim;
  });
  if (!naJanela.length) return [];

  const bons = naJanela.filter((it) => semEsperaAbsurda(it.legs));
  if (!bons.length) return [];
  const TOLERANCIA = 15 * 60 * 1000;
  return bons
    .filter(
      (a) =>
        !bons.some(
          (b) =>
            b !== a &&
            b.startTime >= a.startTime - TOLERANCIA &&
            b.endTime <= a.endTime &&
            (b.startTime > a.startTime || b.endTime < a.endTime),
        ),
    )
    .sort((a, b) => a.startTime - b.startTime);
}

// --- o que se mostra, e por que ordem --------------------------------------

/** Quantas vezes se muda de veículo — as pernas a pé e de bicicleta não contam. */
export function contarTransbordos(it: Itinerario): number {
  return Math.max(0, it.legs.filter((p) => p.mode !== 'WALK' && p.mode !== 'BICYCLE').length - 1);
}

/**
 * AS PERNAS A PÉ, SEM REPETIÇÕES NEM PASSOS DE ZERO MINUTOS (P2-011).
 *
 * A linha do tempo dizia «<Terminal> · A pé · 0 min · 19 m · <Terminal> ·
 * A pé · 1 min · 55 m»: duas pernas a pé seguidas, a primeira da paragem para
 * ela própria. Lê-se como um erro, e enche de passos inúteis o
 * sítio onde se lê a viagem de relance.
 *
 * Duas regras, e valem para o motor e para o planeador do navegador:
 *
 * - **pernas a pé seguidas são uma só**: quem anda da paragem para a
 *   estação e da estação para o cais está a andar, e não a fazer duas coisas;
 * - **um passo que não se anda não se mostra**: menos de um minuto entre duas
 *   paragens com o mesmo nome, ou menos de meio minuto e trinta metros — a
 *   largura de uma rua, que ninguém precisa de instruções para atravessar.
 */
export function limparPernas(it: Itinerario): Itinerario {
  const juntas: Perna[] = [];
  for (const p of semVoltas(it.legs)) {
    const antes = juntas[juntas.length - 1];
    if (antes && antes.mode === 'WALK' && p.mode === 'WALK') {
      const pontos = [antes, p].flatMap((l) =>
        l.legGeometry?.points
          ? descodificarLinha(l.legGeometry.points).map(
              ([lon, lat]) => [lat, lon] as [number, number],
            )
          : [],
      );
      juntas[juntas.length - 1] = {
        ...antes,
        duration: antes.duration + p.duration,
        distance: antes.distance + p.distance,
        endTime: p.endTime,
        to: p.to,
        legGeometry: pontos.length > 1 ? { points: codificarLinha(pontos) } : antes.legGeometry,
      };
      continue;
    }
    juntas.push(p);
  }
  const ficam = juntas.filter(
    (p) =>
      p.mode !== 'WALK' ||
      !((p.from.name === p.to.name && p.duration < 60) || (p.duration < 30 && p.distance < 30)),
  );
  if (!ficam.length) return it;
  // A viagem começa na primeira perna que fica e acaba na última: cortada
  // uma volta à cabeça, parte-se mais tarde — e é essa a hora a dizer.
  const comeco = ficam[0].startTime;
  const fim = ficam[ficam.length - 1].endTime;
  return {
    ...it,
    legs: ficam,
    startTime: comeco,
    endTime: fim,
    duration: Math.round((fim - comeco) / 1000),
    walkDistance: ficam.filter((p) => p.mode === 'WALK').reduce((s, p) => s + p.distance, 0),
  };
}

/** Uma perna em que se vai num veículo — não a pé nem de bicicleta. */
const deVeiculo = (p: Perna) => p.mode !== 'WALK' && p.mode !== 'BICYCLE';

/** A mesma perna a horas diferentes: `d` milissegundos mais tarde (ou mais cedo). */
const mexida = (p: Perna, d: number): Perna =>
  d ? { ...p, startTime: p.startTime + d, endTime: p.endTime + d } : p;

/**
 * AS VOLTAS QUE NÃO LEVAM A LADO NENHUM SAEM (P2-009).
 *
 * Numa linha circular, o planeador propunha embarcar no terminal, dar a volta
 * à cidade, voltar ao MESMO terminal e esperar lá uma hora pela carreira que
 * se queria — com mais uma hora na duração e um transbordo que não existe.
 * Quem está no terminal espera no terminal. Corta-se tudo o que vai de um
 * embarque num sítio até à última vez que se parte do mesmo sítio — à cabeça,
 * o caminho a pé até lá passa para a hora certa —, e no fim o mesmo ao
 * contrário: o que se anda depois de já se ter chegado ao último sítio.
 */
export function semVoltas(legs: Perna[]): Perna[] {
  let r = [...legs];
  for (let i = 0; i < r.length; i++) {
    if (!deVeiculo(r[i])) continue;
    const onde = r[i].from.name;
    let k = -1;
    for (let j = r.length - 1; j > i; j--) {
      if (r[j].from.name === onde) {
        k = j;
        break;
      }
    }
    if (k < 0) continue;
    // Antes do primeiro veículo só há caminho a pé, e esse faz-se mais tarde.
    // E se depois da volta já só se anda a pé, anda-se logo à chegada. As
    // duas coisas juntas são uma volta e mais nada: fica a primeira hora.
    const primeiro = r.slice(0, i).every((p) => !deVeiculo(p));
    const ultimo = i > 0 && r.slice(k).every((p) => !deVeiculo(p));
    const adiante = primeiro && !ultimo ? r[k].startTime - r[i].startTime : 0;
    const atras = ultimo ? r[i - 1].endTime - r[k].startTime : 0;
    r = [
      ...r.slice(0, i).map((p) => mexida(p, adiante)),
      ...r.slice(k).map((p) => mexida(p, atras)),
    ];
  }
  let m = -1;
  for (let j = r.length - 1; j >= 0; j--) {
    if (deVeiculo(r[j])) {
      m = j;
      break;
    }
  }
  if (m > 0) {
    const onde = r[m].to.name;
    const k = r.findIndex((p, j) => j < m && p.to.name === onde);
    if (k >= 0) {
      const antes = r[m].endTime - r[k].endTime;
      r = [...r.slice(0, k + 1), ...r.slice(m + 1).map((p) => mexida(p, -antes))];
    }
  }
  return r;
}

/**
 * Sem opções repetidas: cortadas as voltas, duas opções podem ficar a ser a
 * mesma viagem — a mesma carreira, à mesma hora —, e a lista dizia-a duas vezes.
 */
export function semRepetidas(its: Itinerario[]): Itinerario[] {
  const vistas = new Set<string>();
  return its.filter((it) => {
    const chave = [
      it.startTime,
      it.endTime,
      ...it.legs.map((p) => `${p.mode}:${p.route?.shortName ?? ''}:${p.from.name}:${p.startTime}`),
    ].join('|');
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

export type OpcoesArrumadas = {
  /** As que se mostram, por ordem de partida. */
  opcoes: Itinerario[];
  /** As que dão uma volta desproporcionada — à parte, em «mais opções». */
  desvios: Itinerario[];
  /** Qual das `opcoes` se abre e desenha sozinha. */
  recomendada: number;
};

/** Quanto se anda, de ponta a ponta, em todas as pernas. */
const percorrido = (it: Itinerario) => it.legs.reduce((s, p) => s + (p.distance || 0), 0);

/**
 * O QUE SE MOSTRA PRIMEIRO, E O QUE SE ABRE SOZINHO (P2-009).
 *
 * Para duas cidades a 35 km, «agora» às duas da manhã, a primeira opção — já
 * aberta e desenhada no mapa — era ir à capital e voltar: 260 km e 4 h 32 por
 * fora da região. A lista por ordem de partida é defensável; abrir e desenhar
 * sozinha uma opção dessas não é. Duas decisões:
 *
 * **Um desvio vai para «mais opções»**, e não se apaga — continua a ser uma
 * viagem que existe. É desvio a opção que:
 *
 * - demora mais do DOBRO da mais curta e chega DEPOIS dela — a regra de
 *   dominação do planeador deixava-a passar por partir mais cedo; ou
 * - anda mais do dobro do que a que menos anda (e pelo menos mais 20 km),
 *   sem ser mais rápida do que ela. É a volta pela capital: chega primeiro
 *   porque parte três horas antes, e é por isso que a duração sozinha não a
 *   apanha. Um expresso que vai pela autoestrada, anda mais e chega antes,
 *   não é desvio nenhum — é mais rápido.
 *
 * **E há desvios que o são sozinhos**, sem precisar de outra opção ao lado:
 * quando se sabem as pontas, uma viagem que anda mais do QUÁDRUPLO da
 * distância entre elas (e pelo menos mais 25 km) é uma volta. Num sábado à
 * noite, entre duas cidades vizinhas a 27 km, as três opções que havia iam
 * todas à capital — 213 a 232 km — e comparadas umas com as outras nenhuma era
 * desvio. O quádruplo e não o triplo, e foi medido: a ligação regional da
 * manhã, por duas vilas e um comboio, anda 82 km para os mesmos 27 — dá uma
 * volta, e é a que lá passa.
 *
 * **Abre-se a que se recomendaria**, e não a primeira da lista: a que chega
 * primeiro, contando cada transbordo como dez minutos — quem chega cinco
 * minutos mais cedo com duas mudanças de autocarro não fez melhor viagem do
 * que quem vai sentado. A lista continua por ordem de partida; o que muda é
 * qual delas se abre e se desenha.
 */
export function arrumarParaMostrar(
  its: Itinerario[],
  pontas: { de: Lugar; para: Lugar } | null = null,
): OpcoesArrumadas {
  const reta = pontas
    ? metros([pontas.de.lat, pontas.de.lon], [pontas.para.lat, pontas.para.lon])
    : 0;
  const volta = (it: Itinerario) => reta > 0 && percorrido(it) > Math.max(4 * reta, reta + 25_000);
  if (its.length <= 1) {
    const sozinhas = its.filter((it) => !volta(it));
    return { opcoes: sozinhas, desvios: its.filter(volta), recomendada: 0 };
  }
  const curta = its.reduce((a, b) => (b.duration < a.duration ? b : a));
  const menosAnda = its.reduce((a, b) => (percorrido(b) < percorrido(a) ? b : a));
  const minimo = percorrido(menosAnda);
  const desvio = (it: Itinerario) =>
    volta(it) ||
    (it.duration > 2 * curta.duration && it.endTime > curta.endTime) ||
    (minimo > 0 &&
      percorrido(it) > Math.max(2 * minimo, minimo + 20_000) &&
      it.duration >= menosAnda.duration);
  const desvios = its.filter(desvio);
  const opcoes = its.filter((it) => !desvio(it)).sort((a, b) => a.startTime - b.startTime);
  const DEZ_MIN = 10 * 60 * 1000;
  const nota = (it: Itinerario) => it.endTime + contarTransbordos(it) * DEZ_MIN;
  const recomendada = opcoes.reduce(
    (melhor, it, i) =>
      nota(it) < nota(opcoes[melhor]) ||
      (nota(it) === nota(opcoes[melhor]) && it.duration < opcoes[melhor].duration)
        ? i
        : melhor,
    0,
  );
  return {
    opcoes,
    desvios: desvios.sort((a, b) => a.startTime - b.startTime),
    recomendada,
  };
}

/**
 * A PRÓXIMA LIGAÇÃO, quando a janela pedida não tem nenhuma (P2-003).
 *
 * «Sem viagem neste dia» respondia-se a quem perguntava depois da única
 * carreira do dia: a ligação existia às 07:00 de cada dia útil, e a página
 * não dizia nem que a de hoje já tinha partido, nem quando era a próxima. Num
 * território de baixa densidade, «não há» quando há uma por dia é dizer a
 * quem mora numa aldeia que não pode ir à cidade.
 *
 * Procura-se dia a dia, a partir do dia seguinte ao que se perguntou (quem
 * planeia cada dia começa à meia-noite), até uma semana — e nunca para lá do
 * que os horários carregados cobrem (`ate`, `AAAAMMDD`): para lá disso, «não
 * há» passava a querer dizer «não sabemos». Devolve as opções do primeiro dia
 * que as tiver, e o dia.
 */
export async function procurarNosDias(
  planearNoDia: (dia: string) => Promise<Itinerario[]>,
  data: string,
  ate: string | null = null,
  dias = 7,
  serve: (its: Itinerario[]) => boolean = (its) => its.length > 0,
): Promise<{ its: Itinerario[]; dia: string } | null> {
  for (let n = 1; n <= dias; n++) {
    const dia = diaMais(data, n);
    if (ate && dia.replace(/-/g, '') > ate) break;
    const its = await planearNoDia(dia);
    // `serve` decide o que é uma ligação: um dia que só tem voltas pela
    // capital não é «a próxima ligação» entre duas cidades vizinhas.
    if (serve(its)) return { its, dia };
  }
  return null;
}
