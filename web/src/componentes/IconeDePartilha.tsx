/**
 * O ÍCONE DE PARTILHAR, num ficheiro só seu: uma caixa com a seta a sair dela,
 * como nos telemóveis. É o mesmo traço dos outros (`Icones.tsx`, que o
 * reexporta) — 2 px, pontas redondas, a cor do texto à volta — e é
 * `aria-hidden`, como todos: o que ele ilustra está escrito ao lado.
 *
 * Está à parte por causa do peso. Um módulo vai inteiro para cada página que
 * o use, com todos os ícones que alguma página do sítio usa; o botão de
 * partilhar, numa página que não tinha mais ícone nenhum, levava-os todos.
 */
export default function IconeDePartilha({
  tamanho = 20,
  className,
}: {
  tamanho?: number;
  className?: string;
}) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 11v8.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V11" />
    </svg>
  );
}
