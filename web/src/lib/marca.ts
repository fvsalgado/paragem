/**
 * A MARCA DA REGIÃO, como o sítio a mostra: o logótipo-endereço e as réguas
 * do cabeçalho e do rodapé, a assinatura da folha do mapa e a do menu, as
 * cores dos botões e das ligações, e os cartões de partilha.
 *
 * O sítio de uma autoridade de transportes é dela, e não do fornecedor
 * (P4-008): a primeira coisa do cabeçalho é a região — o endereço dela em
 * feixe, nos tons dela (§6) —, e «Paragem.pt» vai para o rodapé, discreto. A
 * cor e o logótipo são dados da região (`cor:` e `logotipo:` no
 * `regiao.yaml`), validados no pipeline (`pipeline/src/paragem/marca.py`);
 * os três tons do feixe tiram-se da cor, aqui (`feixeDaRegiao`).
 *
 * AQUI NÃO SE CONFIA NO QUE VEIO ESCRITO: um `regiao.json` de antes disto não
 * traz marca nenhuma, e um estragado podia trazer uma cor que não é cor. Nos
 * dois casos fica a do §6 — o azul dos autocarros da rede —, que é o que uma
 * região sem marca declarada mostra de qualquer maneira. Qualquer cor que seja
 * cor serve: os três tons tiram-se dela, e esses leem-se sempre.
 *
 * Até 3/10/2026 a cor pintava uma faixa com o nome da rede por cima, e uma cor
 * que não se lesse com branco nem com o azul-escuro do texto ficava a do
 * produto. A faixa saiu, e a regra com ela (`pipeline/src/paragem/marca.py`).
 */
import { deLch, lab, normalizar } from './cor.ts';
import { desenharEndereco, type EnderecoDesenhado } from './feixe.ts';
import type { Regiao } from './formato';

/** A cor da marca do §6 — a de quem não declara a sua. */
export const COR_DO_PRODUTO = '#0a5c7a';

/**
 * O feixe de uma região: as três linhas do logótipo, de fora para dentro, nos
 * dois temas (`feixeDaRegiao`).
 */
export type Feixe = { claro: [string, string, string]; escuro: [string, string, string] };

export type Marca = {
  /** A cor que a região declara, tal e qual: a da barra do navegador. */
  cor: string;
  /** As três linhas do logótipo-endereço, e das réguas do sítio, nos tons da região. */
  feixe: Feixe;
  /** O caminho do logótipo no armazém da região (`marca/logotipo-….svg`), ou `null`. */
  logotipo: string | null;
  /** Largura sobre altura do logótipo, para lhe guardar o lugar antes de ele chegar. */
  logotipoProporcao: number | null;
  /** Se a cor é da região, ou a do produto por omissão. */
  propria: boolean;
};

/** Só um caminho do armazém da própria região, com o nome que o pipeline lhe dá. */
const LOGOTIPO = /^marca\/logotipo-[0-9a-f]+\.(svg|png|webp)$/;

export function marcaDaRegiao(r: Pick<Regiao, 'marca'>): Marca {
  const m = r.marca;
  const logotipo = typeof m?.logotipo === 'string' && LOGOTIPO.test(m.logotipo) ? m.logotipo : null;
  const p = m?.logotipo_proporcao;
  const logotipoProporcao = typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  const cor = normalizar(m?.cor);
  if (!cor) {
    return {
      cor: COR_DO_PRODUTO,
      feixe: feixeDaRegiao(COR_DO_PRODUTO),
      logotipo,
      logotipoProporcao,
      propria: false,
    };
  }
  return {
    cor,
    feixe: feixeDaRegiao(cor),
    logotipo,
    logotipoProporcao,
    propria: m?.propria === true,
  };
}

/**
 * AS LUMINOSIDADES DO FEIXE (L*), de fora para dentro: as do do produto
 * (42,9 · 58,4 · 74,0 no claro; 58,1 · 73,7 · 89,3 no escuro), arredondadas
 * para cada degrau ficar acima dos 15 que o §6 pede mesmo depois de a cor
 * se arredondar ao `#rrggbb`.
 */
const L_CLARO = [42, 58, 74] as const;
const L_ESCURO = [58.5, 74.5, 90.5] as const;

/**
 * OS TRÊS TONS DE UMA REGIÃO, tirados da cor que ela declara: o tom dela, com
 * as luminosidades do feixe do produto. Uma região declara uma cor e não três —
 * pedir-lhe três era pedir-lhe um desenho que ela não tem —, e assim cumpre
 * as mesmas regras sem ninguém as fazer à mão: a linha de fora a ≥ 3:1 em
 * cada fundo (fica perto dos 6:1) e as vizinhas a ≥ 15 de L*, para se
 * distinguirem em cinzento e com daltonismo (§6).
 *
 * O croma é o da região, entre um mínimo — para uma cor quase cinzenta não
 * dar três cinzentos que parecem desligados — e um máximo; e menos nos tons
 * claros, onde o sRGB não aguenta croma alto. Uma região cinzenta de
 * propósito fica cinzenta.
 */
export function feixeDaRegiao(cor: string): Feixe {
  const [, a, b] = lab(normalizar(cor) ?? COR_DO_PRODUTO);
  const tom = Math.atan2(b, a);
  const C = Math.hypot(a, b);
  const croma = (L: number) => {
    const base = C < 8 ? C : Math.max(24, Math.min(C, 70));
    return base * (L > 80 ? 0.55 : L > 70 ? 0.8 : 1);
  };
  const tons = (Ls: readonly number[]) =>
    Ls.map((L) => deLch(L, croma(L), tom)) as [string, string, string];
  return { claro: tons(L_CLARO), escuro: tons(L_ESCURO) };
}

/** A cor um degrau mais escura: a do botão por baixo do ponteiro. */
export function maisEscura(cor: string, degrau = 9): string {
  const [L, a, b] = lab(cor);
  return deLch(L - degrau, Math.hypot(a, b), Math.atan2(b, a));
}

/**
 * AS CORES DA REGIÃO NAS PÁGINAS DELA, como propriedades de CSS para o
 * invólucro (`app/[regiao]/layout.tsx`); o `global.css` escolhe as do tema.
 *
 * O feixe pinta o logótipo-endereço e as réguas. A linha de fora — a mais
 * escura, perto dos 6:1 sobre branco — é a cor dos botões e das ligações, como
 * o azul do feixe o é na página do produto; no tema escuro, as ligações
 * passam à linha do meio do feixe escuro, que se lê sobre o fundo escuro.
 */
export function estiloDaRegiao(m: Marca): Record<string, string> {
  return {
    '--regiao-feixe-1': m.feixe.claro[0],
    '--regiao-feixe-2': m.feixe.claro[1],
    '--regiao-feixe-3': m.feixe.claro[2],
    '--regiao-feixe-escuro-1': m.feixe.escuro[0],
    '--regiao-feixe-escuro-2': m.feixe.escuro[1],
    '--regiao-feixe-escuro-3': m.feixe.escuro[2],
    '--regiao-marca': m.feixe.claro[0],
    '--regiao-marca-hover': maisEscura(m.feixe.claro[0]),
  };
}

/**
 * Os dois nomes da assinatura: a REDE, que é a marca que quem viaja conhece
 * («Rede Ameno»), e por baixo dela o que é («Transportes das Terras do
 * Ameno»). Uma região que não declare rede assina só com a segunda.
 */
export function nomesDaAssinatura(r: Pick<Regiao, 'rede' | 'de'>): {
  principal: string;
  secundario: string | null;
} {
  const transportes = `Transportes ${r.de}`;
  const rede = r.rede?.nome?.trim();
  return rede
    ? { principal: rede, secundario: transportes }
    : { principal: transportes, secundario: null };
}

/** A assinatura inteira de uma região: os dois nomes e o logótipo-endereço já desenhado. */
export type Assinatura = {
  principal: string;
  secundario: string | null;
  endereco: EnderecoDesenhado | null;
};

/**
 * A ASSINATURA COMO O SÍTIO A MOSTRA: o endereço da região em feixe, e por
 * baixo o que ela é («Transportes das Terras do Ameno»). Os nomes ficam para
 * quando não há endereço que se desenhe — dados de antes de o domínio ser
 * publicado, ou um domínio com caracteres que o feixe não tem —, e aí a
 * assinatura é a de texto, como era.
 */
export function assinaturaDaRegiao(r: Pick<Regiao, 'rede' | 'de' | 'dominio'>): Assinatura {
  return { ...nomesDaAssinatura(r), endereco: desenharEndereco(r.dominio) };
}
