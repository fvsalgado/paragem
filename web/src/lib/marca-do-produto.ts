/**
 * A MARCA DO PRODUTO — o feixe —, num sítio só.
 *
 * «paragem.pt» desenhado por linhas paralelas de cores diferentes, como as
 * linhas que partilham a mesma via num mapa de metro: vermelha por fora (o
 * produto) e dois azuis por dentro (a rede). O «p» é o ícone. Escolhida a
 * 3/10/2026, a direção C do catálogo da marca; as regras estão no §6 do
 * briefing.
 *
 * TUDO SAI DAQUI: o cabeçalho da montra e o do painel (`MarcaDoProduto.tsx`),
 * o `app/icon.svg`, o `favicon.ico`, os ícones do ecrã principal e a imagem de
 * partilha (`scripts/imagens-do-produto.mjs`). Desenhá-la duas vezes à mão era
 * garantir que um dia as duas diziam coisas diferentes — e o
 * `marca-do-produto.test.mts` confere que o `icon.svg` é o que este ficheiro
 * desenha.
 *
 * Sem dependências, e só sintaxe que o Node lê tirando os tipos: o gerador das
 * imagens importa-o tal e qual.
 */

// A geometria, as letras e o espaço entre elas vivem em `feixe.ts`, que desenha
// qualquer endereço no mesmo traço — o logótipo de cada região é o endereço
// dela. O que é só do produto fica aqui: as cores, a palavra e o ícone.
import { caminho, letras, texto, VERSOES, type Pintura, type Ponto, type Versao } from './feixe.ts';
export { VERSOES, type Pintura, type Versao };

// --- as cores (§6) -------------------------------------------------------------

/** O feixe, de fora para dentro, sobre papel ou branco. */
export const CORES_CLARO = ['#c2281c', '#3f92d4', '#7fbbf7'] as const;
/** O mesmo feixe no tema escuro: um degrau mais claro, para a linha de fora continuar a ≥ 3:1. */
export const CORES_ESCURO = ['#f2573f', '#7ebaf6', '#cbe3ff'] as const;
/** O papel do sítio (§6): o fundo da montra e do azulejo do ícone. */
export const PAPEL = '#f5f7f4';
/** O azul-noite do texto (§6): a marca a uma cor, e o azulejo do ícone nos separadores claros. */
export const AZUL_NOITE = '#102c3f';

// --- a palavra -----------------------------------------------------------------

/**
 * «paragem.pt» num SVG justo à tinta: da ponta do «t» à descendente, e da
 * linha de fora da primeira haste ao fim do «t». A palavra não tem hastes
 * altas, e por isso a caixa fecha no «t» e não na altura de um endereço
 * (`ALTA`, em `feixe.ts`): a marca do produto fica do tamanho que tinha.
 */
export function palavra(versao: Versao, pintura: Pintura) {
  return texto('paragem.pt', versao, pintura, -56);
}

// --- o ícone -------------------------------------------------------------------

/** O «p» grande, para 180 px e acima: mais largo e com um feixe mais pesado, para encher o azulejo. */
const ICONE_GRANDE = { xs: 1.35, sp: 6.8, lw: 4 };

/**
 * O «p» vetorial num azulejo de papel, para o ecrã principal (180, 192, 512).
 * `cantos`: o azulejo redondo com transparência à volta, para onde o desenho
 * fica tal e qual; sem cantos e a cheio, para onde o sistema recorta à sua
 * maneira (o iOS, e a máscara do Android). `escala`: a fração do azulejo que o
 * «p» ocupa — 0,84 normal, 0,7 dentro da zona segura da máscara.
 */
export function iconeVetorial({ cantos = true, escala = 0.84 } = {}): string {
  const { sp, lw } = ICONE_GRANDE;
  const n = 3;
  const meia = ((n - 1) / 2) * sp + lw / 2;
  const k = meia + 1.2;
  const L = letras(k).p;
  let g = '';
  for (const { p, R = 0 } of L.s) {
    const pts = p.map((q): Ponto => [q[0] * ICONE_GRANDE.xs, q[1], q[2]]);
    g += `<path d="${caminho(pts, R, 0)}" fill="none" stroke="${PAPEL}" stroke-width="${meia * 2 + 3.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
    for (let i = 0; i < n; i++)
      g += `<path d="${caminho(pts, R, (i - (n - 1) / 2) * sp)}" fill="none" stroke="${CORES_CLARO[i]}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // O centro ótico: a caixa do «p» vai da altura de x à descendente.
  const w = 36 * ICONE_GRANDE.xs;
  const tx = 50 - (w * escala) / 2;
  const ty = 50 + 8 * escala;
  const azulejo = cantos
    ? `<rect width="100" height="100" rx="22" fill="${PAPEL}"/>`
    : `<rect width="100" height="100" fill="${PAPEL}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${azulejo}<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${escala})">${g}</g></svg>`;
}

/**
 * O «p» DESENHADO AO PÍXEL, para 16, 32 e 48 px. Reduzir o desenho grande não
 * serve: a 16 px o vazio entre linhas fica abaixo de um píxel e nenhum píxel
 * da letra chega a 3:1. Aqui cada píxel é decidido pelo centro, sem
 * antisserrilhado, e tem exatamente a cor da sua linha: duas linhas de píxel
 * inteiro, com o vazio igual à linha.
 */
export const GRELHAS = {
  16: { N: 16, x0: 3, y0: 2, n: 2, w: 1, g: 1, sg: 1, bw: 6, xh: 8, yd: 13, r: 2.5, rx: 3.5 },
  32: { N: 32, x0: 6, y0: 4, n: 2, w: 2, g: 2, sg: 2, bw: 13, xh: 17, yd: 27, r: 5, rx: 7 },
  48: { N: 48, x0: 9, y0: 7, n: 2, w: 3, g: 3, sg: 3, bw: 19, xh: 25, yd: 41, r: 8, rx: 10.5 },
} as const;
export type Lado = keyof typeof GRELHAS;

/**
 * Os dois azulejos do ícone pequeno. Num separador claro, o papel funde-se com
 * a barra do navegador (só 21 % do ícone se destaca a 3:1) e o azul-noite
 * destaca-se (91,5 %); num escuro é ao contrário (87,5 % e 21 %). Por isso o
 * `icon.svg` troca de azulejo com o tema, e o `favicon.ico`, que não pode,
 * leva o azul-noite, que é o da barra clara.
 */
export const AZULEJOS = {
  papel: { fundo: PAPEL, cores: [CORES_CLARO[0], CORES_CLARO[1]] },
  noite: { fundo: AZUL_NOITE, cores: [CORES_ESCURO[0], CORES_ESCURO[1]] },
} as const;
export type Azulejo = keyof typeof AZULEJOS;

/** A grelha do «p»: −1 é vazio, 0 e 1 são a linha de fora e a de dentro. */
export function grelhaDoP(lado: Lado): number[][] {
  const { N, x0, y0, n, w, g, sg, bw, xh, yd, r } = GRELHAS[lado];
  const grade = Array.from({ length: N }, () => Array<number>(N).fill(-1));
  const pinta = (x: number, y: number, i: number) => {
    if (x >= 0 && y >= 0 && x < N && y < N) grade[y][x] = i;
  };
  const feixe = n * w + (n - 1) * g;
  const xstop = x0 + feixe + sg; // onde o bojo fecha, em baixo
  const xr = xstop + bw; // a aresta de fora, à direita (exclusiva)
  const yb = y0 + xh; // a aresta de fora, em baixo (exclusiva)
  const dentro = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    rr: number,
  ) => {
    if (px < ax || px > bx || py < ay || py > by) return false;
    if (rr <= 0) return true;
    const cx = bx - rr;
    for (const cy of [ay + rr, by - rr]) {
      const emCanto = px > cx && (cy === ay + rr ? py < cy : py > cy);
      if (emCanto) {
        const dx = px - cx,
          dy = py - cy;
        if (dx * dx + dy * dy > rr * rr) return false;
      }
    }
    return true;
  };
  // Cada linha sobe pela haste e dá a volta ao bojo no sentido dos ponteiros,
  // sem se interromper: a primeira cor fica por fora em todo o percurso.
  for (let i = 0; i < n; i++) {
    const d = i * (w + g);
    const rr0 = Math.max(0, r - d),
      rr1 = Math.max(0, r - d - w);
    for (let y = y0 + d; y <= yd; y++)
      for (let x = x0 + d; x < xr; x++) {
        const px = x + 0.5,
          py = y + 0.5;
        if (x < x0 + d + w) {
          pinta(x, y, i); // a coluna da própria haste, até à descendente
          continue;
        }
        const fora = dentro(px, py, x0 + d, y0 + d, xr - d, yb - d, rr0);
        const dent = dentro(px, py, x0 + d + w, y0 + d + w, xr - d - w, yb - d - w, rr1);
        if (!fora || dent) continue;
        if (py > yb - d - w && x < xstop) continue; // a faixa de baixo do bojo só a partir de xstop
        pinta(x, y, i);
      }
  }
  return grade;
}

/** Os retângulos de uma grelha, linha a linha, com as cores dadas (ou com classes, se `cores` for nulo). */
function retangulos(grade: number[][], cores: readonly string[] | null): string {
  let s = '';
  grade.forEach((linha, y) => {
    let x = 0;
    while (x < linha.length) {
      const i = linha[x];
      if (i < 0) {
        x++;
        continue;
      }
      let x2 = x;
      while (x2 < linha.length && linha[x2] === i) x2++;
      s += cores
        ? `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${cores[i]}"/>`
        : `<rect class="l${i}" x="${x}" y="${y}" width="${x2 - x}" height="1"/>`;
      x = x2;
    }
  });
  return s;
}

/** O ícone ao píxel, num azulejo, para um PNG (o `favicon.ico`). */
export function iconeAoPixel(lado: Lado, azulejo: Azulejo): string {
  const { N, rx } = GRELHAS[lado];
  const { fundo, cores } = AZULEJOS[azulejo];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    `<rect width="${N}" height="${N}" rx="${rx}" fill="${fundo}" shape-rendering="geometricPrecision"/>` +
    retangulos(grelhaDoP(lado), cores) +
    `</svg>`
  );
}

/**
 * O `app/icon.svg`: o ícone de 16 px ao píxel, que troca de azulejo com o
 * tema do navegador. Os navegadores leem o `prefers-color-scheme` dentro do
 * ícone pelo tema deles; os que não leem SVG ficam com o `favicon.ico`.
 */
export function iconeDoSeparador(): string {
  const { N, rx } = GRELHAS[16];
  const [p0, p1] = AZULEJOS.papel.cores;
  const [n0, n1] = AZULEJOS.noite.cores;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">\n` +
    `  <!-- O ícone da Paragem.pt: o «p» do feixe, desenhado ao píxel. GERADO por\n` +
    `       scripts/imagens-do-produto.mjs a partir de src/lib/marca-do-produto.ts —\n` +
    `       não se edita à mão. Azul-noite num separador claro, papel num escuro. -->\n` +
    `  <style>.azulejo{fill:${AZULEJOS.noite.fundo}}.l0{fill:${n0}}.l1{fill:${n1}}` +
    `@media (prefers-color-scheme:dark){.azulejo{fill:${AZULEJOS.papel.fundo}}.l0{fill:${p0}}.l1{fill:${p1}}}</style>\n` +
    `  <rect class="azulejo" width="${N}" height="${N}" rx="${rx}" shape-rendering="geometricPrecision"/>\n` +
    `  ${retangulos(grelhaDoP(16), null)}\n` +
    `</svg>\n`
  );
}
