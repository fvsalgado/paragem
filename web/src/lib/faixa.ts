/**
 * A cor da faixa de uma região, e a tinta que vai por cima dela.
 *
 * Uma região pode ter cara própria — a cor da autoridade de transportes,
 * declarada no `regiao.yaml` (`cor:`) — ou vestir a do produto, que é o que
 * fazem todas as que não a declaram. A tinta NÃO se declara: escolhe-se aqui,
 * entre o branco e o texto do sítio, a que contrastar mais. Uma cor clara,
 * como o turquesa, leva tinta escura; o vermelho do produto leva branco. E se
 * nenhuma das duas chegar aos 4,5:1 — um cinzento médio, um verde de
 * garrafa —, a cor escurece até o branco passar, como os números das linhas
 * (`componentes/Distintivo.tsx`). Quem escreve o YAML escolhe a cara; o sítio
 * garante que se lê.
 */
import { COR_DO_PRODUTO, TINTA_DO_PRODUTO } from './marca.ts';

export type Faixa = { fundo: string; tinta: string };

export const FAIXA_DO_PRODUTO: Faixa = { fundo: COR_DO_PRODUTO, tinta: TINTA_DO_PRODUTO };

const BRANCO = '#ffffff';
const TEXTO = '#102c3f';
const MINIMO = 4.5;

/** A contraste da WCAG 2.1 entre duas cores `#rrggbb`. */
export function contraste(a: string, b: string): number {
  const luminancia = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function faixaDaRegiao(r: { cor?: string | null } | null | undefined): Faixa {
  const cor = r?.cor?.trim().toLowerCase();
  if (!cor || !/^#[0-9a-f]{6}$/.test(cor)) return FAIXA_DO_PRODUTO;

  const melhor = contraste(cor, BRANCO) >= contraste(cor, TEXTO) ? BRANCO : TEXTO;
  if (contraste(cor, melhor) >= MINIMO) return { fundo: cor, tinta: melhor };

  // Nenhuma das duas chega: escurece-se a cor até o branco passar. Continua a
  // ser a cor da região — um turquesa escurecido continua turquesa.
  const canais = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16));
  for (let f = 0.95; f > 0; f -= 0.05) {
    const escura = `#${canais
      .map((v) =>
        Math.round(v * f)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
    if (contraste(escura, BRANCO) >= MINIMO) return { fundo: escura, tinta: BRANCO };
  }
  return FAIXA_DO_PRODUTO;
}

/**
 * As variáveis de CSS que pintam a faixa, para pôr no `style` de um invólucro:
 * o cabeçalho, o menu do mapa e o que mais vestir a cor da região herdam-nas.
 */
export function estiloDaFaixa(f: Faixa): Record<string, string> {
  return { '--faixa': f.fundo, '--sobre-faixa': f.tinta };
}
