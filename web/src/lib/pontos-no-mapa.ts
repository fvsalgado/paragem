import { NOME_DOS_MODOS, type Ponto } from './formato.ts';
import { modoDoTipo } from './modulos.ts';

/**
 * As camadas de pontos do mapa: uma por modo, e nada de específico a uma região.
 *
 * O `tipo` de cada ponto vem do pipeline e é o MODO tal como a região o
 * declara — «bicicleta», «taxi», «urbano-municipal» — com duas exceções
 * herdadas: as paragens da rede própria vêm como `paragem` e as estações de
 * comboio como `estacao`, porque já se chamavam assim antes de haver modos no
 * mapa. O `modoDoTipo` (`modulos.ts`) traduz essas duas e mais nada.
 *
 * **Uma região que declare um modo que nunca vimos ganha camada na mesma.**
 * Sem cor declarada fica a neutra, que é o que o §6 manda para os serviços
 * privados, e o botão do filtro fica com o nome do modo. É o mesmo contrato
 * dos leitores do pipeline: quem trata da forma trata de qualquer região.
 *
 * AS CORES ESTÃO DUPLICADAS AQUI, e não é por distração. O `global.css` tem-nas
 * como variáveis CSS (§6) e é lá que a interface as lê; o MapLibre pinta numa
 * tela e não resolve `var(--bicicleta)`. São os mesmos valores, e se um mudar
 * tem de mudar nos dois — está escrito nos dois sítios por isso mesmo.
 */

/** Serviços privados sem cor de modo (§6): cartão neutro, ponto neutro. */
const NEUTRA = '#4a5c66';

const COR_DO_MODO: Record<string, string> = {
  autocarro: '#0a5c7a',
  comboio: '#3f4852',
  bicicleta: '#2d6a3e',
  'urbano-municipal': '#5b3a8e',
  'a-pedido': '#8a5300',
};

/**
 * COMO SE DESENHA CADA MODO — e é a forma, e não só a cor, que os separa.
 *
 * Comboio, expresso e táxi eram três cinzentos quase iguais (1,33:1 entre
 * si, P1-010): uma estação e uma praça de táxi distinguiam-se pelo tamanho
 * do círculo, e quem não distingue bem as cores não as distinguia de todo.
 * Os privados continuam neutros, como o §6 manda — o que muda é a forma:
 *
 * - `ponto`: um disco na cor do modo — as paragens, as bicicletas, os urbanos;
 * - `anel`: recheio branco e contorno da cor — os cais dos expressos, que
 *   ficam por baixo da paragem da rede no mesmo sítio;
 * - `placa`: um quadrado arredondado com o pictograma do modo — as estações
 *   (escuro, com o comboio a branco) e as praças de táxi (claro, com o táxi
 *   escuro). É o desenho de uma placa, e é o que se procura num mapa.
 */
export type Forma = 'ponto' | 'anel' | 'placa';

export type CamadaDePontos = {
  /** O valor de `tipo` nos pontos, e o identificador da camada no mapa. */
  tipo: string;
  /** O modo, no vocabulário da região — é o que escolhe o pictograma. */
  modo: string;
  /** O que o botão do filtro diz. */
  rotulo: string;
  cor: string;
  forma: Forma;
  /** Numa placa, a cor do fundo; o pictograma vai na outra. */
  fundo: string;
  /** A partir de que zoom aparece. */
  minzoom: number;
  /**
   * O raio do círculo — numa placa, o meio lado — a cada zoom: pares
   * `[zoom, raio]`, interpolados entre si. Eram dois números, o de aparecer e
   * o de z16, e uma paragem crescia por igual de 2 a 6 px: pequena demais a
   * z12 para se ver em cima do traço da rede, e larga demais a z13 para
   * caberem as de uma rua.
   */
  raios: [number, number][];
  /**
   * Se, entre o `minzoom` e 13, só aparecem os pontos mais servidos.
   *
   * Vale para as paragens e para mais nada: umas dezenas de estações de
   * bicicletas ou uma dúzia de praças de táxi não tapam mapa nenhum, e
   * desbastá-las escondia exatamente o que quem liga o filtro está a procurar.
   */
  desbastar: boolean;
  /**
   * Desenha-se como ANEL — recheio claro e contorno da cor — e não como disco.
   *
   * A paragem é um anel desde que a rede passou a desenhar-se: um disco azul
   * por cima de um traço azul desaparecia nele, e um anel lê-se como uma
   * estação num mapa de metro. O expresso é o anel largo
   * POR BAIXO da paragem, no mesmo sítio — um halo à volta dela.
   */
  anel: boolean;
};

/**
 * Cada camada aparece ao zoom a que se torna ÚTIL, e não todas ao mesmo.
 *
 * As paragens vistas de cima são uma nuvem que tapa a própria rede, e a esse
 * zoom não se distingue uma da outra — por isso só a partir de 11, e entre 11
 * e 13 só as que têm serviço a sério. As estações são poucas e são marcos:
 * aparecem cedo, a 9, e opacas desde aí (estavam a 0 a z9 e só chegavam a
 * cheias a z10 — invisíveis no zoom em que se vê a região inteira). As
 * estações de bicicletas e as praças de táxi decidem-se a pé, e a pé anda-se
 * com o mapa perto.
 */
type Regra = {
  minzoom: number;
  raios: [number, number][];
  desbastar?: boolean;
  forma?: Forma;
};

const CAMADAS_CONHECIDAS: Record<string, Regra> = {
  estacao: {
    minzoom: 9,
    raios: [
      [9, 5.5],
      [12, 7],
      [16, 11],
    ],
    forma: 'placa',
  },
  // A PARAGEM: pequena enquanto é um ponto na rede, e com o tamanho de um alvo
  // de dedo quando já se anda a pé — 2,5 a 3,5 px de z11 a z13, e de 4,5 a 7
  // de z14 a z16.
  paragem: {
    minzoom: 11,
    raios: [
      [11, 2.5],
      [13, 3.5],
      [14, 4.5],
      [16, 7],
    ],
    desbastar: true,
    forma: 'anel',
  },
  bicicleta: {
    minzoom: 12,
    raios: [
      [12, 3],
      [16, 7],
    ],
  },
  'urbano-municipal': {
    minzoom: 12,
    raios: [
      [12, 3],
      [16, 7],
    ],
  },
  taxi: {
    minzoom: 13,
    raios: [
      [13, 6],
      [16, 9],
    ],
    forma: 'placa',
  },
  // OS CAIS DOS EXPRESSOS SÃO GRANDES E FICAM POR BAIXO, e as duas coisas
  // andam juntas. São uma mão-cheia de pontos numa região e caem praticamente
  // em cima da paragem da rede — medidos entre 19 e 36 metros dela. Desenhados
  // por cima, tapavam-na; por baixo e mais largos, ficam um halo à volta
  // dela — que é exatamente o que ali há, um cais servido pelas duas coisas.
  // A partir de 11 e não de 9: um anel à volta de nada, a z9, era um ponto
  // cinzento perdido no meio da região.
  expresso: {
    minzoom: 11,
    raios: [
      [11, 5],
      [16, 11],
    ],
    forma: 'anel',
  },
};

const OMISSAO: Regra = {
  minzoom: 12,
  raios: [
    [12, 3],
    [16, 7],
  ],
};

/** A ordem em que as camadas se EMPILHAM: a última fica por cima. Não é a de apresentação. */
const ORDEM = ['expresso', 'paragem', 'urbano-municipal', 'taxi', 'bicicleta', 'estacao'];

/**
 * A ORDEM DE APRESENTAÇÃO, a do §1: a rede da autoridade primeiro, os
 * serviços privados no fim. É a mesma da folha de abertura, que segue a
 * declaração da região.
 */
export const ORDEM_DOS_MODOS = [
  'autocarro',
  'a-pedido',
  'comboio',
  'urbano-municipal',
  'bicicleta',
  'expresso',
  'taxi',
];

/** As placas são claras ou escuras conforme o modo seja da rede ou privado. */
const PRIVADOS = new Set(['taxi', 'expresso']);

export function camadaDe(tipo: string): CamadaDePontos {
  const modo = modoDoTipo(tipo);
  const { minzoom, raios, desbastar, forma = 'ponto' } = CAMADAS_CONHECIDAS[tipo] ?? OMISSAO;
  const cor = COR_DO_MODO[modo] ?? NEUTRA;
  return {
    tipo,
    modo,
    rotulo: NOME_DOS_MODOS[modo] ?? modo,
    cor,
    forma,
    // A placa de um privado é branca com o desenho escuro (§6, neutro); a de
    // um modo da rede é da cor dele, com o desenho a branco.
    fundo: PRIVADOS.has(modo) ? '#ffffff' : cor,
    minzoom,
    raios,
    desbastar: !!desbastar,
    anel: forma === 'anel',
  };
}

/**
 * As camadas que estes pontos justificam, por ordem de EMPILHAMENTO.
 *
 * Deriva-se do que EXISTE e não de uma lista fixa: uma região sem bicicletas
 * não ganha um botão «Bicicleta partilhada» que não liga a nada, e um modo
 * novo aparece sem se tocar aqui. Um tipo desconhecido vai para o fim.
 */
export function camadasDe(tipos: Iterable<string>): CamadaDePontos[] {
  const presentes = [...new Set(tipos)].filter(Boolean);
  presentes.sort((a, b) => {
    const ia = ORDEM.indexOf(a);
    const ib = ORDEM.indexOf(b);
    return (ia < 0 ? ORDEM.length : ia) - (ib < 0 ? ORDEM.length : ib);
  });
  return presentes.map(camadaDe);
}

/**
 * As mesmas camadas, pela ordem em que se MOSTRAM aos olhos: a da região,
 * e na falta dela a do §1.
 *
 * Eram a mesma ordem, e a fila dos filtros abria pelo expresso — o serviço
 * menos usado, e privado — por ser o que se desenha por baixo de tudo (P2-038,
 * P1-011). A ordem de desenho é uma decisão de desenho; a de apresentação é
 * uma hierarquia, e quem a lê lê-a como tal.
 */
export function ordemDeApresentacao(
  camadas: CamadaDePontos[],
  modosDaRegiao: string[] = [],
): CamadaDePontos[] {
  const ordem = [...modosDaRegiao, ...ORDEM_DOS_MODOS.filter((m) => !modosDaRegiao.includes(m))];
  const posicao = (c: CamadaDePontos) => {
    const i = ordem.indexOf(c.modo);
    return i < 0 ? ordem.length : i;
  };
  return [...camadas].sort((a, b) => posicao(a) - posicao(b));
}

/** O raio de uma camada a um zoom, como o MapLibre o interpola — para o esboço. */
export function raioNoZoom(raios: [number, number][], zoom: number): number {
  if (zoom <= raios[0][0]) return raios[0][1];
  for (let i = 1; i < raios.length; i++) {
    const [z0, r0] = raios[i - 1];
    const [z1, r1] = raios[i];
    if (zoom <= z1) return r0 + ((r1 - r0) * (zoom - z0)) / (z1 - z0);
  }
  return raios[raios.length - 1][1];
}

/** Acima disto, a paragem tem serviço a sério e aparece entre o `minzoom` e 13. */
export const PARTIDAS_PARA_APARECER_CEDO = 40;

/**
 * Até onde dois pontos são O MESMO SÍTIO no mapa: a paragem de cada lado da
 * rua, a doca das bicicletas à porta da estação.
 */
const GEMEAS_METROS = 60;
const JUNTO_A_ESTACAO_METROS = 120;

/** O zoom a partir do qual, juntos, se separam o suficiente para se verem os dois. */
export const ZOOM_DE_SEPARAR = 15;

const metros = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 110_540;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
};

const simples = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * O ZOOM A PARTIR DO QUAL CADA PONTO SE DESENHA — e é o que decide quem cede
 * o lugar a quem, onde há dois no mesmo sítio.
 *
 * - **As paragens gémeas.** A da ida e a da volta têm o mesmo nome e ficam
 *   cada uma do seu lado da rua: a z13 eram dois anéis colados, e a rua
 *   parecia ter o dobro das paragens. Até z15 desenha-se a mais servida das
 *   duas; dali para cima, as duas — já se separam.
 * - **O que está à porta de uma estação.** A doca das bicicletas, a praça de
 *   táxis e o cais do urbano empilhavam-se em cima da placa do comboio, e
 *   nenhum se lia. Cedem-lhe o lugar até se separarem.
 * - **O resto das paragens**, como sempre: as mais servidas desde o
 *   `minzoom`, as outras desde 13.
 *
 * Decide-se nos DADOS, e não pela deteção de colisões do MapLibre: essa
 * escondia uma praça de táxis por cair debaixo do nome da vila — e a praça é
 * a informação, o nome é o contexto. Uma regra que se pode testar sem
 * desenhar nada.
 */
export function zoomDeAparecer(pontos: readonly Ponto[]): number[] {
  const lado = 0.002; // ~200 m: uma célula basta para as duas distâncias
  const celula = (p: Ponto) => `${Math.floor(p.lat / lado)}:${Math.floor(p.lon / lado)}`;
  const grelha = new Map<string, number[]>();
  pontos.forEach((p, i) => {
    const c = celula(p);
    const lista = grelha.get(c);
    if (lista) lista.push(i);
    else grelha.set(c, [i]);
  });
  const vizinhos = (p: Ponto): number[] => {
    const [y, x] = [Math.floor(p.lat / lado), Math.floor(p.lon / lado)];
    const saida: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) saida.push(...(grelha.get(`${y + dy}:${x + dx}`) ?? []));
    return saida;
  };
  return pontos.map((p, i) => {
    const c = camadaDe(p.tipo);
    let z = c.minzoom;
    if (c.desbastar && (p.partidas ?? 0) <= PARTIDAS_PARA_APARECER_CEDO) z = Math.max(z, 13);
    if (p.tipo === 'paragem') {
      const nome = simples(p.nome);
      const gemea = vizinhos(p).some((j) => {
        if (j === i) return false;
        const q = pontos[j];
        if (q.tipo !== 'paragem' || simples(q.nome) !== nome) return false;
        if (metros(p, q) > GEMEAS_METROS) return false;
        // Cede a MENOS servida; entre iguais, a que vem depois.
        const [a, b] = [p.partidas ?? 0, q.partidas ?? 0];
        return b > a || (b === a && j < i);
      });
      if (gemea) z = Math.max(z, ZOOM_DE_SEPARAR);
    } else if (p.tipo !== 'estacao' && p.tipo !== 'sitio') {
      const aPorta = vizinhos(p).some(
        (j) => pontos[j].tipo === 'estacao' && metros(p, pontos[j]) <= JUNTO_A_ESTACAO_METROS,
      );
      if (aPorta) z = Math.max(z, ZOOM_DE_SEPARAR);
    }
    return z;
  });
}

/**
 * O nome que o mapa escreve ao lado do ponto. A estação dispensa o
 * «(estação)» que a lista precisa: a placa com o comboio já o diz, e num
 * mapa cada palavra a mais tapa uma rua.
 */
export function rotuloNoMapa(p: Pick<Ponto, 'nome' | 'tipo'>): string {
  if (p.tipo !== 'estacao') return p.nome;
  return p.nome.replace(/\s*\((esta[cç][aã]o|station)\)\s*$/i, '').trim() || p.nome;
}

/**
 * A ÁREA SERVIDA: a caixa das paragens e das estações, sem a ponta de 1 % de
 * cada lado.
 *
 * Não é a caixa da região (`territorio.caixa`): essa é um retângulo à volta
 * de TUDO, com as pontas das linhas que saem do território, e é desenhada à
 * mão com folga. E tira-se a ponta de cada lado porque uma carreira que vai
 * a uma cidade a cinquenta quilómetros põe lá uma paragem — e abrir o mapa
 * a mostrá-la era encolher a região para caber a viagem de uma linha.
 * `null` sem paragens com coordenadas.
 */
export function limitesDaRede(
  pontos: readonly Ponto[],
): [[number, number], [number, number]] | null {
  const daRede = pontos.filter(
    (p) => (p.tipo === 'paragem' || p.tipo === 'estacao') && isFinite(p.lat) && isFinite(p.lon),
  );
  if (daRede.length === 0) return null;
  const lats = daRede.map((p) => p.lat).sort((a, b) => a - b);
  const lons = daRede.map((p) => p.lon).sort((a, b) => a - b);
  const ponta = Math.floor(daRede.length * 0.01);
  const [i, j] = [ponta, daRede.length - 1 - ponta];
  return [
    [lons[i], lats[i]],
    [lons[j], lats[j]],
  ];
}
