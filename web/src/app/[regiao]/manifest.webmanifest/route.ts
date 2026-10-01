import { regiao } from '@/lib/dados';
import { manifesto, respostaDeManifesto } from '@/lib/manifesto';

/**
 * `GET /manifest.webmanifest` no anfitrião de uma região: o que fica no ecrã
 * principal de quem o instala na paragem. Chama-se como a região e abre no
 * mapa dela — quem o instalou quer os transportes da sua terra, e não a
 * página do produto.
 *
 * O nome curto é o da região, sem artigo: é o que aparece por baixo do ícone,
 * e cabe lá. Os ícones são os do produto até a região ter os seus.
 */
export const revalidate = 3600;

export async function GET(
  _pedido: Request,
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
  return respostaDeManifesto(
    manifesto({
      nome: `Transportes ${r.de}`,
      nomeCurto: r.nome,
      descricao: `Todos os transportes ${r.de}, num sítio só.`,
    }),
  );
}
