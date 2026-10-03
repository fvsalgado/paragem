/**
 * O FEIXE: o traço da marca, para qualquer texto que um endereço possa ter.
 *
 * Linhas paralelas de cores diferentes, como as que partilham a mesma via num
 * mapa de metro (§6). Primeiro desenhou-se só «paragem.pt», e o desenho vivia
 * em `marca-do-produto.ts`. A 3/10/2026 o logótipo de cada região passou a ser
 * o endereço dela no mesmo traço — «demo.paragem.pt», nos tons dela —, e o
 * traço saiu para aqui, com o alfabeto inteiro de um endereço: de `a` a `z`,
 * os algarismos, o hífen e o ponto.
 *
 * DUAS COISAS NÃO SE ESCOLHEM À MÃO:
 *
 *   · a geometria de cada letra segue as regras do feixe (abaixo, `letras`) e,
 *     nas de «paragem.pt», é a que o dono aprovou, tal e qual;
 *   · o espaço entre cada par MEDE-SE (`acerto`). A regra é a que mediu
 *     «paragem.pt» à mão; aplicada aqui aos mesmos pares, dá a tabela medida
 *     com uma diferença máxima de 0,2 unidades, e um teste confere-o.
 *
 * Sem dependências, e só sintaxe que o Node lê tirando os tipos: o gerador das
 * imagens e os testes importam-no tal e qual.
 */

// --- a geometria ---------------------------------------------------------------

export type Ponto = [number, number, number?];
type Vetor = [number, number];
const sub = (a: Ponto | Vetor, b: Ponto | Vetor): Vetor => [a[0] - b[0], a[1] - b[1]];
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

/** Um pedaço de um traço: uma reta, ou um arco com o centro (para se poder medir). */
type Segmento =
  | { t: 'L'; a: Vetor; b: Vetor }
  | { t: 'A'; a: Vetor; b: Vetor; r: number; sweep: 0 | 1; c: Vetor };

/**
 * Os pedaços de um traço, com os cantos arredondados a `R` (um ponto pode
 * trazer o seu raio em terceiro lugar; 0 é canto vivo) e afastado `d` do
 * desenho. O raio de cada linha ajusta-se para as paralelas ficarem
 * concêntricas, que é o que as faz parecer um feixe e não três letras.
 */
function segmentos(pts: Ponto[], R: number, d: number): Segmento[] {
  const q = paralela(pts, d);
  const out: Segmento[] = [];
  let atual: Vetor = [q[0][0], q[0][1]];
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
      out.push({ t: 'L', a: atual, b: [B[0], B[1]] });
      atual = [B[0], B[1]];
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
    const p1: Vetor = [B[0] - u1[0] * t, B[1] - u1[1] * t];
    const p2: Vetor = [B[0] + u2[0] * t, B[1] + u2[1] * t];
    out.push({ t: 'L', a: atual, b: p1 });
    const lado: Vetor = cr > 0 ? [-u1[1], u1[0]] : [u1[1], -u1[0]];
    out.push({
      t: 'A',
      a: p1,
      b: p2,
      r,
      sweep: cr > 0 ? 1 : 0,
      c: [p1[0] + lado[0] * r, p1[1] + lado[1] * r],
    });
    atual = p2;
  }
  const z = q[q.length - 1];
  out.push({ t: 'L', a: atual, b: [z[0], z[1]] });
  return out;
}

/** O caminho SVG de um traço (ver `segmentos`). */
export function caminho(pts: Ponto[], R: number, d: number): string {
  const s = segmentos(pts, R, d);
  let out = `M${s[0].a[0].toFixed(2)} ${s[0].a[1].toFixed(2)}`;
  for (const g of s) {
    out +=
      g.t === 'L'
        ? `L${g.b[0].toFixed(2)} ${g.b[1].toFixed(2)}`
        : `A${g.r.toFixed(2)} ${g.r.toFixed(2)} 0 0 ${g.sweep} ${g.b[0].toFixed(2)} ${g.b[1].toFixed(2)}`;
  }
  return out;
}

/** Pontos ao longo de um traço, de `passo` em `passo` unidades: é o que se mede. */
function amostras(seg: Segmento[], passo = 0.25): Vetor[] {
  const out: Vetor[] = [];
  for (const g of seg) {
    if (g.t === 'L') {
      const n = Math.max(1, Math.ceil(comp(sub(g.b, g.a)) / passo));
      for (let i = 0; i <= n; i++)
        out.push([g.a[0] + ((g.b[0] - g.a[0]) * i) / n, g.a[1] + ((g.b[1] - g.a[1]) * i) / n]);
      continue;
    }
    const a0 = Math.atan2(g.a[1] - g.c[1], g.a[0] - g.c[0]);
    let da = Math.atan2(g.b[1] - g.c[1], g.b[0] - g.c[0]) - a0;
    if (g.sweep === 1) while (da < 0) da += 2 * Math.PI;
    else while (da > 0) da -= 2 * Math.PI;
    if (Math.abs(da) > Math.PI) da = da > 0 ? da - 2 * Math.PI : da + 2 * Math.PI;
    const n = Math.max(2, Math.ceil((Math.abs(da) * g.r) / passo));
    for (let i = 0; i <= n; i++) {
      const an = a0 + (da * i) / n;
      out.push([g.c[0] + g.r * Math.cos(an), g.c[1] + g.r * Math.sin(an)]);
    }
  }
  return out;
}

// --- as letras -----------------------------------------------------------------

export type Traco = { p: Ponto[]; R?: number; cruza?: boolean };
/** Uma letra: o avanço, os traços, e o centro horizontal do ponto, se o tiver. */
export type Letra = { w: number; s: Traco[]; ponto?: number[] };

/** A altura das hastes altas — b, d, f, h, k, l — e o teto da caixa de um endereço. */
export const ALTA = -62;

/**
 * O alfabeto, em unidades de desenho: altura de x 40 (de -40 a 0), haste do
 * «t» a 56, hastes altas a 62, algarismos a 56, descendentes a 24. `k` é onde
 * um bojo para antes da haste — depende da largura do feixe.
 *
 * As regras do feixe: a primeira cor vai sempre por fora (bojos no sentido dos
 * ponteiros, hastes da esquerda a subir, da direita a descer); os traços que
 * passam por baixo desenham-se primeiro; os bojos param a `k` da haste. Onde a
 * letra não deixa — o «s», o «5», o «w» viram duas vezes —, a primeira cor fica
 * por fora na primeira curva e por dentro na segunda, como uma estrada em S.
 *
 * As de «paragem.pt» são as que o dono aprovou e não se mexem: o «p» é de um
 * só traço, porque com o bojo solto se lia «|⊐» ao píxel; o gancho do «a»
 * começa a um terço da letra e o braço do «r» é curto, para o bojo do «a»
 * entrar por baixo dele — sem isso lia-se «par agem».
 *
 * O ponto do «i» e do «j» é o do «.», à altura que deixa o branco mínimo por
 * cima da altura de x. O hífen é curto: em três linhas, um traço comprido
 * lia-se «≡».
 */
export function letras(k: number): Record<string, Letra> {
  return {
    // As de «paragem.pt».
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
    // As de um endereço qualquer.
    b: {
      w: 36,
      s: [
        {
          p: [
            [k, -40],
            [36, -40],
            [36, 0],
            [0, 0, 0],
            [0, ALTA],
          ],
          R: 20,
        },
      ],
    },
    c: {
      w: 34,
      s: [
        {
          p: [
            [32, 0],
            [0, 0],
            [0, -40],
            [32, -40],
          ],
          R: 20,
        },
      ],
    },
    d: {
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
            [36, ALTA],
            [36, 0],
          ],
        },
      ],
    },
    f: {
      w: 26,
      s: [
        {
          p: [
            [10, 0],
            [10, ALTA],
            [26, ALTA],
          ],
          R: 12,
        },
        {
          p: [
            [-2, -40],
            [22, -40],
          ],
          cruza: true,
        },
      ],
    },
    h: {
      w: 36,
      s: [
        {
          p: [
            [0, 0],
            [0, ALTA],
          ],
        },
        {
          p: [
            [k, -40],
            [36, -40],
            [36, 0],
          ],
          R: 16,
        },
      ],
    },
    i: {
      w: 0,
      s: [
        {
          p: [
            [0, 0],
            [0, -40],
          ],
        },
      ],
      ponto: [0],
    },
    j: {
      w: 14,
      s: [
        {
          p: [
            [14, -40],
            [14, 24],
            [-6, 24],
          ],
          R: 12,
        },
      ],
      ponto: [14],
    },
    k: {
      w: 32,
      s: [
        {
          p: [
            [0, 0],
            [0, ALTA],
          ],
        },
        {
          p: [
            [32, 0],
            [12, -18, 0],
            [30, -40],
          ],
        },
      ],
    },
    l: {
      w: 14,
      s: [
        {
          p: [
            [14, 0],
            [0, 0],
            [0, ALTA],
          ],
          R: 12,
        },
      ],
    },
    n: {
      w: 36,
      s: [
        {
          p: [
            [0, 0],
            [0, -40],
            [36, -40],
            [36, 0],
          ],
          R: 18,
        },
      ],
    },
    o: {
      w: 36,
      s: [
        {
          p: [
            [18, -40],
            [36, -40],
            [36, 0],
            [0, 0],
            [0, -40],
            [18, -40],
          ],
          R: 20,
        },
      ],
    },
    q: {
      w: 36,
      s: [
        {
          p: [
            [36 - k, 0],
            [0, 0],
            [0, -40],
            [36, -40, 0],
            [36, 24],
          ],
          R: 20,
        },
      ],
    },
    s: {
      w: 34,
      s: [
        {
          p: [
            [0, 0],
            [34, 0],
            [34, -20],
            [0, -20],
            [0, -40],
            [32, -40],
          ],
          R: 10,
        },
      ],
    },
    u: {
      w: 36,
      s: [
        {
          p: [
            [36, -40],
            [36, 0],
            [0, 0],
            [0, -40],
          ],
          R: 18,
        },
      ],
    },
    v: {
      w: 36,
      s: [
        {
          p: [
            [36, -40],
            [18, 0, 3],
            [0, -40],
          ],
        },
      ],
    },
    w: {
      w: 52,
      s: [
        {
          p: [
            [52, -40],
            [40, 0, 3],
            [26, -30, 3],
            [12, 0, 3],
            [0, -40],
          ],
        },
      ],
    },
    x: {
      w: 34,
      s: [
        {
          p: [
            [34, -40],
            [0, 0],
          ],
        },
        {
          p: [
            [0, -40],
            [34, 0],
          ],
        },
      ],
    },
    y: {
      w: 36,
      s: [
        {
          p: [
            [17, -2],
            [0, -40],
          ],
        },
        {
          p: [
            [36, -40],
            [8, 24],
          ],
        },
      ],
    },
    z: {
      w: 32,
      s: [
        {
          p: [
            [1, -40],
            [32, -40, 0],
            [0, 0, 0],
            [32, 0],
          ],
        },
      ],
    },
    '-': {
      w: 12,
      s: [
        {
          p: [
            [0, -20],
            [12, -20],
          ],
        },
      ],
    },
    '0': {
      w: 32,
      s: [
        {
          p: [
            [16, -56],
            [32, -56],
            [32, 0],
            [0, 0],
            [0, -56],
            [16, -56],
          ],
          R: 16,
        },
      ],
    },
    '1': {
      w: 22,
      s: [
        {
          p: [
            [0, -44],
            [20, -56, 0],
            [20, 0],
          ],
        },
      ],
    },
    '2': {
      w: 32,
      s: [
        {
          p: [
            [0, -44],
            [0, -56],
            [32, -56],
            [32, -32, 6],
            [0, 0, 0],
            [33, 0],
          ],
          R: 12,
        },
      ],
    },
    '3': {
      w: 32,
      s: [
        {
          p: [
            [2, -56],
            [32, -56],
            [32, -28],
            [10, -28],
          ],
          R: 14,
        },
        {
          p: [
            [10, -28],
            [32, -28],
            [32, 0],
            [0, 0],
          ],
          R: 14,
        },
      ],
    },
    '4': {
      w: 34,
      s: [
        {
          p: [
            [34, -16],
            [0, -16, 0],
            [24, -56, 0],
            [24, 0],
          ],
        },
      ],
    },
    '5': {
      w: 32,
      s: [
        {
          p: [
            [30, -56],
            [2, -56, 0],
            [2, -30, 0],
            [32, -30],
            [32, 0],
            [0, 0],
          ],
          R: 14,
        },
      ],
    },
    '6': {
      w: 32,
      s: [
        {
          p: [
            [0, -28],
            [32, -28],
            [32, 0],
            [0, 0],
            [0, -56],
            [28, -56],
          ],
          R: 14,
        },
      ],
    },
    '7': {
      w: 32,
      s: [
        {
          p: [
            [0, -56],
            [32, -56, 0],
            [10, 0],
          ],
        },
      ],
    },
    '8': {
      w: 34,
      s: [
        {
          p: [
            [17, 0],
            [0, 0],
            [0, -28],
            [34, -28],
            [34, 0],
            [17, 0],
          ],
          R: 14,
        },
        {
          p: [
            [16, -28],
            [30, -28],
            [30, -56],
            [3, -56],
            [3, -28],
            [16, -28],
          ],
          R: 12,
        },
      ],
    },
    '9': {
      w: 32,
      s: [
        {
          p: [
            [32, -28],
            [0, -28],
            [0, -56],
            [32, -56],
            [32, 0],
            [4, 0],
          ],
          R: 14,
        },
      ],
    },
  };
}

/** Os caracteres que o feixe sabe desenhar: os de um endereço. */
export const CARACTERES = /^[a-z0-9.-]+$/;

// --- as versões e o espaço -----------------------------------------------------

/**
 * As três versões. O que muda é o traço; a geometria é a mesma.
 *
 * - `feixe`: três linhas de 2,8 com 2,0 de vazio entre elas. A cores, e a uma
 *   cor (sempre três: duas linhas iguais numa cor é a marca da Optibus).
 * - `reduzido`: duas linhas mais grossas, para abaixo de ~65 píxeis de ecrã de
 *   altura, onde o vazio de 2,0 deixava de se ver.
 * - `cheia`: a letra cheia, com a largura do feixe — a uma cor, nesse mesmo
 *   tamanho pequeno.
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
/** O mínimo de tinta a tinta entre duas letras, e o branco dos pares com o ponto. */
const MINIMO = 3;
const F_PONTO = 1.6;

const meiaDe = (versao: Versao) => {
  const { sp, lw, n } = VERSOES[versao];
  return ((n - 1) / 2) * sp + lw / 2;
};
/** O raio do ponto e a altura do ponto do «i»: acima da altura de x, com o branco mínimo. */
function ponto(meia: number) {
  const r = meia + 0.6;
  return { r, cy: -(40 + meia + 3.4 + r) };
}

/**
 * O acerto de «paragem.pt», MEDIDO À MÃO a 3/10/2026, sobre o desenho a cores:
 * é o do logótipo aprovado, e fica escrito para ele não mudar nem uma décima.
 * Os outros pares calculam-se (`acerto`), pela mesma regra.
 */
const MEDIDOS: Record<Versao, Record<string, number>> = {
  feixe: { pa: -0.7, ra: -15.6, ag: -0.6, ge: 1, em: -0.6, 'm.': -6.8, '.p': -5.4, pt: -6 },
  reduzido: { pa: -1.1, ra: -15.7, ag: -0.9, ge: 0.8, em: -1, 'm.': -7, '.p': -5.9, pt: -5.8 },
  cheia: { pa: -0.7, ra: -10.2, ag: -0.6, em: -0.6, 'm.': -6.8, '.p': -6.8, pt: -3.1 },
};

// Os perfis de cada letra: onde está a tinta mais à esquerda e mais à direita
// em cada altura, de quarto em quarto de unidade.
const Y0 = -80;
const PASSO = 0.25;
const LINHAS = Math.round((40 - Y0) / PASSO) + 1;
type Lados = { esq: (number | null)[]; dir: (number | null)[] };
type Perfil = Lados & { halo: Lados; w: number };

function vazio(): Lados {
  return { esq: new Array(LINHAS).fill(null), dir: new Array(LINHAS).fill(null) };
}
/** Um disco de raio `rho` em `(x, y)`, posto nos lados de cada altura que toca. */
function disco(l: Lados, x: number, y: number, rho: number) {
  const j0 = Math.max(0, Math.ceil((y - rho - Y0) / PASSO));
  const j1 = Math.min(LINHAS - 1, Math.floor((y + rho - Y0) / PASSO));
  for (let j = j0; j <= j1; j++) {
    const dy = Y0 + j * PASSO - y;
    const dx = Math.sqrt(Math.max(0, rho * rho - dy * dy));
    const e = l.esq[j];
    const d = l.dir[j];
    if (e === null || x - dx < e) l.esq[j] = x - dx;
    if (d === null || x + dx > d) l.dir[j] = x + dx;
  }
}

const perfis = new Map<string, Perfil>();
function perfil(ch: string, versao: Versao): Perfil {
  const chave = `${versao}|${ch}`;
  const guardado = perfis.get(chave);
  if (guardado) return guardado;
  const { sp, lw, n } = VERSOES[versao];
  const meia = meiaDe(versao);
  const tinta = vazio();
  const halo = vazio();
  let w: number;
  if (ch === '.') {
    const r = meia + 0.6;
    disco(tinta, r, -r, r);
    disco(halo, r, -r, r);
    w = 2 * r;
  } else {
    const L = letras(meia + 1.2)[ch];
    if (!L) throw new Error(`o feixe não tem a letra «${ch}»`);
    for (const { p, R = 0, cruza } of L.s) {
      const pts = p.map((q): Ponto => [q[0] * XS, q[1], q[2]]);
      const r = R * Math.min(1, XS);
      for (let i = 0; i < n; i++)
        for (const [x, y] of amostras(segmentos(pts, r, (i - (n - 1) / 2) * sp)))
          disco(tinta, x, y, lw / 2);
      if (!cruza)
        for (const [x, y] of amostras(segmentos(pts, r, 0))) disco(halo, x, y, meia + 1.8);
    }
    for (const px of L.ponto ?? []) {
      const { r, cy } = ponto(meia);
      disco(tinta, px * XS, cy, r);
      disco(halo, px * XS, cy, r);
    }
    w = L.w * XS;
  }
  if (ch === '-') {
    // O HÍFEN CONTA COMO UMA HASTE da altura de x. É curto e fino, e a regra
    // do branco médio deixava-o entrar na boca de um «c», debaixo da barra de
    // um «z» ou no ângulo de um «k» — sempre a mais de 3 unidades de tinta,
    // e sempre a ler-se como parte da letra: «c-» dava um «e», e «z-» um «ƶ».
    // Como haste, fica onde ficaria um «l»: fora da letra do lado.
    const esq = Math.min(...tinta.esq.filter((v): v is number => v !== null));
    const dir = Math.max(...tinta.dir.filter((v): v is number => v !== null));
    for (let j = Math.round((-40 - meia - Y0) / PASSO); j <= Math.round((meia - Y0) / PASSO); j++) {
      tinta.esq[j] = esq;
      tinta.dir[j] = dir;
    }
  }
  const out = { ...tinta, halo, w };
  perfis.set(chave, out);
  return out;
}

/**
 * O branco entre duas letras com a segunda na origem da primeira: o médio na
 * altura de x (o que entra mais de um quarto dessa altura numa letra aberta
 * conta como se não entrasse), o mais pequeno de tinta a tinta, e o mais
 * pequeno entre a tinta da primeira e o halo da segunda.
 */
function brancos(a: Perfil, b: Perfil, meia: number) {
  const ja = Math.round((-40 - meia - Y0) / PASSO);
  const jb = Math.round((meia - Y0) / PASSO);
  const fundo = 0.25 * (40 + 2 * meia);
  let maxDir = -Infinity;
  let minEsq = Infinity;
  for (let j = ja; j <= jb; j++) {
    const d = a.dir[j];
    const e = b.esq[j];
    if (d !== null) maxDir = Math.max(maxDir, d);
    if (e !== null) minEsq = Math.min(minEsq, e);
  }
  let perto = Infinity;
  let halo = Infinity;
  for (let j = 0; j < LINHAS; j++) {
    const d = a.dir[j];
    const e = b.esq[j];
    const h = b.halo.esq[j];
    if (d !== null && e !== null) perto = Math.min(perto, e - d);
    if (d !== null && h !== null) halo = Math.min(halo, h - d);
  }
  let soma = 0;
  for (let j = ja; j <= jb; j++) {
    const d = a.dir[j];
    const e = b.esq[j];
    const r = d === null ? maxDir - fundo : Math.max(d, maxDir - fundo);
    const l = e === null ? minEsq + fundo : Math.min(e, minEsq + fundo);
    soma += l - r;
  }
  return { media: soma / (jb - ja + 1), perto, halo };
}

const referencias = new Map<Versao, number>();
/**
 * O acerto calculado de um par, em unidades: soma-se ao avanço normal. O
 * branco médio fica igual ao de duas hastes seguidas («ar», sem acerto); o
 * dos pares com o ponto fica a 1,6 vezes isso; e nenhum par fica a menos de 3
 * unidades de tinta a tinta, nem deixa o halo de uma letra chegar à anterior.
 */
export function acertoCalculado(x: string, y: string, versao: Versao): number {
  const meia = meiaDe(versao);
  let ref = referencias.get(versao);
  if (ref === undefined) {
    const a = perfil('a', versao);
    ref = a.w + G + brancos(a, perfil('r', versao), meia).media;
    referencias.set(versao, ref);
  }
  const a = perfil(x, versao);
  const b = perfil(y, versao);
  const { media, perto, halo } = brancos(a, b, meia);
  const d0 = a.w + G;
  const alvo = x === '.' || y === '.' ? ref * F_PONTO : ref;
  const d = Math.max(alvo - media, MINIMO - perto, 0.6 - halo);
  return Math.round((d - d0) * 10) / 10;
}

/** O acerto de um par: o medido, se for um de «paragem.pt»; senão, o calculado. */
export function acerto(x: string, y: string, versao: Versao): number {
  return MEDIDOS[versao][x + y] ?? acertoCalculado(x, y, versao);
}

/**
 * O branco que fica entre duas letras já acertadas, em unidades: o mais
 * estreito de tinta a tinta, e o mais estreito entre a tinta da primeira e o
 * halo da segunda. É o que os testes conferem em todos os pares — as regras
 * do `acertoCalculado` não se veem a olho, e um par mal acertado num endereço
 * novo não aparece em nenhum ecrã antes de uma região o ter.
 */
export function brancoDoPar(x: string, y: string, versao: Versao) {
  const a = perfil(x, versao);
  const { perto, halo } = brancos(a, perfil(y, versao), meiaDe(versao));
  const avanco = a.w + G + acerto(x, y, versao);
  return { tinta: perto + avanco, halo: halo + avanco };
}

// --- o desenho -----------------------------------------------------------------

export type Pintura =
  /** Cores escritas no SVG: para os ficheiros (ícones, imagens de partilha). */
  | { cores: readonly string[]; fundo: string }
  /** Classes em vez de cores (`halo`, `l0`…`l2`, `ponto`): para o sítio, onde o CSS escolhe a cor pelo tema. */
  | { classes: true }
  /**
   * As cores nas variáveis de CSS de quem mostra o desenho (`--feixe-1`…
   * `--feixe-3`, e o fundo): para o ficheiro que o sítio usa por `<use>`
   * (`ficheiroDoEndereco`), onde as classes da página não chegam e as
   * variáveis sim. O resto do traço vem do grupo que embrulha o desenho.
   */
  | { variaveis: true };

type Desenho = { svg: string; largura: number; meia: number; cap: number };

/**
 * Os traços de um texto. Cada traço leva primeiro um «halo» da cor do fundo,
 * um pouco mais largo do que o feixe — é o que faz um traço passar por baixo
 * do outro onde se cruzam —, e por cima as linhas, cada uma afastada do
 * desenho conforme a sua posição no feixe.
 */
export function tracos(txt: string, versao: Versao, pintura: Pintura): Desenho {
  const { sp, lw, n } = VERSOES[versao];
  const meia = meiaDe(versao);
  const tabela = letras(meia + 1.2);
  const halo = (d: string) =>
    'variaveis' in pintura
      ? `<path d="${d}" stroke-width="${meia * 2 + 3.6}" style="stroke:var(--fundo-da-marca,var(--superficie))"/>`
      : 'classes' in pintura
        ? `<path class="halo" d="${d}" fill="none" stroke-width="${meia * 2 + 3.6}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="none" stroke="${pintura.fundo}" stroke-width="${meia * 2 + 3.6}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const linha = (d: string, i: number) =>
    'variaveis' in pintura
      ? `<path d="${d}" style="stroke:var(--feixe-${i + 1})"/>`
      : 'classes' in pintura
        ? `<path class="l${i}" d="${d}" fill="none" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="none" stroke="${pintura.cores[i]}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const circulo = (cx: number, cy: number, r: number) =>
    'variaveis' in pintura
      ? `<circle cx="${cx.toFixed(2)}" cy="${cy}" r="${r}" style="fill:var(--feixe-1)"/>`
      : 'classes' in pintura
        ? `<circle class="ponto" cx="${cx.toFixed(2)}" cy="${cy}" r="${r}"/>`
        : `<circle cx="${cx.toFixed(2)}" cy="${cy}" r="${r}" fill="${pintura.cores[0]}"/>`;
  let x = 0;
  let svg = '';
  const cs = [...txt];
  cs.forEach((ch, idx) => {
    const seguinte = cs[idx + 1];
    const ac = seguinte === undefined ? 0 : acerto(ch, seguinte, versao);
    if (ch === '.') {
      const r = meia + 0.6;
      svg += circulo(x + r, -r, r);
      x += 2 * r + G + ac;
      return;
    }
    const L = tabela[ch];
    if (!L) throw new Error(`o feixe não tem a letra «${ch}»`);
    for (const { p, R = 0, cruza } of L.s) {
      const pts = p.map((q): Ponto => [q[0] * XS + x, q[1], q[2]]);
      const r = R * Math.min(1, XS);
      if (!cruza) svg += halo(caminho(pts, r, 0));
      for (let i = 0; i < n; i++) svg += linha(caminho(pts, r, (i - (n - 1) / 2) * sp), i);
    }
    for (const px of L.ponto ?? []) {
      const { r, cy } = ponto(meia);
      svg += circulo(x + px * XS, Number(cy.toFixed(2)), r);
    }
    x += L.w * XS + G + ac;
  });
  return { svg, largura: x - G, meia, cap: lw / 2 };
}

/**
 * Um texto num SVG justo à tinta na horizontal, e com a altura fixa de uma
 * caixa: do `topo` (as hastes altas, por omissão) à descendente. A altura não
 * depende do texto: dois endereços ao mesmo tamanho de letra ficam com a
 * mesma altura de x.
 */
export function texto(txt: string, versao: Versao, pintura: Pintura, topo = ALTA) {
  const { svg, largura, meia, cap } = tracos(txt, versao, pintura);
  const x = -meia,
    y = topo - cap,
    w = largura + cap + meia,
    h = 24 + Math.max(meia, cap) - y;
  return {
    viewBox: `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`,
    /** Largura sobre altura: a 21 px de altura, o texto ocupa `21 × proporcao` px. */
    proporcao: w / h,
    corpo: svg,
  };
}

/**
 * Um endereço já desenhado nas duas versões do sítio, como um componente do
 * navegador o recebe: o endereço, as caixas, e a versão do ficheiro onde está
 * o desenho (`ficheiroDoEndereco`) — o desenho em si não vem.
 */
export type EnderecoDesenhado = {
  endereco: string;
  /** Muda quando o desenho muda: vai no caminho do ficheiro, que por isso pode ficar em cache para sempre. */
  versao: string;
  inteira: { viewBox: string };
  reduzida: { viewBox: string };
};

/**
 * Se o feixe tem as letras todas deste endereço. Sem isso — dados de antes de
 * o domínio ser declarado, ou um carácter que o alfabeto não tem —, a região
 * assina com o nome em texto, e não com um endereço a que faltam letras.
 */
export function desenhavel(endereco: string | null | undefined): endereco is string {
  return !!endereco && CARACTERES.test(endereco);
}

/** Os ids das duas versões dentro do ficheiro, e a do motor que cada uma é. */
export const VERSOES_DO_ENDERECO = { inteira: 'feixe', reduzida: 'reduzido' } as const;

/**
 * O FICHEIRO DO LOGÓTIPO DE UMA REGIÃO: as duas versões do endereço, cada uma
 * num grupo com o seu `id`, para a página as usar por `<use>`.
 *
 * Ia dentro de cada página, e saía caro: as duas versões, e o Next manda tudo
 * o que o servidor desenha outra vez nos dados de hidratação — quatro cópias,
 * 60 KB em bruto, mais de metade do HTML de «A rede», em todas as páginas da
 * região. Num ficheiro à parte, com a versão no caminho, desce uma vez e fica
 * na cache do navegador. As cores não vêm escritas: são as variáveis de CSS
 * da página (`.sitio-da-regiao`), que atravessam o `<use>` — e com elas o
 * tema escuro e o fundo de cada sítio onde o logótipo aparece.
 */
export function ficheiroDoEndereco(endereco: string): string {
  const grupos = Object.entries(VERSOES_DO_ENDERECO).map(([id, versao]) => {
    const { lw } = VERSOES[versao];
    const { svg } = tracos(endereco, versao, { variaveis: true });
    return `<g id="${id}" fill="none" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round">${svg}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">${grupos.join('')}</svg>`;
}

/** Um resumo curto de um texto (FNV-1a, 32 bits): a versão do ficheiro, sem depender do Node. */
function resumo(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * O endereço de uma região pronto para o componente que o mostra: as caixas
 * das duas versões, e a versão do ficheiro onde está o desenho
 * (`ficheiroDoEndereco`). O componente não precisa deste módulo — o mapa e o
 * menu correm no navegador. `null` para um endereço que o feixe não sabe
 * desenhar (um domínio com acentos, por exemplo): quem o recebe escreve o nome.
 */
export function desenharEndereco(endereco: string | null | undefined): EnderecoDesenhado | null {
  if (!desenhavel(endereco)) return null;
  const caixa = (versao: Versao) => ({
    viewBox: texto(endereco, versao, { variaveis: true }).viewBox,
  });
  return {
    endereco,
    versao: resumo(ficheiroDoEndereco(endereco)),
    inteira: caixa(VERSOES_DO_ENDERECO.inteira),
    reduzida: caixa(VERSOES_DO_ENDERECO.reduzida),
  };
}
