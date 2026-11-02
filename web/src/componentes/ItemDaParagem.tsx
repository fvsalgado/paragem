import Link from '@/componentes/Ligacao';
import Distintivo from '@/componentes/Distintivo';
import type { GrupoDeParagens } from '@/lib/lista-de-paragens';
import { linhasPorOrdem } from '@/lib/lista-de-paragens';

/** Quantas linhas cabem por baixo do nome, no telemóvel, sem partir a lista. */
const LINHAS_A_MOSTRAR = 6;

/**
 * UMA PARAGEM NUMA LISTA: o nome, o concelho à direita, e as linhas que lá
 * param por baixo do nome — nos distintivos coloridos do resto do sítio.
 *
 * As linhas eram texto cinzento à direita, por ordem de texto — «1001 · 8 ·
 * 905», com o 8 depois do 1001 (auditoria de 1/11/2026, #183) —, e em todo o
 * resto do sítio uma linha é o seu distintivo. Pela ordem dos números, e por
 * baixo do nome, onde seis cabem num telemóvel; à direita espremiam o nome.
 *
 * É a mesma linha na lista de cada inicial e nos resultados da procura.
 */
export default function ItemDaParagem({
  grupo,
  href,
  onde,
  pista,
  cores,
}: {
  grupo: GrupoDeParagens;
  href: string;
  /** O concelho, ou «fora da região». */
  onde: string;
  /** O que distingue esta de outra com o mesmo nome. */
  pista?: string;
  /** A cor de cada linha, pelo número dela — só os números de uma linha só. */
  cores: Record<string, string | null>;
}) {
  const linhas = linhasPorOrdem(grupo.linhas);
  const mostradas = linhas.slice(0, LINHAS_A_MOSTRAR);
  return (
    <li>
      <Link href={href}>
        <span>
          {grupo.nome}
          {pista && <span className="secundario"> · {pista}</span>}
          {mostradas.length > 0 && (
            <span className="linhas-da-paragem">
              <span className="so-para-leitores">
                {linhas.length === 1 ? ', linha ' : ', linhas '}
              </span>
              {mostradas.map((c, i) => (
                <span key={c}>
                  {i > 0 && <span className="so-para-leitores">, </span>}
                  <Distintivo codigo={c} cor={cores[c]} />
                </span>
              ))}
              {linhas.length > mostradas.length && (
                <span className="secundario"> e mais {linhas.length - mostradas.length}</span>
              )}
            </span>
          )}
        </span>
        <span className="secundario">{onde}</span>
      </Link>
    </li>
  );
}
