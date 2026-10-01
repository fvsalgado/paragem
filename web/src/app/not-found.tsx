import type { Metadata } from 'next';
import Link from 'next/link';
import { NAO_ENCONTRADA } from '@/lib/formato';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';

export const metadata: Metadata = { title: NAO_ENCONTRADA };

/**
 * A página que não existe FORA DE UMA REGIÃO — a do produto.
 *
 * Aparece num anfitrião que não é de ninguém (`regiao-host.ts`), e numa região
 * que não existe ou que o painel desligou: aí o invólucro da região recusa-se
 * a desenhar a casa de alguém que não está lá, e sobe-se para aqui. Por isso
 * a saída é a montra (`ORIGEM_DO_PRODUTO`) e não `/`: no domínio de uma região
 * desligada, `/` voltava a dar nesta página.
 *
 * Era a do Next.js, em inglês e sem saída.
 */
export default function PaginaQueNaoExiste() {
  return (
    <>
      <header className="cabecalho">
        <div className="interior">
          <Link href={ORIGEM_DO_PRODUTO} className="marca">
            Paragem<span aria-hidden="true">.</span>pt
          </Link>
        </div>
      </header>
      <main id="conteudo" className="pagina">
        <h1>Esta página não existe</h1>
        <p>
          O endereço pode estar mal escrito, ou a página pode ter mudado de sítio. As regiões estão
          todas na página do Paragem.pt.
        </p>
        <p className="cartao-accoes">
          <Link className="botao" href={ORIGEM_DO_PRODUTO}>
            Ver as regiões
          </Link>
        </p>
      </main>
    </>
  );
}
