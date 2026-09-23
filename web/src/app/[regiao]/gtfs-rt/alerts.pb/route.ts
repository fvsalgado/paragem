import { avisosEmVigor } from '@/lib/avisos';
import { feedDeAvisos } from '@/lib/gtfs-rt';

/**
 * `GET /<regiao>/gtfs-rt/alerts.pb` — os avisos em vigor, em GTFS-RT.
 *
 * É o mesmo que a página de avisos mostra, na forma que uma aplicação de
 * terceiros sabe ler. Serve para que o aviso da autoridade de transportes
 * chegue a quem não vem ao nosso sítio — que é a maior parte das pessoas.
 *
 * DOIS CUIDADOS que não se veem no código:
 *
 *   · o feed é `FULL_DATASET`: cada pedido traz TODOS os avisos em vigor, e
 *     o que não vier deixou de valer. É o único modo que se pode servir de
 *     uma cache sem mentir, e é o certo para quem publica dezenas de avisos
 *     por ano e não milhares por minuto;
 *
 *   · a base a não responder NÃO dá um feed vazio. Um feed vazio quer dizer
 *     «não há avisos», e dizer isso por cima de uma greve é pior do que não
 *     responder. Dá 503, que é o que quem consome sabe interpretar como
 *     «volta a perguntar».
 */
export const revalidate = 60;

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string }> },
): Promise<Response> {
  const { regiao } = await params;
  const avisos = await avisosEmVigor(regiao);

  if (avisos === null) {
    return new Response('não foi possível ler os avisos\n', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' },
    });
  }

  const bytes = feedDeAvisos(
    avisos.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      texto: a.texto,
      gravidade: a.gravidade,
      causa: a.causa,
      efeito: a.efeito,
      inicio: a.inicio,
      fim: a.fim,
      linhas: a.linhas,
      paragens: a.paragens,
      url: a.url,
    })),
  );

  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': 'inline; filename="alerts.pb"',
      // Um minuto, como a leitura. Quem sonda de trinta em trinta segundos
      // não chega à base duas vezes por minuto.
      'cache-control': 'public, max-age=60',
    },
  });
}
