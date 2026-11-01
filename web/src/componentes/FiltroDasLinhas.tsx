'use client';

import Link from '@/componentes/Ligacao';
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
  /** O operador, nas linhas que não são da rede da região. */
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
/** Um grupo da lista: a rede da região, ou as linhas de outros operadores. */
export type GrupoDeLinhas = { id: string; titulo: string; nota?: string; linhas: LinhaDaLista[] };

export default function FiltroDasLinhas({ grupos }: { grupos: GrupoDeLinhas[] }) {
  const [texto, setTexto] = useState('');
  const campo = useId();
  const q = simples(texto);
  const palavras = q.split(/\s+/).filter(Boolean);
  const filtrar = (linhas: LinhaDaLista[]) =>
    palavras.length
      ? linhas
          .filter((l) => {
            const alvo = `${simples(l.codigo)} ${simples(l.nome)} ${simples(l.operador ?? '')}`;
            return palavras.every((w) => alvo.includes(w));
          })
          .sort((a, b) => Number(simples(b.codigo) === q) - Number(simples(a.codigo) === q))
      : linhas;
  const visiveis = grupos.map((g) => ({ ...g, linhas: filtrar(g.linhas) }));
  const quantas = visiveis.reduce((n, g) => n + g.linhas.length, 0);
  const todas = grupos.reduce((n, g) => n + g.linhas.length, 0);
  const escrito = texto.trim();
  // Com um grupo só (uma região sem linhas de outros operadores), não há
  // subtítulos: a lista é a da rede, e o título da página já o diz.
  const comTitulos = grupos.filter((g) => g.linhas.length).length > 1;

  return (
    <>
      {todas >= A_PARTIR_DE && (
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
          <p aria-live="polite" className={escrito && !quantas ? '' : 'so-para-leitores'}>
            {escrito
              ? quantas
                ? `${plural(quantas, 'linha', 'linhas')} com «${escrito}».`
                : `Nenhuma linha com «${escrito}». Tente o número, ou outra palavra do nome.`
              : ''}
          </p>
        </div>
      )}
      {visiveis
        .filter((g) => g.linhas.length)
        .map((g) => (
          <section key={g.id} aria-labelledby={comTitulos ? `grupo-${g.id}` : undefined}>
            {comTitulos && (
              <h2 id={`grupo-${g.id}`} className="grupo-de-linhas">
                {g.titulo} <span className="secundario">({g.linhas.length})</span>
              </h2>
            )}
            {comTitulos && g.nota && <p className="secundario">{g.nota}</p>}
            <ul className="lista">
              {g.linhas.map((l) => (
                <li key={l.id}>
                  <Link href={l.href}>
                    <span>
                      <Distintivo codigo={l.codigo} cor={l.cor} /> {l.nome}
                      {l.operador && <span className="secundario"> · {l.operador}</span>}
                    </span>
                    {/* Uma contagem nunca se parte: era «3 / viagen / s» (#98). */}
                    <span className="secundario contagem">
                      {plural(l.viagens, 'viagem', 'viagens')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}
