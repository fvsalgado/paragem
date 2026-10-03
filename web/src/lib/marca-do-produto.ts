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

// --- as cores (§6) -------------------------------------------------------------

/** O feixe, de fora para dentro, sobre papel ou branco. */
export const CORES_CLARO = ['#c2281c', '#3f92d4', '#7fbbf7'] as const;
/** O mesmo feixe no tema escuro: um degrau mais claro, para a linha de fora continuar a ≥ 3:1. */
export const CORES_ESCURO = ['#f2573f', '#7ebaf6', '#cbe3ff'] as const;
/** O papel do sítio (§6): o fundo da montra e do azulejo do ícone. */
export const PAPEL = '#f5f7f4';
/** O azul-noite do texto (§6): a marca a uma cor, e o azulejo do ícone nos separadores claros. */
export const AZUL_NOITE = '#102c3f';

// --- a geometria ---------------------------------------------------------------

type Ponto = [number, number, number?];
type Vetor = [number, number];
const sub = (a: Ponto, b: Ponto): Vetor => [a[0] - b[0], a[1] - b[1]];
const comp = (v: Vetor) => Math.hypot(v[0], v[1]);
const unit = (v: Vetor): Vetor => {
  const l = comp(v);
  return [v[0] / l, v[1] / l];
};
const normal = (v: Vetor): Vetor => [-v[1], v[0]];

/** A linha paralela a `pts`, a `d` unidades para o lado esquerdo do sentido do traço. */
function paralela(pts: Ponto[], d: number): Ponto[] {
  if (!d) return pts.map((p) => [p[0], p[1], p[2]]);
  return pts.map((p, i) => {
    const a = i > 0 ? normal(unit(sub(p, pts[i - 1]))) : null;
    const b = i < pts.length - 1 ? normal(unit(sub(pts[i + 1], p))) : null;
    if (!a) return [p[0] + d * b![0], p[1] + d * b![1], p[2]];
    if (!b) return [p[0] + d * a[0], p[1] + d * a[1], p[2]];
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    return [p[0] + (d * (a[0] + b[0])) / k, p[1] + (d * (a[1] + b[1])) / k, p[2]];
  });
}

/**
 * O caminho SVG de um traço, com os cantos arredondados a `R` (um ponto pode
 * trazer o seu raio em terceiro lugar; 0 é canto vivo) e afastado `d` do
 * desenho. O raio de cada linha ajusta-se para as paralelas ficarem
 * concêntricas, que é o que as faz parecer um feixe e não três letras.
 */
function caminho(pts: Ponto[], R: number, d: number): string {
  const q = paralela(pts, d);
  let s = `M${q[0][0].toFixed(2)} ${q[0][1].toFixed(2)}`;
  for (let i = 1; i < q.length - 1; i++) {
    const A = q[i - 1],
      B = q[i],
      C = q[i + 1];
    const u1 = unit(sub(B, A)),
      u2 = unit(sub(C, B));
    const cr = u1[0] * u2[1] - u1[1] * u2[0];
    const phi = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    const R0 = B[2] ?? R;
    if (phi < 1e-3 || R0 <= 0.01) {
      s += `L${B[0].toFixed(2)} ${B[1].toFixed(2)}`;
      continue;
    }
    let r = Math.max(0.3, R0 - d * Math.sign(cr));
    let t = r * Math.tan(phi / 2);
    const lim = Math.min(
      comp(sub(B, A)) * (i === 1 ? 1 : 0.5),
      comp(sub(C, B)) * (i === q.length - 2 ? 1 : 0.5),
    );
    if (t > lim) {
      t = lim;
      r = t / Math.tan(phi / 2);
    }
    const p1 = [B[0] - u1[0] * t, B[1] - u1[1] * t];
    const p2 = [B[0] + u2[0] * t, B[1] + u2[1] * t];
    s +=
      `L${p1[0].toFixed(2)} ${p1[1].toFixed(2)}` +
      `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${cr > 0 ? 1 : 0} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  const z = q[q.length - 1];
  return s + `L${z[0].toFixed(2)} ${z[1].toFixed(2)}`;
}

type Traco = { p: Ponto[]; R?: number; cruza?: boolean };
type Letra = { w: number; s: Traco[] };

/**
 * As letras de «paragem.pt», em unidades de desenho: altura de x 40, haste do
 * «t» a 56, descendentes a 24. Regras do feixe: a primeira cor vai sempre por
 * fora (bojos no sentido dos ponteiros, hastes da esquerda a subir, da direita
 * a descer); os traços que passam por baixo desenham-se primeiro; os bojos
 * param a `k` da haste.
 *
 * O «p» é de um só traço — sobe pela haste e dá a volta ao bojo. Com o bojo
 * solto, ao píxel lia-se «|⊐».
 *
 * O «a» e o «r» encaixam. O gancho do «a» começava rente à esquerda e o braço
 * do «r» era mais comprido, os dois à altura de x: o «a» não se podia chegar ao
 * «r» sem os dois se tocarem lá em cima, e o vão por baixo do braço lia-se
 * como um espaço — «par agem». O gancho começa a um terço da letra e o braço
 * é mais curto: o bojo do «a» entra por baixo dele.
 */
const LETRAS = (k: number): Record<string, Letra> => ({
  p: {
    w: 36,
    s: [
      {
        p: [
          [0, 24],
          [0, -40, 0],
          [36, -40],
          [36, 0],
          [k, 0],
        ],
        R: 20,
      },
    ],
  },
  a: {
    w: 36,
    s: [
      {
        p: [
          [36 - k, 0],
          [0, 0],
          [0, -22],
          [36 - k, -22],
        ],
        R: 11,
      },
      {
        p: [
          [12, -40],
          [36, -40],
          [36, 0],
        ],
        R: 14,
      },
    ],
  },
  r: {
    w: 22,
    s: [
      {
        p: [
          [0, 0],
          [0, -40],
          [22, -40],
        ],
        R: 20,
      },
    ],
  },
  g: {
    w: 36,
    s: [
      {
        p: [
          [36 - k, 0],
          [0, 0],
          [0, -40],
          [36 - k, -40],
        ],
        R: 20,
      },
      {
        p: [
          [36, -40],
          [36, 24],
          [4, 24],
        ],
        R: 14,
      },
    ],
  },
  e: {
    w: 36,
    s: [
      {
        p: [
          [32, 0],
          [0, 0],
          [0, -40],
          [36, -40],
          [36, -20, 0],
          [k, -20],
        ],
        R: 18,
      },
    ],
  },
  m: {
    w: 48,
    s: [
      {
        p: [
          [0, 0],
          [0, -40],
          [24, -40],
          [24, 0],
        ],
        R: 12,
      },
      {
        p: [
          [24 + k, -40],
          [48, -40],
          [48, 0],
        ],
        R: 12,
      },
    ],
  },
  t: {
    w: 28,
    s: [
      {
        p: [
          [28, 0],
          [11, 0],
          [11, -56],
        ],
        R: 12,
      },
      {
        p: [
          [-2, -40],
          [26, -40],
        ],
        cruza: true,
      },
    ],
  },
});

/**
 * As três versões da palavra. O que muda é o traço; a geometria é a mesma.
 *
 * - `feixe`: três linhas de 2,8 com 2,0 de vazio entre elas. A cores, e a uma
 *   cor (sempre três: duas linhas iguais numa cor é a marca da Optibus).
 * - `reduzido`: duas linhas mais grossas, para abaixo de ~65 píxeis de ecrã de
 *   altura, onde o vazio de 2,0 deixava de se ver.
 * - `cheia`: a letra cheia, com a largura do feixe — a uma cor, nesse mesmo
 *   tamanho pequeno, e na assinatura das regiões.
 */
export const VERSOES = {
  feixe: { sp: 4.8, lw: 2.8, n: 3 },
  reduzido: { sp: 7.6, lw: 4.4, n: 2 },
  cheia: { sp: 0, lw: 12.4, n: 1 },
} as const;
export type Versao = keyof typeof VERSOES;

/** A largura das letras (0,8: a estreita) e o intervalo entre elas. */
const XS = 0.8;
const G = 16;

/**
 * O acerto de cada par de letras, em unidades: soma-se ao avanço normal.
 *
 * MEDE-SE, NÃO SE ESCOLHE. Para cada par, o branco médio na altura de x (sem
 * contar o que entra mais de um quarto dessa altura numa letra aberta) fica
 * igual ao de duas hastes seguidas, «ar»; o dos pares com o ponto fica a 1,6
 * vezes isso; e nenhum par fica a menos de 3 unidades de tinta a tinta, nem
 * deixa o halo de uma letra chegar à anterior. Sem isto, o «ra» tinha 1,8
 * vezes o branco das hastes e a palavra lia-se «par agem». Cada versão tem a
 * sua tabela, porque as pontas da letra cheia avançam mais do que as do feixe.
 */
const ACERTOS: Record<Versao, Record<string, number>> = {
  feixe: { pa: -0.7, ra: -15.6, ag: -0.6, ge: 1, em: -0.6, 'm.': -6.8, '.p': -5.4, pt: -6 },
  reduzido: { pa: -1.1, ra: -15.7, ag: -0.9, ge: 0.8, em: -1, 'm.': -7, '.p': -5.9, pt: -5.8 },
  cheia: { pa: -0.7, ra: -10.2, ag: -0.6, em: -0.6, 'm.': -6.8, '.p': -6.8, pt: -3.1 },
};

export type Pintura =
  /** Cores escritas no SVG: para os ficheiros (ícones, imagem de partilha). */
  | { cores: readonly string[]; fundo: string }
  /** Classes em vez de cores (`halo`, `l0`…`l2`, `ponto`): para o sítio, onde o CSS escolhe a cor pelo tema. */
  | { classes: true };

type Desenho = { svg: string; largura: number; meia: number; cap: number };

/**
 * Os traços de um texto. Cada traço leva primeiro um «halo» da cor do fundo,
 * um pouco mais largo do que o feixe — é o que faz um traço passar por baixo
 * do outro onde se cruzam —, e por cima as linhas, cada uma afastada do
 * desenho conforme a sua posição no feixe.
 */
function tracos(txt: string, versao: Versao, pintura: Pintura, xs = XS): Desenho {
  const { sp, lw, n } = VERSOES[versao];
  const meia = ((n - 1) / 2) * sp + lw / 2;
  const k = meia + 1.2;
  const letras = LETRAS(k);
  const acertos = txt.length > 1 ? ACERTOS[versao] : {};
  const halo = (d: string) =>
    'classes' in pintura
      ? `<path class="halo" d="${d}" fill="none" stroke-width="${meia * 2 + 3.6}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="${pintura.fundo}" stroke-width="${meia * 2 + 3.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const linha = (d: string, i: number) =>
    'classes' in pintura
      ? `<path class="l${i}" d="${d}" fill="none" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${d}" fill="none" stroke="${pintura.cores[i]}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let x = 0;
  let svg = '';
  const cs = [...txt];
  cs.forEach((ch, idx) => {
    const par = ch + (cs[idx + 1] ?? '');
    if (ch === '.') {
      const r = meia + 0.6;
      svg +=
        'classes' in pintura
          ? `<circle class="ponto" cx="${(x + r).toFixed(2)}" cy="${-r}" r="${r}"/>`
          : `<circle cx="${(x + r).toFixed(2)}" cy="${-r}" r="${r}" fill="${pintura.cores[0]}"/>`;
      x += 2 * r + G + (acertos[par] ?? 0);
      return;
    }
    const L = letras[ch];
    if (!L) throw new Error(`a marca não tem a letra «${ch}»`);
    for (const { p, R = 0, cruza } of L.s) {
      const pts = p.map((q): Ponto => [q[0] * xs + x, q[1], q[2]]);
      const r = R * Math.min(1, xs);
      if (!cruza) svg += halo(caminho(pts, r, 0));
      for (let i = 0; i < n; i++) svg += linha(caminho(pts, r, (i - (n - 1) / 2) * sp), i);
    }
    x += L.w * xs + G + (acertos[par] ?? 0);
  });
  return { svg, largura: x - G, meia, cap: lw / 2 };
}

/**
 * «paragem.pt» num SVG justo à tinta: da ponta do «t» à descendente, e da
 * linha de fora da primeira haste ao fim do «t».
 */
export function palavra(versao: Versao, pintura: Pintura) {
  const { svg, largura, meia, cap } = tracos('paragem.pt', versao, pintura);
  const x = -meia,
    y = -56 - cap,
    w = largura + cap + meia,
    h = 24 + Math.max(meia, cap) - y;
  return {
    viewBox: `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
    /** Largura sobre altura: a 21 px de altura, a palavra ocupa `21 × proporcao` px. */
    proporcao: w / h,
    corpo: svg,
  };
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
  const L = LETRAS(k).p;
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
