import { notFound } from 'next/navigation';
import { exigirModo, exigirRegiao, linhaDetalhe } from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';
import { idDoCartao } from '@/lib/partilha';

/**
 * `GET /cartao/linhas/<id>.png`: a imagem de quem manda uma linha a alguém.
 * O número na cor dela, como nas tabuletas do sítio, e o nome.
 *
 * Responde ao que a página da linha responde: 404 numa região desligada, com
 * o autocarro desligado, ou numa linha que não existe.
 */
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ regiao: string; id: string }> },
): Promise<Response> {
  const { regiao: rid, id: segmento } = await params;
  const id = idDoCartao(segmento);
  if (!id) notFound();
  const r = await exigirRegiao(rid);
  await exigirModo(rid, 'autocarro');
  const l = await linhaDetalhe(rid, id);
  if (!l) notFound();
  return desenharCartao(r, {
    titulo: l.nome,
    linhas: [{ codigo: l.codigo, cor: l.cor }],
    // Sem viagens no horário, a página só tem o percurso: o cartão não
    // promete mais do que ela.
    subtitulo: l.viagens > 0 ? 'Horário planeado, percurso e paragens' : 'Percurso e paragens',
  });
}
