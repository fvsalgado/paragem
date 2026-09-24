import { MARCA_GRELHA, MARCA_P_TRACADO } from '@/lib/marca';
import {
  LETRAS_ALTURA,
  LETRAS_ARAGEM,
  LETRAS_LARGURA,
  LETRAS_P,
  LETRAS_PT,
} from '@/lib/marca-letras';

/**
 * A marca sozinha: a placa da paragem a fazer de P.
 *
 * Desenhada inline para herdar a cor do texto e não custar um pedido; e
 * decorativa, porque anda sempre ao lado do nome ou dentro de uma ligação que
 * o diz — um leitor de ecrã que dissesse «imagem» antes estava a dizer o mesmo
 * duas vezes.
 *
 * O traçado vem de `lib/marca.ts`, que é de onde o gerador de ícones o lê
 * também: o que está na página e o que está no ecrã do telemóvel são o mesmo
 * desenho.
 */
export default function Marca({
  tamanho = 24,
  className,
}: {
  tamanho?: number;
  className?: string;
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${MARCA_GRELHA} ${MARCA_GRELHA}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path fillRule="evenodd" d={MARCA_P_TRACADO} />
    </svg>
  );
}

/**
 * O logótipo por extenso — «Paragem.pt», com a placa a fazer de P —, a
 * assinatura do cabeçalho, do painel e da montra.
 *
 * É desenho e não texto (`lib/marca-letras.ts`, gerado da letra do sítio): o P
 * desenhado tem de assentar na linha de base de «aragem» ao meio pixel, e isso
 * só é certo se as letras também forem contorno. O nome continua a estar lá
 * como texto, escondido à vista e lido pelo leitor de ecrã — com o ponto fora
 * da árvore de acessibilidade, como sempre esteve.
 *
 * A altura mede-se em `em`, no CSS (`.marca-assinatura`): o logótipo cresce
 * com a letra de quem a aumenta, como o texto à volta.
 */
export function Assinatura() {
  return (
    <>
      <svg
        viewBox={`0 0 ${LETRAS_LARGURA} ${LETRAS_ALTURA}`}
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className="marca-assinatura"
      >
        <path fillRule="evenodd" d={LETRAS_P} />
        <path d={LETRAS_ARAGEM} />
        <path d={LETRAS_PT} />
      </svg>
      <span className="so-para-leitores">
        Paragem<span aria-hidden="true">.</span>pt
      </span>
    </>
  );
}
