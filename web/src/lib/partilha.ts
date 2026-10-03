/**
 * OS CARTÕES DE PARTILHA — a imagem que o WhatsApp, o Facebook ou um email
 * mostram ao lado de uma ligação —, sem o desenho: os endereços, a medida e as
 * contas de texto. O desenho está em `cartao.tsx`, que só corre no servidor;
 * isto é o que as páginas e os testes leem.
 *
 * UM CARTÃO É DA REGIÃO, e não do produto. O sítio de uma autoridade de
 * transportes é dela (P4-008): partilhar a paragem dela mostrava o cartão de
 * vendas da Paragem.pt, com o vermelho do produto, que nas regiões não entra
 * (§6). O cartão de uma região tem o logótipo dela — o endereço em feixe, nos
 * tons dela — e a régua de três linhas, como o cabeçalho; o produto assina
 * por baixo, discreto.
 *
 * Os cartões são rotas do sítio, e não a convenção `opengraph-image` do Next:
 * a convenção cunha o endereço a partir do caminho INTERNO, com a região lá
 * dentro, e saía um `og:image` em `/<regiao>/…`, que do lado de fora é
 * `/<regiao>/<regiao>/…` e dá 404. Aqui cada cartão tem um endereço público,
 * e o middleware leva-o à região como leva as páginas.
 */
import { seguro } from './formato.ts';

/** O que as redes recortam: 1200 × 630, a proporção que toda a gente usa. */
export const CARTAO = { largura: 1200, altura: 630 } as const;

/** O cartão de uma região — o de qualquer página dela que não tenha o seu. */
export const CARTAO_DA_REGIAO = '/cartao.png';

/** O cartão de uma paragem, pelo `stop_id` tal como vem (como `urlDaParagem`). */
export const cartaoDaParagem = (stopId: string): string => `/cartao/paragens/${seguro(stopId)}.png`;

/** O cartão de uma linha, pelo identificador da página dela. */
export const cartaoDaLinha = (id: string): string => `/cartao/linhas/${seguro(id)}.png`;

/**
 * O identificador que vem no endereço de um cartão — o `<id>.png` das duas
 * funções de cima —, ou `null` se não for um: só o que `seguro` deixa passar,
 * e a extensão. Um endereço torto responde 404 sem ir ao armazém.
 */
export function idDoCartao(segmento: string): string | null {
  return /^([a-zA-Z0-9_-]+)\.png$/.exec(segmento)?.[1] ?? null;
}

/** Corta um texto na última palavra que cabe, com reticências. */
export function encurtar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * O corpo do título encolhe com o comprimento — em degraus, e não num
 * cálculo contínuo: um título curto enche o cartão e um longo continua a
 * caber, e a diferença entre 64 e 66 píxeis ninguém a vê.
 */
export function corpoDoTitulo(titulo: string): number {
  if (titulo.length <= 18) return 88;
  if (titulo.length <= 32) return 72;
  if (titulo.length <= 56) return 58;
  return 48;
}
