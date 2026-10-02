'use client';

import { useEffect } from 'react';

/**
 * Leva o ecrã à secção onde se acabou de mexer, e o foco à mensagem (P4-014).
 *
 * Cada gesto do painel acaba num redirecionamento com a mensagem na barra de
 * endereços, e o Next deita fora a âncora nesse caminho: a ficha de uma
 * região tinha quatro mil pixéis num telemóvel, e quem desligava um módulo
 * voltava ao topo, com o interruptor que acabou de mudar fora do ecrã. A
 * página diz qual foi a secção (`?secao=`), e isto vai lá.
 *
 * O foco vai para a mensagem e não para a secção: é a mensagem que diz o que
 * aconteceu, e um leitor de ecrã lê-a ao lá chegar. Sem JavaScript, a âncora
 * no fim do endereço faz o mesmo à moda antiga.
 */
export default function IrParaSecao({ secao }: { secao?: string }) {
  useEffect(() => {
    if (!secao) return;
    const alvo = document.getElementById(secao);
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'start' });
    const mensagem = alvo.querySelector<HTMLElement>('[data-mensagem]');
    mensagem?.focus({ preventScroll: true });
  }, [secao]);
  return null;
}
