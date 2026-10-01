'use client';

import { useEffect } from 'react';

/**
 * Quando a página do produto rebenta — ou o invólucro de uma região, que é
 * filho dela e não tem quem o apanhe por cima de si.
 *
 * Sem isto aparecia o ecrã do Next.js, em inglês. «Tentar de novo» recarrega
 * a página inteira, pela razão que está em `[regiao]/error.tsx`.
 */
export default function ErroNoSitio({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('erro no sítio', error);
  }, [error]);

  return (
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
  );
}
