'use client';

import { useEffect, useRef } from 'react';
import Link from '@/componentes/Ligacao';
import { Fechar } from './Icones';
import AssinaturaDaRegiao from './AssinaturaDaRegiao';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';
import type { Marca } from '@/lib/marca';

/**
 * O MENU DO MAPA — onde vive a navegação quando o mapa ocupa o ecrã todo.
 *
 * O ecrã de abertura passou a ser o mapa de bordo a bordo, como no Maps. Isso
 * tirou de cima a faixa branca com «Paragem.pt · <a região> · Mapa · A rede»,
 * que gastava 120 px de um telemóvel para repetir onde já se está.
 *
 * **Tirar não é esconder.** Um sítio de uma autoridade pública não pode ficar
 * sem navegação porque ficou mais bonito: a rede, o tarifário, os avisos e a
 * declaração de acessibilidade são obrigações, não enfeites. Mudaram para
 * aqui, a um toque, e continuam no HTML de todas as outras páginas.
 *
 * **É um `<dialog>` e não uma `<div>` que aparece.** O `showModal()` dá de
 * graça o que um painel à mão quase nunca acerta: o foco fica preso lá dentro,
 * o Escape fecha, o resto da página fica inerte para o leitor de ecrã, e ao
 * fechar o foco volta ao botão que o abriu.
 */
export default function MenuDoMapa({
  regiao,
  marca,
  assinatura,
  temAPedido,
  aberto,
  aoFechar,
}: {
  regiao: string;
  /**
   * A marca da região e os nomes da assinatura (`marca.ts`). O menu abria com
   * «Paragem.pt · <a região>», todo na cor do produto — o único sítio da
   * aplicação do mapa onde a região aparecia, e aparecia em segundo (P1-048,
   * P4-008). Abre agora com a assinatura da rede, como o cabeçalho.
   */
  marca: Marca;
  assinatura: { principal: string; secundario: string | null };
  /**
   * A REGIÃO DECIDE O QUE ESTÁ NO MENU, e não uma lista fixa aqui.
   *
   * O menu listava sempre «Transporte a pedido». A região de prova não o
   * declara, e a página não existe: o `npm run ligacoes` apanhou um 404 no
   * sítio construído. Um menu que leva a lado nenhum é pior do que uma
   * entrada a menos.
   */
  temAPedido: boolean;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = caixa.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  // A região é o anfitrião: as ligações são relativas à raiz.
  const url = (caminho: string) => `/${caminho}`;
  const entradas: [string, string, string][] = [
    ['rede/', 'A rede', 'Linhas, paragens, estações e concelhos'],
    ...(temAPedido
      ? ([['a-pedido/', 'Transporte a pedido', 'Como se reserva, e as zonas']] as [
          string,
          string,
          string,
        ][])
      : []),
    ['rede/tarifario/', 'Tarifário', 'Bilhetes e passes'],
    ['avisos/', 'Avisos', 'Alterações ao serviço'],
    ['dados-abertos/', 'Dados abertos', 'Descargas, licenças e lacunas'],
    ['acessibilidade/', 'Acessibilidade', 'A declaração, e o que falta'],
  ];

  return (
    <dialog className="menu-do-mapa" ref={caixa} onClose={aoFechar} aria-label="Menu">
      <div className="menu-topo">
        <span className="menu-marca">
          <AssinaturaDaRegiao
            regiao={regiao}
            marca={marca}
            principal={assinatura.principal}
            secundario={assinatura.secundario}
            altura={32}
          />
        </span>
        <button type="button" className="redondo" onClick={aoFechar} aria-label="Fechar o menu">
          <Fechar />
        </button>
      </div>
      <nav>
        <ul className="lista">
          {entradas.map(([caminho, nome, nota]) => (
            <li key={caminho}>
              <Link href={url(caminho)} onClick={aoFechar}>
                <span>
                  {nome}
                  <span className="secundario menu-nota">{nota}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {/* A ASSINATURA DO PRODUTO, discreta e no fim, como no rodapé das outras
          páginas — que esta não tem. Era uma entrada do menu, «Sobre o
          Paragem.pt», ao lado das da rede, e antes disso «Outras regiões»: o
          menu da autoridade a oferecer o fornecedor (P4-008). */}
      <p className="feito-com">
        Feito com <a href={ORIGEM_DO_PRODUTO}>Paragem.pt</a>
      </p>
    </dialog>
  );
}
