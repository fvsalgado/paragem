'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * UMA LIGAÇÃO DO CABEÇALHO QUE DIZ SE É ONDE SE ESTÁ. As três do cabeçalho —
 * o mapa, como chegar, a rede — eram iguais em todas as páginas, e quem
 * chegava a uma paragem por uma procura não via em que parte do sítio estava.
 *
 * `aria-current="page"` na página da própria ligação, e `"true"` dentro da
 * secção dela — uma paragem está dentro de «A rede», e não É «A rede». O
 * leitor de ecrã di-lo; quem vê tem o traço por baixo (`global.css`).
 *
 * O caminho é o público (`/rede/…`), e não o de dentro, com a região à
 * frente: é o que o navegador mostra, e o que as ligações escrevem.
 *
 * O `Link` do Next diretamente, com `prefetch={false}` por extenso, como faz
 * `Ligacao.tsx`: este vai para o navegador em todas as páginas, e importar
 * aquele levava mais um módulo para cada uma.
 */
export default function LigacaoDaSeccao({
  href,
  so = false,
  children,
}: {
  href: string;
  /** Só a própria página, e nada abaixo dela — o início é `/`, e tudo começa por `/`. */
  so?: boolean;
  children: ReactNode;
}) {
  const caminho = usePathname() ?? '';
  const atual = caminho === href ? 'page' : !so && caminho.startsWith(href) ? 'true' : undefined;
  return (
    <Link href={href} prefetch={false} aria-current={atual}>
      {children}
    </Link>
  );
}
