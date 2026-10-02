'use client';

import { useEffect, useState } from 'react';
import ProximasPartidas from '@/componentes/ProximasPartidas';
import type { PartidasCompactas } from '@/lib/formato';

/**
 * As próximas partidas da caixa, quantas a câmara pediu (`?quantas=`, de 1 a
 * 10; cinco por omissão).
 *
 * O número lê-se no navegador e não no servidor: lido no servidor, cada
 * número era uma página à parte, rendida a pedido — e a caixa deixava de vir
 * da cache.
 */
export default function PartidasDaCaixa({
  regiao,
  partidas,
  cores,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
}) {
  const [quantas, setQuantas] = useState(5);
  useEffect(() => {
    const n = Number.parseInt(new URLSearchParams(window.location.search).get('quantas') ?? '', 10);
    if (n >= 1 && n <= 10) setQuantas(n);
  }, []);
  return (
    <ProximasPartidas
      regiao={regiao}
      partidas={partidas}
      cores={cores}
      Titulo="h2"
      titulo="A seguir"
      quantas={quantas}
    />
  );
}
