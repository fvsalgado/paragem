'use client';

import { useEffect, useMemo, useState } from 'react';
import ASeguir from '@/componentes/ASeguir';
import { expandir, type PartidasCompactas } from '@/lib/formato';
import { calendarioDe, horaDoRelogio, proximas, type Calendario } from '@/lib/dias';

/**
 * O «A seguir» de um sítio qualquer — uma paragem, uma estação, a paragem à
 * porta de uma estação —, com o relógio de quem lê e a tabela dos dias.
 *
 * É o MESMO cálculo do cartão do mapa e da página da paragem (`proximas`), e a
 * mesma tabela (`calendarioDe`, pedida uma vez por página). Corre no
 * navegador porque é a única coisa que depende da hora de quem lê, e a página
 * é servida da cache.
 */
export default function ProximasPartidas({
  regiao,
  partidas,
  cores,
  Titulo = 'h2',
  id,
  titulo,
  quantas = 6,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  Titulo?: 'h2' | 'h3' | null;
  id?: string;
  titulo?: string;
  quantas?: number;
}) {
  const lista = useMemo(() => expandir(partidas), [partidas]);

  // A tabela dos dias: `undefined` enquanto se pergunta, `null` quando não se
  // conseguiu saber (`lib/dias.ts`) — e não é o mesmo que «hoje não há nada».
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);

  // O RELÓGIO DE QUEM LÊ, e a andar: «12 min» que fica parado deixa de ser
  // verdade ao fim de um minuto.
  const [instante, setInstante] = useState<Date | null>(null);
  useEffect(() => {
    setInstante(new Date());
    const t = setInterval(() => setInstante(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (instante === null || calendario === undefined) {
    return (
      <>
        {Titulo && <Titulo id={id}>{titulo ?? 'A seguir'}</Titulo>}
        <p className="secundario" aria-live="polite">
          A ver o que passa a seguir…
        </p>
        <noscript>
          <p>
            O que passa a seguir calcula-se com a hora do teu aparelho, e isso precisa de
            JavaScript.
          </p>
        </noscript>
      </>
    );
  }
  const agora = horaDoRelogio(instante);
  return (
    <ASeguir
      resultado={proximas(lista, instante, agora, calendario, quantas)}
      instante={instante}
      agora={agora}
      cores={cores}
      Titulo={Titulo}
      id={id}
      titulo={titulo}
    />
  );
}
