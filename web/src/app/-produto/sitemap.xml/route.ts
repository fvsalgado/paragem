import { PAGINAS_DO_PRODUTO } from '@/lib/regiao-host';
import { mapaDoSitio } from '@/lib/mapa-do-sitio';
import { origemDoProduto } from '@/lib/produto';

// Lido a cada pedido: sem `NEXT_PUBLIC_PARAGEM_PRODUTO`, a morada é a de quem
// pergunta, e essa não existe na construção.
export const dynamic = 'force-dynamic';

/**
 * `GET /sitemap.xml` no anfitrião do produto: as páginas do produto, na morada
 * dele.
 *
 * Dava a página de 404 em HTML. São quatro páginas, e a lista é a mesma que o
 * middleware deixa passar (`PAGINAS_DO_PRODUTO`): uma página nova do produto
 * entra nas duas ao mesmo tempo, ou não entra em nenhuma. As regiões não vão
 * aqui — cada uma vive no seu domínio e tem o seu mapa do sítio.
 */
export function GET(pedido: Request): Response {
  const origem = (origemDoProduto() ?? new URL(pedido.url)).origin;
  return new Response(mapaDoSitio(origem, PAGINAS_DO_PRODUTO), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
