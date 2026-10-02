import type { Metadata } from 'next';
import Link from '@/componentes/Ligacao';
import { NAO_ENCONTRADA } from '@/lib/formato';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';
import CabecalhoDoProduto from '@/componentes/CabecalhoDoProduto';
import RodapeDoProduto from '@/componentes/RodapeDoProduto';

export const metadata: Metadata = { title: NAO_ENCONTRADA };

/**
 * A página que não existe FORA DE UMA REGIÃO — a do produto.
 *
 * Aparece num anfitrião que não é de ninguém (`regiao-host.ts`), e numa região
 * que não existe ou que o painel desligou: aí o invólucro da região recusa-se
 * a desenhar a casa de alguém que não está lá, e sobe-se para aqui. Por isso
 * as ligações vão para a montra pela morada dela (`ORIGEM_DO_PRODUTO`) e não
 * para `/`: no domínio de uma região desligada, `/` voltava a dar nesta
 * página.
 *
 * Tem o cabeçalho e o rodapé das páginas do produto, e não os de uma região:
 * vive fora dos dois invólucros, porque é o que sobra quando nenhum serve.
 *
 * Era a do Next.js, em inglês e sem saída.
 */
export default function PaginaQueNaoExiste() {
  // `/` sem variável é «esta casa»: a origem fica vazia e as ligações relativas.
  const origem = ORIGEM_DO_PRODUTO === '/' ? '' : ORIGEM_DO_PRODUTO;
  return (
    <>
      <CabecalhoDoProduto origem={origem} />
      <main id="conteudo" className="produto">
        <div className="produto-texto">
          <h1>Esta página não existe</h1>
          <p>
            O endereço pode estar mal escrito, ou a página pode ter mudado de sítio. As regiões
            estão todas na página do Paragem.pt.
          </p>
          <p className="cartao-accoes">
            <Link className="botao" href={`${origem}/#demonstracao`}>
              Ver as regiões
            </Link>
          </p>
        </div>
      </main>
      <RodapeDoProduto origem={origem} />
    </>
  );
}
