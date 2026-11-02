'use client';

import { useEffect } from 'react';

/**
 * Abre o quadro que o endereço aponta: `…/a-pedido/<concelho>/#q-<circuito>`.
 *
 * Os quadros de horário estão fechados (`<details>`), e uma ligação para um
 * quadro fechado levava ao resumo dele e deixava as horas escondidas — a
 * pessoa chegava ao sítio certo e não via nada. O Chromium abre um
 * `<details>` quando o alvo está lá dentro, mas não quando o alvo é o próprio
 * `<details>`, e os outros navegadores nem isso.
 */
export default function AbrirPeloEndereco() {
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      // O ALVO PODE ESTAR DENTRO DE OUTRO FECHADO — uma zona dentro do
      // concelho dela, no transporte a pedido (#55) —, e um alvo escondido não
      // se vê nem se lê. Abrem-se ele, se for um, e os que o contêm.
      const fechados: HTMLDetailsElement[] = [];
      for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
        if (!d.open) fechados.push(d);
      }
      if (!fechados.length) return;
      for (const d of fechados) d.open = true;
      el.scrollIntoView({ block: 'start' });
    };
    abrir();
    window.addEventListener('hashchange', abrir);
    return () => window.removeEventListener('hashchange', abrir);
  }, []);
  return null;
}
