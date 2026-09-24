import { exigirRegiao } from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';

/**
 * `GET /cartao.png` — o cartão de partilha de uma região, no domínio dela.
 *
 * É o que aparece ao lado de qualquer ligação para a região que não tenha o
 * seu próprio cartão: o início, a rede, uma linha. Diz o nome da região e o
 * que o sítio é, na faixa da cor das regiões.
 */
export const revalidate = 3600;

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string }> },
): Promise<Response> {
  const { regiao: id } = await params;
  const r = await exigirRegiao(id);
  return desenharCartao({
    faixa: 'regiao',
    titulo: r.nome,
    subtitulo: `Todos os transportes ${r.de}, num sítio só.`,
    demonstracao: !!r.demonstracao,
  });
}
