import { notFound } from 'next/navigation';
import { concelhos, exigirModo, exigirRegiao, linhas, paragem as lerParagem } from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';

/**
 * `GET /cartao/paragens/<id>.png` — o cartão de partilha de uma paragem.
 *
 * Partilhar uma paragem é a forma mais comum de dizer a alguém «apanha aqui»,
 * e o cartão diz o que essa pessoa precisa de reconhecer: o nome da paragem,
 * os números das linhas que param lá — com a cor de cada uma, como tabuletas —
 * e onde fica. O `<id>` é o do endereço da página (`seguro(stop_id)`), com
 * `.png` à frente; sem a extensão não é um cartão, e é 404.
 *
 * Um cartão não existe onde a página não existe: se o painel desligou os
 * autocarros nesta região, isto também desliga.
 */
export const revalidate = 3600;

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string; id: string }> },
): Promise<Response> {
  const { regiao: rid, id: ficheiro } = await params;
  if (!ficheiro.endsWith('.png')) notFound();
  await exigirModo(rid, 'autocarro');
  const r = await exigirRegiao(rid);
  const ficha = await lerParagem(rid, ficheiro.slice(0, -'.png'.length));
  if (!ficha) notFound();
  const p = ficha.paragem;

  const [cs, ls] = await Promise.all([concelhos(rid), linhas(rid)]);
  const concelho = cs.find((c) => c.id === p.concelho);
  const cores = new Map(ls.map((l) => [l.codigo, l.cor]));

  return desenharCartao({
    faixa: 'regiao',
    titulo: p.nome,
    // Um número por tabuleta: duas linhas com o mesmo número (de operadores
    // diferentes) são uma tabuleta só na placa da paragem, e aqui também.
    linhas: [...new Set(p.linhas)].map((codigo) => ({ codigo, cor: cores.get(codigo) ?? null })),
    subtitulo: concelho ? `Paragem em ${concelho.nome}, ${r.em}` : `Paragem fora ${r.de}`,
    demonstracao: !!r.demonstracao,
  });
}
