import { exigirRegiao } from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';
import { nomesDaAssinatura } from '@/lib/marca';

/**
 * `GET /cartao.png` no anfitrião de uma região: a imagem que acompanha uma
 * ligação ao sítio dela, e a de qualquer página que não tenha a sua
 * (`lib/partilha.ts`). É a assinatura do cabeçalho em ponto grande — o nome
 * da rede e, por baixo, de onde são os transportes —, na cor da faixa.
 *
 * Desenha-se à primeira e serve-se da cache daí em diante, como as páginas:
 * a lista vazia faz da rota «estática com caminhos a pedido», e as leituras
 * levam a etiqueta da região, que o sinal do pipeline invalida.
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string }> },
): Promise<Response> {
  const r = await exigirRegiao((await params).regiao);
  const { principal, secundario } = nomesDaAssinatura(r);
  return desenharCartao(r, { titulo: principal, subtitulo: secundario, assinatura: false });
}
