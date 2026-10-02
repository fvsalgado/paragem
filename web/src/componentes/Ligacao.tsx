import Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * UMA LIGAÇÃO PARA DENTRO DA REGIÃO, SEM PRÉ-CARREGAR O DESTINO (P3-008).
 *
 * O `<Link>` do Next pré-carrega em fundo cada destino que aparece no ecrã: a
 * carga da página e o JavaScript dela. Num sítio de catálogo isso é a página
 * inteira a pedir dezenas de outras que ninguém abriu — medido na região
 * real: o tarifário, com 12 kB de HTML, transferia 358 kB, porque o «Mapa» e
 * «A rede» do cabeçalho levavam lá dentro a lista de todos os pontos; e numa
 * paragem eram seis pedidos de páginas por abrir. Quem paga são os dados
 * pré-pagos de quem está na paragem, e o fio principal do telemóvel, que os
 * analisa no momento em que a página devia responder.
 *
 * A navegação continua a ser a do Next — sem recarregar a página, e com a
 * carga pedida ao toque, que nas páginas em cache é imediata. Só deixa de se
 * pagar adiantado o que pode nunca ser pedido. Usa-se em todas as ligações
 * internas das páginas de uma região; quem quiser pré-carregar um destino diz
 * `prefetch` por extenso, e fica escrito porquê.
 */
export default function Ligacao(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
