import { NOME_DOS_MODOS } from '@/lib/formato';

/**
 * As camadas de pontos do mapa: uma por modo, e nada de específico a uma região.
 *
 * O `tipo` de cada ponto vem do pipeline e é o MODO tal como a região o
 * declara — «bicicleta», «taxi», «urbano-municipal» — com duas exceções
 * herdadas: as paragens da rede própria vêm como `paragem` e as estações de
 * comboio como `estacao`, porque já se chamavam assim antes de haver modos no
 * mapa. O `MODO_DO_TIPO` traduz essas duas e mais nada.
 *
 * **Uma região que declare um modo que nunca vimos ganha camada na mesma.**
 * Sem cor declarada fica a neutra, que é o que o §8 manda para os serviços
 * privados, e o botão do filtro fica com o nome do modo. É o mesmo contrato
 * dos leitores do pipeline: quem trata da forma trata de qualquer região.
 *
 * AS CORES ESTÃO DUPLICADAS AQUI, e não é por distração. O `global.css` tem-nas
 * como variáveis CSS (§8) e é lá que a interface as lê; o MapLibre pinta numa
 * tela e não resolve `var(--bicicleta)`. São os mesmos valores, e se um mudar
 * tem de mudar nos dois — está escrito nos dois sítios por isso mesmo.
 */

const MODO_DO_TIPO: Record<string, string> = { paragem: 'autocarro', estacao: 'comboio' };

/** Serviços privados sem cor de modo (§8): cartão neutro, ponto neutro. */
const NEUTRA = '#4a5c66';

const COR_DO_MODO: Record<string, string> = {
  autocarro: '#0a5c7a',
  comboio: '#3f4852',
  bicicleta: '#2d6a3e',
  'urbano-municipal': '#5b3a8e',
  'a-pedido': '#8a5300',
};

export type CamadaDePontos = {
  /** O valor de `tipo` nos pontos, e o identificador da camada no mapa. */
  tipo: string;
  /** O que o botão do filtro diz. */
  rotulo: string;
  cor: string;
  /** A partir de que zoom aparece. */
  minzoom: number;
  /** O raio do círculo ao aparecer e a z16. */
  raio: [number, number];
  /**
   * Se, entre o `minzoom` e 13, só aparecem os pontos mais servidos.
   *
   * Vale para as 2 392 paragens e para mais nada: 81 estações de bicicletas
   * ou 9 praças de táxi não tapam mapa nenhum, e desbastá-las escondia
   * exatamente o que quem liga o filtro está a procurar.
   */
  desbastar: boolean;
  /**
   * Desenha-se como ANEL — recheio branco e contorno da cor — e não como disco.
   *
   * É para o que fica por baixo de outro ponto no mesmo sítio. Um disco
   * grande e escuro debaixo da paragem lia-se como uma mancha e tapava-a;
   * um anel lê-se como o que é: uma marca à volta de um sítio que já lá
   * estava, a dizer que ali para mais alguma coisa.
   */
  anel: boolean;
};

/**
 * Cada camada aparece ao zoom a que se torna ÚTIL, e não todas ao mesmo.
 *
 * As 2 392 paragens vistas de cima são uma nuvem azul que tapa as estradas e
 * os rios, e a esse zoom não se distingue uma da outra — por isso só a partir
 * de 11, e entre 11 e 13 só as que têm serviço a sério. As 27 estações são
 * poucas e são marcos: aparecem cedo, a 9, e maiores. As 81 estações de
 * bicicletas e as 9 praças de táxi decidem-se a pé, e a pé anda-se com o mapa
 * perto: 12.
 */
type Regra = { minzoom: number; raio: [number, number]; desbastar?: boolean; anel?: boolean };

const CAMADAS_CONHECIDAS: Record<string, Regra> = {
  estacao: { minzoom: 9, raio: [4, 10] },
  paragem: { minzoom: 11, raio: [2, 6], desbastar: true },
  bicicleta: { minzoom: 11, raio: [3, 8] },
  'urbano-municipal': { minzoom: 12, raio: [3, 7] },
  taxi: { minzoom: 12, raio: [3, 7] },
  // OS CAIS DOS EXPRESSOS SÃO GRANDES E FICAM POR BAIXO, e as duas coisas
  // andam juntas. São uma mão-cheia de pontos numa região e caem praticamente
  // em cima da paragem da rede — medidos entre 19 e 36 metros dela. Desenhados
  // por cima, tapavam-na: a cidade com mais autocarros ficava sem um único
  // ponto azul. Desenhados por baixo e mais largos, ficam um halo à volta dela
  // — que é exatamente o que ali há, um cais servido pelas duas coisas.
  expresso: { minzoom: 9, raio: [5, 11], anel: true },
};

const OMISSAO: Regra = { minzoom: 12, raio: [3, 7] };

/** A ordem em que as camadas se empilham: a última fica por cima. */
const ORDEM = ['expresso', 'paragem', 'urbano-municipal', 'taxi', 'bicicleta', 'estacao'];

export function camadaDe(tipo: string): CamadaDePontos {
  const modo = MODO_DO_TIPO[tipo] ?? tipo;
  const { minzoom, raio, desbastar, anel } = CAMADAS_CONHECIDAS[tipo] ?? OMISSAO;
  return {
    tipo,
    rotulo: NOME_DOS_MODOS[modo] ?? modo,
    cor: COR_DO_MODO[modo] ?? NEUTRA,
    minzoom,
    raio,
    desbastar: !!desbastar,
    anel: !!anel,
  };
}

/**
 * As camadas que estes pontos justificam, por ordem de empilhamento.
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
