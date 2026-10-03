import Link from '@/componentes/Ligacao';
import AssinaturaDaRegiao from '@/componentes/AssinaturaDaRegiao';
import { exigirRegiao, temMosaicos, url } from '@/lib/dados';
import { assinaturaDaRegiao, marcaDaRegiao } from '@/lib/marca';

/**
 * O cabeçalho: a marca da REGIÃO, e duas ligações.
 *
 * **O sítio é da autoridade, e não do fornecedor** (P4-008, P1-007, P2-029,
 * P3-029). A primeira coisa daqui era «Paragem.pt», a levar à página de
 * vendas do produto, noutro domínio — quem tocava no canto à espera de voltar
 * ao início saía do serviço da sua região —, e o nome da região vinha a
 * seguir numa pastilha com o desenho de um rótulo de estado. Agora é a
 * assinatura da região, a levar ao início DELA: o logótipo dela, quando o
 * declara, e o endereço dela em feixe, nos tons dela (§6), com o que ela é por
 * baixo. «Feito com Paragem.pt» fica no rodapé, discreto.
 *
 * **Foi uma faixa na cor da região**, com o nome em texto e a tinta medida por
 * cima. Passou a ser claro a 3/10/2026, para o logótipo ir a cores; a cor da
 * região ficou na barra do navegador e na régua de três linhas que fecha o
 * cabeçalho.
 *
 * Ficam duas ligações: **o mapa**, que é a aplicação, e **a rede**, que é o
 * catálogo onde tudo o resto continua a viver — e continua a ser o caminho
 * de quem não pode ou não quer usar um mapa.
 */
export default async function Cabecalho({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  // Numa região ainda sem mapa, o início é a procura e o planeador — e uma
  // ligação chamada «Mapa» que abre uma página sem mapa promete o que não há.
  const temMapa = await temMosaicos(id);
  const marca = marcaDaRegiao(r);
  const { principal, secundario, endereco } = assinaturaDaRegiao(r);
  return (
    <header className="cabecalho cabecalho-da-regiao">
      <div className="interior">
        <Link href={url(id)} className="marca-da-regiao">
          <AssinaturaDaRegiao
            regiao={id}
            marca={marca}
            principal={principal}
            secundario={secundario}
            endereco={endereco}
          />
        </Link>
        <nav aria-label="Principal">
          <ul>
            <li>
              <Link href={url(id)}>{temMapa ? 'Mapa' : 'Início'}</Link>
            </li>
            <li>
              <Link href={url(id, 'rede/')}>A rede</Link>
            </li>
          </ul>
        </nav>
      </div>
      <span className="regua-do-feixe" aria-hidden="true" />
    </header>
  );
}
