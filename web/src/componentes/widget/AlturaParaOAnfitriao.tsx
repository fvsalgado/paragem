'use client';

import { useEffect } from 'react';

/**
 * Diz ao sítio que acolhe a caixa a altura que ela tem — e só isso (P4-007).
 *
 * Um `<iframe>` não cresce com o que tem dentro: sem isto, a câmara tinha de
 * adivinhar uma altura, e ou cortava as partidas ou deixava um buraco. O
 * `embed.js` ouve a mensagem e ajusta a moldura; quem colou o `<iframe>` à
 * mão fica com a altura que escreveu, e a caixa continua a funcionar.
 */
export default function AlturaParaOAnfitriao() {
  useEffect(() => {
    if (window.parent === window) return;
    // A ALTURA DA CAIXA, e não a do documento: dentro de um `<iframe>`, a do
    // documento nunca é menor do que a da moldura — a caixa crescia e nunca
    // encolhia, e as cinco partidas ficavam com o espaço de dez.
    const caixa = document.querySelector<HTMLElement>('main.widget');
    if (!caixa) return;
    const enviar = () =>
      window.parent.postMessage(
        { paragem: 'altura', altura: Math.ceil(caixa.getBoundingClientRect().height) + 2 },
        '*',
      );
    const observador = new ResizeObserver(enviar);
    observador.observe(caixa);
    enviar();
    return () => observador.disconnect();
  }, []);
  return null;
}
