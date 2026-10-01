import {
  aPedido,
  concelhos,
  estacoes,
  linhas,
  modos,
  origemDaRegiao,
  paragens,
  regiao,
} from '@/lib/dados';
import { caminhosDaRegiao, mapaDoSitio } from '@/lib/mapa-do-sitio';

/**
 * `GET /sitemap.xml` no anfitrião de uma região: todas as páginas dela.
 *
 * Dava a página de 404 em HTML (P3-026). A região continua a não se deixar
 * indexar — quem manda é o `robots.txt` dela, que não aponta para aqui —, mas
 * o mapa fica pronto para o dia em que a autoridade de transportes o
 * autorizar. As páginas saem dos mesmos índices que as páginas usam
 * (`lib/mapa-do-sitio.ts`), com os módulos desligados já de fora, porque os
 * leitores de `dados.ts` já os tiram.
 *
 * A morada é a da região no mapa de domínios — a mesma que a página do
 * produto usa para ligar para ela —, e na falta dela a de quem pergunta.
 */
export const revalidate = 3600;

export async function GET(
  pedido: Request,
  { params }: { params: Promise<{ regiao: string }> },
): Promise<Response> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) {
    return new Response('esta região não existe\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const [ps, ls, cs, es, pedidos, dosModos, origem] = await Promise.all([
    paragens(rid),
    linhas(rid),
    concelhos(rid),
    estacoes(rid),
    aPedido(rid),
    modos(rid),
    origemDaRegiao(rid),
  ]);
  const caminhos = caminhosDaRegiao({
    modos: r.modos,
    paragens: ps,
    linhas: ls,
    concelhos: cs,
    estacoes: es,
    aPedido: pedidos ? pedidos.horarios : null,
    paginasDeModo: Object.keys(dosModos),
  });
  return new Response(mapaDoSitio(origem ?? new URL(pedido.url).origin, caminhos), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
