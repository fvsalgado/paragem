import type { CSSProperties } from 'react';
import Link from '@/componentes/Ligacao';
import AssinaturaDaRegiao from '@/componentes/AssinaturaDaRegiao';
import { exigirRegiao, temMosaicos, url } from '@/lib/dados';
import { marcaDaRegiao, nomesDaAssinatura } from '@/lib/marca';

/**
 * O cabeçalho: a marca da REGIÃO, e duas ligações.
 *
 * **O sítio é da autoridade, e não do fornecedor** (P4-008, P1-007, P2-029,
 * P3-029). A primeira coisa daqui era «Paragem.pt», a levar à página de
 * vendas do produto, noutro domínio — quem tocava no canto à espera de voltar
 * ao início saía do serviço da sua região —, e o nome da região vinha a
 * seguir numa pastilha com o desenho de um rótulo de estado. Agora é a
 * assinatura da rede: o logótipo, quando a região o declara, e os nomes, numa
 * faixa com a cor da marca dela, a levar ao início DA REGIÃO. «Paragem.pt»
 * passou ao rodapé, discreto.
 *
 * **A tinta por cima da faixa não se escolhe aqui**: vem medida do pipeline,
 * e o sítio volta a medi-la (`marca.ts`). O contorno do foco, dentro da faixa,
 * é da cor da tinta: o amarelo do foco do sítio não se vê sobre uma faixa
 * clara, e a tinta lê-se sempre — foi medida para isso.
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
  const { principal, secundario } = nomesDaAssinatura(r);
  const cores = { '--cor-da-marca': marca.cor, '--tinta-da-marca': marca.tinta } as CSSProperties;
  return (
    <header className="cabecalho cabecalho-da-regiao" style={cores}>
      <div className="interior">
        <Link href={url(id)} className="marca-da-regiao">
          <AssinaturaDaRegiao
            regiao={id}
            marca={marca}
            principal={principal}
            secundario={secundario}
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
    </header>
  );
}
