/**
 * A marca do produto, em traços, escrita uma vez só.
 *
 * Uma bandeirola de paragem de traço simples — o poste, a placa que sai dele
 * para um lado, a faixa do número da linha e o pé —, desenhada na mesma
 * grelha de 24 por 24 e com o mesmo traço de 2 px dos ícones do sítio
 * (`componentes/Icones.tsx`). É mais um ícone da família, e não um desenho à
 * parte.
 *
 * Vive aqui, e não dentro do componente que a desenha, porque tem três
 * leitores: a `Marca`, que a põe inline nas páginas a herdar a cor do texto;
 * o `scripts/gerar-icones.mjs`, que a rasteriza para o favicon e para os
 * ícones da aplicação; e o `lib/cartao.tsx`, que a desenha nos cartões de
 * partilha. Desenhada duas vezes, era o género de coisa que diverge sem
 * ninguém dar por ela — e depois o ícone no ecrã do telemóvel deixa de ser a
 * marca que está no cabeçalho. Levantado do Coreto, que é da mesma casa e tem
 * o mesmo problema com o coreto dele.
 *
 * Este ficheiro não importa nada, de propósito: o gerador de ícones lê-o
 * diretamente com o Node, sem passar pelo Next.
 */

/** O lado da grelha em que a marca está desenhada. */
export const MARCA_GRELHA = 24;

/** A espessura do traço, a mesma dos ícones. */
export const MARCA_ESPESSURA = 2;

/**
 * O traço da marca, tal como aparece no sítio.
 *
 * A placa é BAIXA E LARGA, e o poste passa acima dela — e nenhuma das duas
 * coisas é gosto. O primeiro desenho tinha a placa alta e o poste a acabar
 * nela, e lia-se como um «P»; um P claro num quadrado azul é o sinal de
 * estacionamento, que é o último engano que um sítio de transportes pode
 * provocar. A proporção de agora é a das placas das paragens de estrada, e a
 * ponta do poste por cima da placa é o que a separa de uma letra.
 *
 * TODAS AS RETAS ESTÃO EM COORDENADAS ÍMPARES — o poste em `x = 5`, a placa
 * de `y = 5` a `y = 13` com a borda em `x = 21`, a faixa em `y = 9`, o pé em
 * `y = 21` —, e isso também não é gosto. Com um traço de 2 centrado num
 * ímpar, as bordas do traço caem em pixéis inteiros quando a marca se desenha
 * a meia escala, à escala certa ou a escala e meia: 16, 32 e 48 px, que são
 * os três tamanhos do favicon. A primeira versão tinha meios (`21,5`, `8,5`),
 * e a 16 px a placa e a faixa desfaziam-se num cinzento de antialiasing.
 */
export const MARCA_TRACOS = [
  // O poste.
  'M5 21V3',
  // A placa, presa ao poste do lado esquerdo.
  'M5 5h14.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H5',
  // A faixa do número da linha, ao meio da placa.
  'M9 9h8',
  // O pé.
  'M2 21h6',
] as const;

/**
 * Onde começa e acaba a tinta, com o meio traço de cada lado: do pé (`x = 2`)
 * à borda da placa (`x = 21`), e da ponta do poste (`y = 3`) ao pé
 * (`y = 21`). Não está centrada na grelha — sobra mais à direita do que à
 * esquerda —, e é por isso que o gerador de ícones a desloca em vez de a
 * encostar ao meio da caixa.
 */
export const MARCA_TINTA = {
  esquerda: 2 - MARCA_ESPESSURA / 2,
  direita: 21 + MARCA_ESPESSURA / 2,
  topo: 3 - MARCA_ESPESSURA / 2,
  fundo: 21 + MARCA_ESPESSURA / 2,
} as const;

/**
 * As duas cores da faixa, escritas uma vez.
 *
 * São duas porque há dois sítios, como no Coreto. As **regiões** vestem a
 * cor da marca (`--marca`, o azul da rede); a **montra** — a página do
 * produto, em qualquer anfitrião que não é de nenhuma região — e o painel
 * vestem o azul-noite do texto (`--texto`), para quem lá cai perceber que não
 * está no sítio de uma região. Nenhuma das duas é nova: são as do §6 do
 * briefing.
 *
 * O que está aqui é a mesma cor para quem não lê CSS — o `theme-color` que o
 * telemóvel pinta antes de haver folha de estilos, o manifesto, que é JSON, e
 * os ícones, que são imagens. Quem mudar uma cor aqui muda-a também em
 * `global.css`: é o mesmo valor em dois alfabetos.
 */
export const CORES_DA_FAIXA = {
  regiao: '#0a5c7a',
  montra: '#102c3f',
} as const;

/**
 * A tinta da marca sobre a faixa: branco, que dá 7,4:1 sobre o azul da rede e
 * 14,4:1 sobre o azul-noite.
 */
export const TINTA_SOBRE_A_FAIXA = '#ffffff';

/** O papel do sítio (`--fundo`), que é o ecrã de arranque da aplicação instalada. */
export const COR_DO_PAPEL = '#f5f7f4';
