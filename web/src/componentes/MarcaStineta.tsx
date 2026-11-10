import { useId } from 'react';

/**
 * A marca da Stineta: dois cristais de sal-gema, a uma cor.
 *
 * Pinta-se com a cor do texto à volta (`currentColor`): dentro de uma ligação
 * é a cor da ligação, no tema claro e no escuro, na página do produto e na de
 * cada região. As arestas de dentro não são traços por cima — são recortadas
 * com uma máscara, e por isso a marca serve sobre qualquer fundo sem saber
 * qual é.
 *
 * UMA MÁSCARA POR MARCA, com um identificador só dela: duas marcas na mesma
 * página com o mesmo `id` recortavam as duas pela primeira. O do `useId` traz
 * caracteres que partem o `url(#…)`, e limpa-se.
 *
 * Decorativa: quem a usa escreve o nome ao lado, para os leitores de ecrã.
 */
export default function MarcaStineta({ className = 'marca-stineta' }: { className?: string }) {
  const id = `marca-stineta${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="4.3 4.1 21.3 26" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <rect width="32" height="32" fill="#fff" />
          <path
            d="M4.59 14.2 13.6 19.4 22.61 14.2M13.6 19.4V29.8M15.92 7.1 20.6 9.8 25.28 7.1M20.6 9.8V15.2"
            fill="none"
            stroke="#000"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill="currentColor">
        <path d="M13.6 9 22.61 14.2V24.6L13.6 29.8 4.59 24.6V14.2Z" />
        <path d="M20.6 4.4 25.28 7.1V12.5L20.6 15.2 15.92 12.5V7.1Z" />
      </g>
    </svg>
  );
}
