/**
 * As contas do esquema de uma linha (`EsquemaDaLinha.tsx`): a projeção, e onde
 * pôr o nome de cada ponta para o traço não lhe passar por cima.
 *
 * Puras e sem React, para se testarem.
 */

export type Caixa = { x0: number; y0: number; x1: number; y1: number };
export type Rotulo = { x: number; y: number; ancora: 'start' | 'middle' | 'end'; caixa: Caixa };

/** A altura de uma letra do nome, e a largura média de cada uma — nas unidades do desenho. */
export const ALTURA_DO_NOME = 11;
const LARGURA_POR_LETRA = 6.1;

/** A largura que um nome ocupa no desenho, por estimativa: não há medidor de texto no servidor. */
export const larguraDoNome = (nome: string) => nome.length * LARGURA_POR_LETRA;

function cruza(a: number[], b: number[], c: Caixa): boolean {
  const dentro = (p: number[]) => p[0] >= c.x0 && p[0] <= c.x1 && p[1] >= c.y0 && p[1] <= c.y1;
  if (dentro(a) || dentro(b)) return true;
  // O segmento corta algum dos quatro lados?
  const lados: [number[], number[]][] = [
    [
      [c.x0, c.y0],
      [c.x1, c.y0],
    ],
    [
      [c.x1, c.y0],
      [c.x1, c.y1],
    ],
    [
      [c.x1, c.y1],
      [c.x0, c.y1],
    ],
    [
      [c.x0, c.y1],
      [c.x0, c.y0],
    ],
  ];
  const lado = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return lados.some(([p, q]) => lado(a, b, p) !== lado(a, b, q) && lado(p, q, a) !== lado(p, q, b));
}

const sobrepoe = (a: Caixa, b: Caixa) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * ONDE POR O NOME DE UMA PONTA: à direita, à esquerda, por cima, por baixo ou
 * nas diagonais — o lugar onde o traço passa menos vezes, dentro do desenho e
 * sem tapar o nome da outra ponta.
 *
 * O nome ia sempre para o lado de dentro do desenho, e na linha medida ficava
 * atravessado pelo traço e pelas bolinhas das paragens (auditoria de 1/11/2026,
 * #13). O halo na cor do fundo disfarçava, mas um traço de 4 px vê-se por
 * entre as letras.
 */
export function rotuloDaPonta(
  ponto: number[],
  nome: string,
  tracado: number[][],
  largura: number,
  altura: number,
  ocupadas: Caixa[] = [],
): Rotulo {
  const w = larguraDoNome(nome);
  const h = ALTURA_DO_NOME;
  const [x, y] = ponto;
  const folga = 7;
  // Cada candidato: o ponto da linha de base do texto e a âncora.
  const candidatos: { x: number; y: number; ancora: Rotulo['ancora'] }[] = [
    { x: x + folga, y: y + h / 2 - 1, ancora: 'start' },
    { x: x - folga, y: y + h / 2 - 1, ancora: 'end' },
    { x, y: y - folga, ancora: 'middle' },
    { x, y: y + folga + h - 2, ancora: 'middle' },
    { x: x + folga, y: y - folga, ancora: 'start' },
    { x: x - folga, y: y - folga, ancora: 'end' },
    { x: x + folga, y: y + folga + h - 2, ancora: 'start' },
    { x: x - folga, y: y + folga + h - 2, ancora: 'end' },
    // E nas faixas de cima e de baixo do desenho, onde o traço não chega
    // (`EsquemaDaLinha` deixa-lhe essa margem): mais longe da ponta, mas
    // sempre livres. Servem quando a ponta está num nó apertado do percurso.
    { x, y: h + 2, ancora: 'middle' },
    { x, y: altura - 4, ancora: 'middle' },
  ];
  const caixaDe = (c: (typeof candidatos)[number]): Caixa => {
    const x0 = c.ancora === 'start' ? c.x : c.ancora === 'end' ? c.x - w : c.x - w / 2;
    return { x0: x0 - 2, x1: x0 + w + 2, y0: c.y - h + 1, y1: c.y + 3 };
  };
  // Por cima e por baixo, o nome centrado na ponta — encostado para dentro
  // quando não cabe centrado.
  for (const c of candidatos) {
    if (c.ancora === 'middle') c.x = Math.min(Math.max(c.x, w / 2 + 3), largura - w / 2 - 3);
  }
  let melhor: Rotulo | null = null;
  let menor = Infinity;
  for (const c of candidatos) {
    const caixa = caixaDe(c);
    let custo = 0;
    if (caixa.x0 < 0 || caixa.x1 > largura || caixa.y0 < 0 || caixa.y1 > altura) custo += 1000;
    if (ocupadas.some((o) => sobrepoe(o, caixa))) custo += 500;
    for (let i = 1; i < tracado.length; i++)
      if (cruza(tracado[i - 1], tracado[i], caixa)) custo += 10;
    // Quanto mais longe da ponta, pior: um nome perto e livre ganha a um longe.
    custo += Math.hypot((caixa.x0 + caixa.x1) / 2 - x, (caixa.y0 + caixa.y1) / 2 - y) / 8;
    if (custo < menor) {
      menor = custo;
      melhor = { ...c, caixa };
    }
  }
  return melhor!;
}
