'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Fechar } from './Icones';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';

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
  nomeDaRegiao,
  temAPedido,
  aberto,
  aoFechar,
}: {
  regiao: string;
  nomeDaRegiao: string;
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
          Paragem.pt <span className="secundario">· {nomeDaRegiao}</span>
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
          <li>
            <Link href={ORIGEM_DO_PRODUTO} onClick={aoFechar}>
              <span>Outras regiões</span>
            </Link>
          </li>
        </ul>
      </nav>
    </dialog>
  );
}
