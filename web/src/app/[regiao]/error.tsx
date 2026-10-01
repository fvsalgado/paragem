'use client';

import { useEffect } from 'react';

/**
 * Quando uma página da região rebenta no navegador — e diz-se em português.
 *
 * O que se via era o ecrã do Next.js: «Application error: a client-side
 * exception has occurred…», em inglês, sem marca nem caminho de volta. Visto
 * quando um pedaço de JavaScript não chegou — o que numa rede móvel que corta
 * a meio acontece —, e é o pior ecrã possível para o sítio de uma autoridade
 * pública.
 *
 * Fica dentro do invólucro da região: o cabeçalho, a rede e o rodapé estão lá,
 * e são HTML que já chegou. **«Tentar de novo» recarrega a página**, e não só
 * o pedaço que rebentou: um pedaço que não chegou fica guardado como falhado
 * até a página se recarregar, e voltar a desenhar sem o pedir outra vez dava
 * o mesmo erro. O detalhe vai para a consola, que é onde serve a alguém.
 */
export default function ErroNaPagina({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('erro na página', error);
  }, [error]);

  return (
    <>
      <h1>Algo correu mal ao abrir esta página</h1>
      <p>
        Pode ser da ligação à Internet, ou de uma parte da página que não chegou. Os horários não se
        perderam: tenta de novo.
      </p>
      <p className="cartao-accoes">
        <button type="button" className="botao" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
        <a href="/">Ir para o mapa</a>
      </p>
    </>
  );
}
