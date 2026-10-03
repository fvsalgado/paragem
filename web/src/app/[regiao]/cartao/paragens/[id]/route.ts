import { notFound } from 'next/navigation';
import { concelhos, exigirModo, exigirRegiao, linhas, paragem } from '@/lib/dados';
import { desenharCartao } from '@/lib/cartao';
import { idDoCartao } from '@/lib/partilha';

/**
 * `GET /cartao/paragens/<id>.png`: a imagem de quem manda o horário de uma
 * paragem a alguém. O nome dela, as linhas que lá passam, cada uma com a
 * sua cor, e o concelho.
 *
 * Responde ao que a página da paragem responde: 404 numa região desligada,
 * com o autocarro desligado, ou numa paragem que não existe.
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
  const [ficha, catalogo, cs] = await Promise.all([paragem(rid, id), linhas(rid), concelhos(rid)]);
  if (!ficha) notFound();
  const p = ficha.paragem;

  // A COR PELO IDENTIFICADOR DA LINHA, como na página: há números que se
  // repetem entre concessões, e pelo número a segunda herdava a cor da
  // primeira. O identificador sai das partidas; uma linha sem partidas aqui
  // só leva cor quando o número é de UMA linha — senão vai neutra.
  //
  // E A ORDEM É A DA REDE (`ordem` do catálogo), e não a da ficha, que vem
  // por ordem alfabética: «1, 11, 2, 21» numa tabuleta lê-se como um erro.
  const porId = new Map(catalogo.map((l) => [l.id, l]));
  const tabuletas = p.linhas
    .map((codigo) => {
      const daPartida = ficha.partidas.find((d) => d.linha === codigo)?.linha_id;
      const doNumero = catalogo.filter((l) => l.codigo === codigo);
      const linha =
        (daPartida ? porId.get(daPartida) : undefined) ??
        (doNumero.length === 1 ? doNumero[0] : undefined);
      return { codigo, cor: linha?.cor ?? null, ordem: linha?.ordem ?? codigo };
    })
    .sort((a, b) => a.ordem.localeCompare(b.ordem, 'pt', { numeric: true }))
    .map(({ codigo, cor }) => ({ codigo, cor }));

  // «Horário planeado» só quando há partidas para mostrar: uma paragem sem
  // nenhuma não promete horário no cartão que a página não tem.
  const concelho = cs.find((c) => c.id === p.concelho);
  const subtitulo = [
    concelho ? `Paragem em ${concelho.nome}` : 'Paragem',
    p.partidas > 0 ? 'horário planeado' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return desenharCartao(r, { titulo: p.nome, linhas: tabuletas, subtitulo });
}
