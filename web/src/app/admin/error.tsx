'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * A rede por baixo do painel.
 *
 * Uma leitura que não corre chega aqui em vez de se disfarçar de «não há
 * nada» — é por isso que as consultas rebentam em vez de devolverem `[]`. A
 * mensagem mostra-se (quem está no painel tem sessão), e há um caminho de
 * volta.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('erro no painel', error);
  }, [error]);

  return (
    <>
      <h1>Não foi possível falar com a base</h1>
      <p>
        Esta página não está a mostrar nada porque não conseguiu ler, e não porque não haja nada
        para mostrar — a diferença é a razão de ver este ecrã em vez de uma lista vazia. As escritas
        do painel são atómicas: nada ficou pelo meio.
      </p>
      {error.message ? (
        <pre tabIndex={0} className="erro">
          {error.message}
        </pre>
      ) : null}
      <div className="linha-accoes">
        <button type="button" onClick={reset} className="secundario">
          Tentar de novo
        </button>
        <Link href="/admin/" className="botao">
          Voltar às regiões
        </Link>
      </div>
      {error.digest ? (
        <p className="secundario-texto">
          Código do erro: <code>{error.digest}</code>
        </p>
      ) : null}
    </>
  );
}
