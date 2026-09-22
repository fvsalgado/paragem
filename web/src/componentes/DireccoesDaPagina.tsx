'use client';

import { useEffect, useState } from 'react';
import Direccoes from './Direccoes';
import type { Ponto } from '@/lib/formato';

/**
 * As direções em `/viagem/`, com `?de=` e `?para=` já preenchidos.
 *
 * Existe porque as páginas estáticas — a de cada paragem, a de cada estação —
 * ligam para cá com o destino no endereço, e até aqui o formulário abria
 * VAZIO. Uma ligação que diz «como chegar» a uma paragem e desemboca num
 * campo em branco faz perder exatamente o passo que prometeu poupar.
 *
 * **Lê-se do `window` e não do `useSearchParams`.** O sítio é exportação
 * estática: não há servidor a saber a pergunta, e o Next obriga a embrulhar o
 * `useSearchParams` num `Suspense` para o dizer. O endereço só existe no
 * navegador, e é lá que se lê — num efeito, depois da hidratação, que é
 * quando ele passa a ser verdade.
 */
export default function DireccoesDaPagina({
  pontos,
  regiao,
  modosDesligados = [],
  motorDaRegiao = '',
}: {
  pontos: Ponto[];
  regiao: string;
  modosDesligados?: string[];
  motorDaRegiao?: string;
}) {
  const [de, setDe] = useState<Ponto | null>(null);
  const [para, setPara] = useState<Ponto | null>(null);
  const [lido, setLido] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const acha = (nome: string | null) =>
      nome ? (pontos.find((p) => p.nome === nome) ?? null) : null;
    setDe(acha(q.get('de')));
    setPara(acha(q.get('para')));
    setLido(true);
  }, [pontos]);

  // Só depois de ler o endereço: montar os campos vazios e semeá-los a seguir
  // fazia o destino aparecer e desaparecer à frente de quem está a escrever.
  if (!lido) return <p>A preparar…</p>;
  return (
    <Direccoes
      regiao={regiao}
      pontos={pontos}
      deInicial={de}
      paraInicial={para}
      modosDesligados={modosDesligados}
      motorDaRegiao={motorDaRegiao}
    />
  );
}
