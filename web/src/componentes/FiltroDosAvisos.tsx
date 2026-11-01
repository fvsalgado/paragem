'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ficaComOFiltro, type AlcanceDoAviso } from '@/lib/avisos';

/**
 * O FILTRO DOS AVISOS: por linha e por concelho.
 *
 * Numa greve ou numa semana de obras a página enche-se, e quem quer saber da
 * sua linha lia-os todos. Os cartões vêm do servidor, já desenhados; isto só
 * esconde os que não dizem respeito ao que se escolheu — sem JavaScript
 * ficam todos à vista, que é o que a página era. O aviso da rede toda fica
 * sempre (`ficaComOFiltro`).
 */
export default function FiltroDosAvisos({
  linhas,
  concelhos,
  alcances,
  children,
}: {
  linhas: { id: string; nome: string }[];
  concelhos: { id: string; nome: string }[];
  /** O alcance de cada aviso, pela ordem dos cartões. */
  alcances: AlcanceDoAviso[];
  children: ReactNode;
}) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const [linha, setLinha] = useState('');
  const [concelho, setConcelho] = useState('');
  const visiveis = alcances.filter((a) => ficaComOFiltro(a, { linha, concelho })).length;

  useEffect(() => {
    const cartoes = caixa.current?.querySelectorAll<HTMLElement>(':scope > .aviso');
    cartoes?.forEach((c, i) => {
      const a = alcances[i];
      c.hidden = !!a && !ficaComOFiltro(a, { linha, concelho });
    });
  }, [linha, concelho, alcances]);

  return (
    <>
      <form className="filtro-dos-avisos" onSubmit={(e) => e.preventDefault()}>
        {linhas.length > 1 && (
          <div>
            <label htmlFor={`${id}-linha`}>Linha</label>
            <select id={`${id}-linha`} value={linha} onChange={(e) => setLinha(e.target.value)}>
              <option value="">Todas</option>
              {linhas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        {concelhos.length > 1 && (
          <div>
            <label htmlFor={`${id}-concelho`}>Concelho</label>
            <select
              id={`${id}-concelho`}
              value={concelho}
              onChange={(e) => setConcelho(e.target.value)}
            >
              <option value="">Todos</option>
              {concelhos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="secundario" aria-live="polite">
          {visiveis === alcances.length
            ? `${alcances.length} avisos.`
            : `${visiveis} de ${alcances.length} avisos.`}
        </p>
      </form>
      <div ref={caixa}>{children}</div>
    </>
  );
}
