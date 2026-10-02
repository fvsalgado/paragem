import { contraste, MINIMO, normalizar } from '@/lib/cor';

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
/**
 * A COR DE UM MODO QUANDO A LINHA NÃO TRAZ A SUA. Um comboio sem `route_color`
 * saía num distintivo BRANCO — o desenho neutro, que o §6 reserva aos
 * privados (expressos, táxis) — ao lado das pastilhas coloridas da rede: na
 * estação, os comboios pareciam o serviço de outra casa. O comboio tem cor no
 * §6, e é essa (o planeador já a usava nas direções).
 */
const COR_DO_MODO: Record<string, string> = { comboio: '#3f4852' };

export default function Distintivo({
  codigo,
  cor,
  modo,
  tamanho = 'pequeno',
}: {
  codigo: string;
  cor?: string | null;
  /** O modo da linha: dá a cor do §6 a uma linha que não traz a sua. */
  modo?: string;
  /**
   * UM SÓ DESENHO, EM TRÊS TAMANHOS. Havia dois para a mesma coisa — este,
   * nas tabelas, e um `.linha-distintivo` no cartão do mapa, com outra letra,
   * outro raio e sem o contraste garantido — e no título da linha o número
   * ficava com 12 px numa letra de 28. O número É a linha: manda onde está.
   *
   * - `pequeno`: listas, ao lado de um nome;
   * - `medio`: quadros de partidas e cartões, onde é o que se procura;
   * - `grande`: o título da página da linha.
   */
  tamanho?: 'pequeno' | 'medio' | 'grande';
}) {
  const classe = tamanho === 'pequeno' ? 'distintivo' : `distintivo ${tamanho}`;
  const original = normalizar(cor) ?? (modo ? (COR_DO_MODO[modo] ?? null) : null);
  if (!original) {
    return (
      // SEM COR CONHECIDA, NEUTRO — mas com fundo e contorno: sem eles, o
      // número de uma linha sem `route_color` lia-se como texto solto ao lado
      // das pastilhas coloridas das outras.
      <span
        className={classe}
        style={{ background: '#fff', color: 'var(--texto)', borderColor: 'var(--borda-campo)' }}
      >
        {codigo}
      </span>
    );
  }
  const fundo = comContrasteSuficiente(original);
  return (
    <span
      className={classe}
      style={{ background: fundo, color: textoSobre(fundo), borderColor: fundo }}
    >
      {codigo}
    </span>
  );
}

/**
 * A cor da linha para desenhar o PERCURSO sobre o fundo claro da página.
 *
 * É a mesma do distintivo, e pela mesma razão: o `comContrasteSuficiente`
 * escurece-a até o branco passar os 4,5:1 por cima dela — e uma cor que dá
 * 4,5:1 contra o branco dá mais de 3:1 contra o fundo da página, que é o que
 * a WCAG 1.4.11 pede a um traço que diz alguma coisa. Um fio amarelo-claro num
 * fundo claro não se via; escurecido, continua amarelo e vê-se.
 */
export function corDoTraco(cor?: string | null): string {
  const original = normalizar(cor);
  return original ? comContrasteSuficiente(original) : 'var(--marca)';
}

export function textoSobre(fundo: string): string {
  return contraste(fundo, '#ffffff') >= contraste(fundo, '#102c3f') ? '#ffffff' : '#102c3f';
}

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
