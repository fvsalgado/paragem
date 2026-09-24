/**
 * A marca do produto, escrita uma vez só: a placa de uma paragem a fazer de P.
 *
 * O poste é a haste do P, a placa presa ao poste é a barriga — com os cantos
 * de fora arredondados, como uma placa —, e o que era o buraco do P é a faixa
 * do número da linha, aberta na placa. É a faixa que faz de um P uma paragem;
 * o resto é a letra, sem nada a sobrar. Sozinho, é o ícone; à frente de
 * «aragem.pt», é o logótipo por extenso (`marca-letras.ts`).
 *
 * Duas versões ficaram pelo caminho. A primeira fugia do P e era uma
 * bandeirola ao lado do poste. A segunda tinha a ponta do poste acima da
 * placa e um pé na linha de base, e parecia uma letra partida. E um P claro
 * num quadrado azul é o sinal de estacionamento: em vermelho, e com a faixa
 * aberta, deixa de o ser — a cor do produto e a forma da marca decidiram-se
 * juntas.
 *
 * Tem três leitores, e é por isso que vive aqui e não dentro de um componente:
 * a `Marca`, que a desenha nas páginas a herdar a cor do texto; o
 * `scripts/gerar-icones.mjs`, que a rasteriza para o favicon e para os ícones
 * da aplicação; e o `scripts/gerar-letras.py`, que a leva à escala da letra
 * para o logótipo por extenso. Desenhada duas vezes, era o género de coisa que
 * diverge sem ninguém dar por ela. Levantado do Coreto, que tem o mesmo
 * problema com o coreto dele.
 *
 * Este ficheiro não importa nada, de propósito: o gerador de ícones lê-o com o
 * Node, sem passar pelo Next, e o de letras lê-o como texto.
 */

/** O lado da grelha em que a marca está desenhada. */
export const MARCA_GRELHA = 24;

/**
 * As medidas do P na grelha (y para baixo, como no SVG).
 *
 * TODAS PARES, e isso não é gosto: com as bordas em coordenadas pares, a
 * marca desenhada a meia escala, à escala certa ou a escala e meia — 16, 32 e
 * 48 px, os três tamanhos do favicon — cai em pixéis inteiros, sem cinzento de
 * antialiasing nas bordas. A 16 px, a faixa aberta na placa é uma linha de um
 * pixel, e só se lê porque cai inteira num pixel.
 *
 * As proporções são as do P da Atkinson Hyperlegible Bold, a letra do sítio:
 * a haste tem um quarto da altura das maiúsculas, a barriga dois terços da
 * altura e dois terços da largura. É o que deixa o P desenhado ao lado de
 * «aragem» sem parecer de outra família.
 */
export const MARCA_P = {
  /** O topo da placa — a altura das maiúsculas. */
  maiuscula: 4,
  /** A linha de base, onde assenta o poste. */
  linha_de_base: 20,
  /** A borda esquerda do poste. */
  haste_esquerda: 6,
  /** A borda direita da placa. */
  placa_direita: 20,
} as const;

/**
 * O contorno do P, com a faixa aberta: pinta-se com `fill-rule="evenodd"`.
 *
 * O poste e a placa são UM contorno e não dois retângulos encostados: a
 * escalas fracionárias, duas formas lado a lado deixam uma costura clara entre
 * elas. Só comandos absolutos (M, H, V, A, Z) — é o que o gerador de letras
 * sabe levar à escala da letra.
 */
export const MARCA_P_TRACADO =
  'M6 4H18A2 2 0 0 1 20 6V12A2 2 0 0 1 18 14H10V20H6Z' +
  'M13 8H17A1 1 0 0 1 17 10H13A1 1 0 0 1 13 8Z';

/**
 * Onde começa e acaba a tinta: do poste à borda da placa, e do topo da placa
 * à linha de base. Não está centrada na grelha, e é por isso que o gerador de
 * ícones a desloca em vez de a encostar ao meio da caixa.
 */
export const MARCA_TINTA = {
  esquerda: MARCA_P.haste_esquerda,
  direita: MARCA_P.placa_direita,
  topo: MARCA_P.maiuscula,
  fundo: MARCA_P.linha_de_base,
} as const;

/**
 * A cor do produto: o vermelho do Coreto na montra, que é da mesma casa.
 *
 * É a cor da faixa na página do produto, no painel e em todas as regiões que
 * não declarem a sua — as regiões de prova incluídas —, e é a cor dos ícones,
 * que são um ficheiro só para todos os anfitriões. Uma região que tenha cara
 * própria declara-a no `regiao.yaml` (`cor:`), e a faixa dela veste essa
 * (`lib/faixa.ts`).
 *
 * O que está aqui é a mesma cor para quem não lê CSS — o `theme-color`, o
 * manifesto, os ícones. Quem a mudar aqui muda-a também em `global.css`
 * (`--faixa`): um teste confere que são a mesma.
 */
export const COR_DO_PRODUTO = '#c2281c';

/** A tinta sobre a cor do produto: branco, que dá 5,8:1 sobre o vermelho. */
export const TINTA_DO_PRODUTO = '#ffffff';

/** O papel do sítio (`--fundo`), que é o ecrã de arranque da aplicação instalada. */
export const COR_DO_PAPEL = '#f5f7f4';
