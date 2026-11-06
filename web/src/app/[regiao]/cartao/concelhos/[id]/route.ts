import { notFound } from 'next/navigation';
import {
  aPedido,
  concelhos,
  estacoes,
  exigirRegiao,
  linhaDetalhe,
  linhas,
  paragens,
} from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';
import { numerosDoConcelho, passaNoConcelho } from '@/lib/concelho';
import type { LinhaDetalhe } from '@/lib/formato';
import { idDoCartao } from '@/lib/partilha';
import { numero } from '@/lib/prosa';

/**
 * `GET /cartao/concelhos/<id>.png`: a imagem de quem manda a página de um
 * concelho a alguém. O nome dele e os números por modo — as paragens, as
 * linhas, as estações e as zonas a pedido —, os mesmos que a página mostra
 * por baixo do título (`numerosDoConcelho`). Ia o cartão da região, e quem
 * recebia a ligação de um concelho via o nome da rede e mais nada.
 *
 * Responde ao que a página do concelho responde: 404 numa região desligada,
 * ou num concelho que não existe.
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
  const c = (await concelhos(rid)).find((x) => x.id === id);
  if (!c) notFound();

  // A MESMA CONTA DA PÁGINA: as paragens e as estações do concelho, as linhas
  // que passam mesmo aqui (não só as que têm o número numa paragem), e as
  // zonas a pedido dele ou com uma ponta nele.
  const [todas, todasAsEstacoes, indice, pedido] = await Promise.all([
    paragens(rid),
    estacoes(rid),
    linhas(rid),
    aPedido(rid),
  ]);
  const ps = todas.filter((p) => p.concelho === c.id);
  const aqui = new Set(ps.map((p) => p.id));
  const codigos = new Set(ps.flatMap((p) => p.linhas));
  const passam = (
    await Promise.all(
      indice.filter((l) => codigos.has(l.codigo)).map((l) => linhaDetalhe(rid, l.id)),
    )
  ).filter((l): l is LinhaDetalhe => !!l && passaNoConcelho(l, aqui));
  const zonas = (pedido?.zonas ?? []).filter(
    (z) => z.concelho === c.id || (z.entre ?? []).includes(c.id),
  );
  const numeros = numerosDoConcelho({
    paragens: ps.length,
    linhas: passam.length,
    estacoes: todasAsEstacoes.filter((e) => e.concelho === c.id).length,
    zonas: zonas.length,
  }).filter((x) => x.n > 0);

  return desenharCartao(r, {
    titulo: c.nome,
    subtitulo: ['Concelho', ...numeros.map((x) => `${numero(x.n)} ${x.rotulo}`)].join(' · '),
  });
}
