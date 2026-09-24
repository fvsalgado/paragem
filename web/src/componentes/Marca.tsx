import { MARCA_ESPESSURA, MARCA_GRELHA, MARCA_TRACOS } from '@/lib/marca';

/**
 * A marca do produto: a bandeirola de uma paragem, em traço.
 *
 * Desenhada inline para herdar a cor do texto e não custar um pedido; e
 * decorativa, porque anda sempre ao lado da palavra «Paragem.pt» — um leitor
 * de ecrã que dissesse «imagem» antes do nome estava a dizer o mesmo duas
 * vezes.
 *
 * Os traços vêm de `lib/marca.ts`, que é de onde o gerador de ícones os lê
 * também: o que está no cabeçalho e o que está no ecrã do telemóvel são o
 * mesmo desenho, e não duas cópias a envelhecer cada uma para seu lado.
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
      fill="none"
      stroke="currentColor"
      strokeWidth={MARCA_ESPESSURA}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {MARCA_TRACOS.map((traco) => (
        <path key={traco} d={traco} />
      ))}
    </svg>
  );
}

/**
 * A marca com o nome ao lado — a assinatura do cabeçalho, do painel e da
 * montra.
 *
 * Um componente, e não três cópias da mesma linha, pelas mesmas razões por
 * que os traços vivem num sítio só. O «.pt» vai num tom abaixo: faz parte do
 * nome, mas o que se lê primeiro é «Paragem». O ponto continua fora da
 * árvore de acessibilidade, como estava.
 *
 * O nome vai numa caixa sua, e não solto ao lado do desenho: o cabeçalho
 * arruma a marca com `flex` e `gap`, e cada pedaço de texto solto seria um
 * item à parte — com um espaço a meio de «Paragem.pt».
 */
export function Assinatura() {
  return (
    <>
      <Marca className="marca-desenho" />
      <span className="marca-nome">
        Paragem
        <span className="marca-pt">
          <span aria-hidden="true">.</span>pt
        </span>
      </span>
    </>
  );
}
