import Link from 'next/link';
import { exigirRegiao, url } from '@/lib/dados';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';

/**
 * O cabeçalho, reduzido ao que não estorva.
 *
 * Tinha cinco ligações — Planear viagem, Paragens, Linhas, Concelhos,
 * Tarifário — e isso é a forma de um catálogo: uma prateleira por cada tipo de
 * ficha. Numa aplicação de mapa a cromagem sai da frente, porque o que ocupa o
 * ecrã é o mapa e o que se faz primeiro é procurar.
 *
 * Ficam duas: **o mapa**, que é a aplicação, e **a rede**, que é o catálogo
 * onde tudo o resto continua a viver — e continua a ser o caminho de quem não
 * pode ou não quer usar um mapa.
 */
export default async function Cabecalho({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  return (
    <header className="cabecalho">
      <div className="interior">
        <Link href={ORIGEM_DO_PRODUTO} className="marca">
          Paragem<span aria-hidden="true">.</span>pt
        </Link>
        <Link href={url(id)} className="marca-dados">
          {r.nome}
        </Link>
        <nav aria-label="Principal">
          <ul>
            <li>
              <Link href={url(id)}>Mapa</Link>
            </li>
            <li>
              <Link href={url(id, 'rede/')}>A rede</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
