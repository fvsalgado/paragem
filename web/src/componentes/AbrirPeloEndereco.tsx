'use client';

import { useEffect } from 'react';

/**
 * Abre o quadro que o endereço aponta: `…/a-pedido/ourem/#q-alburitel`.
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
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        el.scrollIntoView({ block: 'start' });
      }
    };
    abrir();
    window.addEventListener('hashchange', abrir);
    return () => window.removeEventListener('hashchange', abrir);
  }, []);
  return null;
}
