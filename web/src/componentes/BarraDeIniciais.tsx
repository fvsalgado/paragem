'use client';

import { useEffect, useRef } from 'react';
import Link from '@/componentes/Ligacao';

/**
 * A BARRA DAS INICIAIS, no alto de cada página de letra (auditoria de
 * 1/11/2026, #108): no fim da letra A, a 27 ecrãs de telemóvel, a única saída
 * era voltar ao índice.
 *
 * Num telemóvel é uma fila só, que desliza para o lado (`global.css`). A
 * letra de agora tem de estar à vista quando a página abre — numa fila que
 * começa no A, a do M ficava fora do ecrã —, e é por isso que isto é um
 * componente do navegador: ao abrir, a fila desliza até ela. Sem JavaScript a
 * fila fica no princípio, e continua a deslizar à mão.
 */
export default function BarraDeIniciais({
  letras,
  atual,
}: {
  letras: { letra: string; href: string }[];
  atual: string;
}) {
  const fila = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = fila.current;
    const esta = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !esta || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollLeft = Math.max(0, esta.offsetLeft - ul.offsetLeft - ul.clientWidth / 2);
  }, [atual]);
  return (
    <nav aria-label="Iniciais" className="grelha-de-iniciais compacta">
      <ul ref={fila}>
        {letras.map(({ letra, href }) => (
          <li key={letra}>
            <Link
              href={href}
              aria-current={letra === atual ? 'page' : undefined}
              aria-label={letra === '#' ? 'Começam por número' : undefined}
            >
              {letra}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
