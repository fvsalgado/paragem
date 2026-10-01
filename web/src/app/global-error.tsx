'use client';

import { useEffect } from 'react';
import './global.css';

/**
 * O ÚLTIMO RECURSO: o erro que rebenta o próprio invólucro de tudo.
 *
 * Substitui o `layout.tsx` da raiz — por isso traz o seu `<html>` e o seu
 * `<body>`, e não conta com nada do que o invólucro faria. Era aqui que o
 * Next.js mostrava, em inglês, «Application error: a client-side exception
 * has occurred», e foi isso que se viu quando um pedaço de JavaScript não
 * chegou a uma página que não existia.
 *
 * Simples de propósito: um título, uma frase e duas saídas. Quanto menos
 * depender de outras peças, mais hipóteses tem de aparecer quando as outras
 * falharam.
 */
export default function ErroGeral({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('erro no sítio', error);
  }, [error]);

  return (
    <html lang="pt-PT">
      <body>
        <main id="conteudo" className="pagina">
          <h1>Algo correu mal ao abrir esta página</h1>
          <p>Pode ser da ligação à Internet, ou de uma parte da página que não chegou.</p>
          <p className="cartao-accoes">
            <button type="button" className="botao" onClick={() => window.location.reload()}>
              Tentar de novo
            </button>
            <a href="/">Voltar ao início</a>
          </p>
        </main>
      </body>
    </html>
  );
}
