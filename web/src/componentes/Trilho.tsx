'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import { degrausDoTrilho } from '@/lib/trilho';

/**
 * O TRILHO DAS PÁGINAS DA REDE: «A rede › Paragens», por cima do título.
 *
 * Nas páginas fundas — uma paragem, uma linha, uma estação, um concelho — o
 * cabeçalho só tinha «Mapa» e «A rede», e voltar um nível acima era ir ao
 * fundo da página ou ao botão de voltar do navegador (auditoria de 1/11/2026,
 * #84 e #102). O trilho diz onde se está e leva ao nível de cima.
 *
 * SÓ OS NÍVEIS DE CIMA, e não a página em que se está: o nome dela é o título
 * que vem logo a seguir, e repeti-lo era dizer a mesma coisa duas vezes a quem
 * lê com o leitor de ecrã. Os degraus saem dos segmentos do endereço por baixo
 * de `/rede/` (`lib/trilho.ts`): o trilho vive no invólucro da rede e não
 * precisa de que cada página se lembre dele.
 */
export default function Trilho() {
  const degraus = degrausDoTrilho(useSelectedLayoutSegments());
  if (!degraus.length) return null;
  return (
    <nav aria-label="Onde está" className="trilho">
      <ol>
        {degraus.map((d) => (
          <li key={d.caminho}>
            <Link href={d.caminho}>{d.nome}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
