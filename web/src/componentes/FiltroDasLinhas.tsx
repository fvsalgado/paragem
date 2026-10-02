'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import Distintivo from './Distintivo';
import { simples } from '@/lib/letras';
import { plural } from '@/lib/prosa';

export type LinhaDaLista = {
  id: string;
  href: string;
  codigo: string;
  nome: string;
  cor: string | null;
  /** O operador, só quando é preciso para distinguir dois números iguais. */
  operador: string | null;
  viagens: number;
};

/**
 * Uma lista que cabe num ecrã de telemóvel não precisa de filtro: é mais
 * rápido percorrê-la do que escrever.
 */
const A_PARTIR_DE = 9;

/**
 * A LISTA DAS LINHAS, COM UM FILTRO (P2-019).
 *
 * Eram cento e tal linhas numa coluna, sem maneira de chegar à 1109 sem
 * rolar até ela. Escreve-se o número ou um pedaço do nome — «11»,
 * «hospital» — e a lista fica só com as que batem; o número exato vem
 * primeiro, porque quem escreve «11» quer a 11 e não a 110.
 *
 * A LISTA INTEIRA VEM NO HTML: o filtro esconde, não carrega. Sem JavaScript,
 * ou para um motor de busca, a página continua a ter todas as linhas.
 */
export default function FiltroDasLinhas({ linhas }: { linhas: LinhaDaLista[] }) {
  const [texto, setTexto] = useState('');
  const campo = useId();
  const q = simples(texto);
  const palavras = q.split(/\s+/).filter(Boolean);
  const visiveis = palavras.length
    ? linhas
        .filter((l) => {
          const alvo = `${simples(l.codigo)} ${simples(l.nome)} ${simples(l.operador ?? '')}`;
          return palavras.every((w) => alvo.includes(w));
        })
        .sort((a, b) => Number(simples(b.codigo) === q) - Number(simples(a.codigo) === q))
    : linhas;
  const escrito = texto.trim();

  return (
    <>
      {linhas.length >= A_PARTIR_DE && (
        <div className="filtro-das-linhas">
          <label htmlFor={campo}>Filtrar pelo número ou pelo nome</label>
          <input
            id={campo}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            placeholder="Por exemplo, 11 ou hospital"
          />
          {/* O que ficou, dito a quem não vê a lista encolher. */}
          <p aria-live="polite" className={escrito && !visiveis.length ? '' : 'so-para-leitores'}>
            {escrito
              ? visiveis.length
                ? `${plural(visiveis.length, 'linha', 'linhas')} com «${escrito}».`
                : `Nenhuma linha com «${escrito}». Tenta o número, ou outra palavra do nome.`
              : ''}
          </p>
        </div>
      )}
      <ul className="lista">
        {visiveis.map((l) => (
          <li key={l.id}>
            <Link href={l.href}>
              <span>
                <Distintivo codigo={l.codigo} cor={l.cor} /> {l.nome}
                {l.operador && <span className="secundario"> · {l.operador}</span>}
              </span>
              <span className="secundario">{plural(l.viagens, 'viagem', 'viagens')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
