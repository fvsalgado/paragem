import { desenharCartao } from '@/lib/cartao';

/**
 * `GET /cartao-do-produto.png` — o cartão de partilha da montra.
 *
 * Na raiz e fora de qualquer região, porque a montra responde a qualquer
 * anfitrião que não é de ninguém: o caminho está na lista fechada do
 * middleware (`regiao-host.ts`) e passa tal como está. Não lê dados nenhuns,
 * e por isso desenha-se uma vez, na construção.
 */
export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  return desenharCartao({
    faixa: 'montra',
    titulo: 'Todos os transportes de uma região, num sítio só',
    subtitulo:
      'Autocarros, comboios, transporte a pedido, bicicletas, expressos e táxis — seja quem for que os gere.',
  });
}
