'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { comecar, pagina } from '@/lib/medicao';

/**
 * Liga a medição e conta cada página.
 *
 * O `tipo` e o `id` saem do próprio endereço, para que um painel consiga
 * responder «que paragens é que as pessoas mais consultam?» sem ninguém ter de
 * escrever uma expressão regular sobre URLs.
 */
export default function Medicao() {
  const caminho = usePathname();

  useEffect(() => {
    comecar();
  }, []);

  useEffect(() => {
    if (!caminho) return;
    const partes = caminho.split('/').filter(Boolean);
    pagina(caminho, {
      tipo: partes[0] ?? 'inicio',
      id: partes[1] ?? null,
    });
  }, [caminho]);

  return null;
}
