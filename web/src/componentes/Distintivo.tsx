/**
 * O número da linha, com a cor que o feed lhe dá.
 *
 * O §8 manda usar o `route_color` do GTFS «garantindo contraste». **Garantir
 * não é escolher o melhor de dois** — e foi esse o defeito da primeira versão
 * deste ficheiro: escolhia entre texto branco e texto escuro o que
 * contrastasse mais, e dava-se por satisfeita. O `#806db0` da linha 66 ficava
 * com branco por cima a 3,5:1. É ilegível para muita gente e é ilegal para
 * nós (WCAG 2.1 AA pede 4,5:1). O axe apanhou-o em dez linhas.
 *
 * Agora ESCURECE a cor até o branco passar os 4,5:1. A linha continua
 * reconhecível — um roxo escurecido continua roxo —, e o número lê-se.
 */
export default function Distintivo({ codigo, cor }: { codigo: string; cor?: string | null }) {
  const original = normalizar(cor);
  if (!original) {
    return (
      <span className="distintivo" style={{ borderColor: 'var(--linhas)' }}>
        {codigo}
      </span>
    );
  }
  const fundo = comContrasteSuficiente(original);
  return (
    <span
      className="distintivo"
      style={{ background: fundo, color: textoSobre(fundo), borderColor: fundo }}
    >
      {codigo}
    </span>
  );
}

export function normalizar(cor?: string | null): string | null {
  if (!cor) return null;
  const limpa = cor.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(limpa) ? `#${limpa.toLowerCase()}` : null;
}

/** Luminância relativa, como a WCAG a define. */
export function luminancia(hex: string): number {
  const c = hex.replace('#', '');
  const canais = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function textoSobre(fundo: string): string {
  return contraste(fundo, '#ffffff') >= contraste(fundo, '#102c3f') ? '#ffffff' : '#102c3f';
}

export const MINIMO = 4.5;

/**
 * A mesma cor, escurecida ou aclarada até o texto por cima passar os 4,5:1.
 *
 * Tenta primeiro escurecer — quase todas as cores de linha são médias e
 * escurecer preserva melhor a identidade do que aclarar. Se escurecer até ao
 * preto não chegar (não acontece: o preto contra o branco dá 21:1), a cor
 * fica como está e o texto escolhe-se pelo melhor dos dois.
 */
export function comContrasteSuficiente(cor: string): string {
  if (Math.max(contraste(cor, '#ffffff'), contraste(cor, '#102c3f')) >= MINIMO) return cor;

  const c = cor.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  for (let f = 0.95; f >= 0; f -= 0.05) {
    const tentativa =
      '#' +
      rgb
        .map((v) =>
          Math.round(v * f)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    if (contraste(tentativa, '#ffffff') >= MINIMO) return tentativa;
  }
  return '#000000';
}
