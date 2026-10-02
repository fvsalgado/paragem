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
  // UMA CAIXA NO SÍTIO DE UMA CÂMARA NÃO MEDE NADA (P4-007): quem a vê está
  // a visitar o sítio da câmara, e não o nosso. A promessa da página que dá o
  // código é essa — «não segue quem visita o seu sítio» —, e cumpre-se aqui.
  const naCaixa = !!caminho?.startsWith('/widget/');

  useEffect(() => {
    if (!naCaixa) comecar();
  }, [naCaixa]);

  useEffect(() => {
    if (!caminho || naCaixa) return;
    const partes = caminho.split('/').filter(Boolean);
    pagina(caminho, {
      tipo: partes[0] ?? 'inicio',
      id: partes[1] ?? null,
    });
  }, [caminho, naCaixa]);

  return null;
}
