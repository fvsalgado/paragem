import { dadosAbertos } from '@/lib/dados';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { ficheiroDaDescarga } from '@/lib/descargas';

/**
 * `GET /dados-abertos/<caminho>` — uma descarga, PELO DOMÍNIO DA REGIÃO
 * (P4-025).
 *
 * As ligações da página de dados abertos levavam direto ao armazém, num
 * endereço do fornecedor de alojamento (`<ref>.supabase.co/…`): quem as
 * copiava para um portal de dados, ou para o sítio da câmara, copiava o nome
 * do fornecedor — e o endereço mudava no dia em que o armazém mudasse.
 *
 * REDIRECIONA, NÃO SERVE. Os ficheiros são de dezenas de MB, e o armazém
 * serve-os de perto e por intervalos de bytes; uma função no meio a copiá-los
 * era pô-lo atrás de alguma coisa mais lenta, e pagar cada byte duas vezes.
 * O endereço que se publica é o da região; os bytes continuam a vir de onde
 * sempre vieram.
 *
 * SÓ O QUE A PÁGINA LISTA. Um caminho que não está no catálogo das descargas
 * — um ficheiro de construção, um relatório interno, um modo desligado no
 * painel — dá 404, e não um redirecionamento para o armazém às cegas.
 */
export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string; ficheiro: string[] }> },
): Promise<Response> {
  const { regiao, ficheiro } = await params;
  const d = ficheiroDaDescarga(await dadosAbertos(regiao), ficheiro);
  if (!d) {
    return new Response('Não há esse ficheiro nos dados abertos desta região.\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: enderecoDosDados(regiao, `descargas/${d.caminho ?? d.ficheiro}`),
      // Cinco minutos: o destino só muda com uma publicação, e uma ligação
      // velha ao armazém continua a dar o ficheiro até à seguinte.
      'cache-control': 'public, max-age=300',
    },
  });
}
