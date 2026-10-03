import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { notFound } from 'next/navigation';
import { exigirRegiao } from '@/lib/dados';
import { desenharEndereco, ficheiroDoEndereco } from '@/lib/feixe';

/**
 * `GET /logotipo/<versão>.svg` no anfitrião de uma região: o desenho do
 * logótipo dela — o endereço em feixe, nas duas versões —, que as páginas usam
 * por `<use>` (`EnderecoEmFeixe.tsx`). As cores não vêm aqui: são as
 * variáveis de CSS da página, que atravessam o `<use>` (`lib/feixe.ts`).
 *
 * A versão vai no caminho, e por isso o ficheiro fica em cache para sempre,
 * no navegador e na borda: um endereço ou um desenho novos são outro caminho.
 * Uma versão que não é a de agora dá 404 — servi-la era guardar para sempre o
 * desenho de agora com o nome de outro.
 *
 * COMPRIME-SE AQUI, e não se deixa ao servidor: o `next start` não comprime o
 * que uma rota devolve, e este desenho são 22 KB em bruto e 3 comprimido — a
 * diferença entre poupar as páginas e pesar-lhes mais do que o desenho dentro
 * delas. Por isso a rota lê o pedido e não fica pré-desenhada: cada versão
 * desenha-se uma vez por codificação, e daí em diante é da cache.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  pedido: Request,
  { params }: { params: Promise<{ regiao: string; ficheiro: string }> },
): Promise<Response> {
  const { regiao, ficheiro } = await params;
  const r = await exigirRegiao(regiao);
  const desenho = desenharEndereco(r.dominio);
  if (!desenho || ficheiro !== `${desenho.versao}.svg`) notFound();

  const svg = Buffer.from(ficheiroDoEndereco(desenho.endereco));
  const aceita = pedido.headers.get('accept-encoding') ?? '';
  const [corpo, codificacao] = /\bbr\b/.test(aceita)
    ? [brotliCompressSync(svg, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), 'br']
    : /\bgzip\b/.test(aceita)
      ? [gzipSync(svg, { level: 9 }), 'gzip']
      : [svg, null];

  return new Response(new Uint8Array(corpo), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      ...(codificacao ? { 'Content-Encoding': codificacao } : {}),
      Vary: 'Accept-Encoding',
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      // Aberto sozinho, um SVG é um documento: este não traz programas, e
      // assim também não os poderia correr.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
