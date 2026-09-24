import type { MetadataRoute } from 'next';
import { exigirRegiao } from '@/lib/dados';
import { COR_DO_PAPEL, CORES_DA_FAIXA } from '@/lib/marca';

/**
 * O manifesto que faz de uma região uma aplicação instalável.
 *
 * É uma rota por região e não o `app/manifest.ts` de convenção, pela mesma
 * razão do Coreto, de onde isto veio: a convenção só vive na raiz, e um
 * manifesto de raiz teria de escolher uma região para o produto inteiro —
 * quem instalasse a rede de uma região a partir do domínio de outra ficava com
 * o nome errado no ecrã. O middleware reescreve `/manifest.webmanifest` para
 * este segmento como faz às páginas, e o invólucro da região declara-o nos
 * metadados, que é o que a convenção faria.
 *
 * Não é um invólucro à volta do sítio: é o mesmo sítio, com um ícone no ecrã
 * principal e sem a barra de endereço a roubar uma faixa ao mapa. Para quem
 * apanha o mesmo autocarro todos os dias — que é para quem isto é feito — a
 * diferença é deixar de o procurar.
 *
 * As decisões que não são óbvias:
 *
 * - `display: 'standalone'` e não `fullscreen`: quem está numa paragem
 *   precisa das horas do telemóvel, que estão na barra de estado.
 * - Nada de `orientation`: prender a aplicação ao retrato parte o mapa num
 *   tablet e não serve ninguém. Manda o equipamento, como manda no navegador.
 * - `theme_color` é a cor da faixa das regiões, e `background_color` é o
 *   papel do sítio — o ecrã de arranque, que dura décimos de segundo. São os
 *   valores de `--marca` e `--fundo`, por `lib/marca.ts`, porque um manifesto
 *   é JSON e não lê CSS.
 * - Sem *service worker*, e é decisão e não esquecimento: o Chrome deixou de o
 *   exigir para instalar, e um horário guardado numa cache velha é pior do que
 *   uma página que não abre — uma página que não abre não manda ninguém para
 *   uma paragem à hora errada.
 *
 * Os ícones saem de `scripts/gerar-icones.mjs`, a partir da mesma marca que
 * está no cabeçalho. O `maskable` é um ficheiro à parte porque o Android
 * recorta o ícone à forma do fabricante: o mesmo desenho, mais pequeno dentro
 * da caixa, para nada ser cortado.
 */
export const revalidate = 3600;

export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ regiao: string }> },
): Promise<Response> {
  const { regiao: id } = await contexto.params;
  const r = await exigirRegiao(id);
  const manifesto: MetadataRoute.Manifest = {
    id: '/',
    name: `Paragem.pt — ${r.nome_com_artigo}`,
    short_name: 'Paragem.pt',
    description: `Todos os transportes ${r.de}, num sítio só.`,
    lang: 'pt-PT',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: COR_DO_PAPEL,
    theme_color: CORES_DA_FAIXA.regiao,
    categories: ['travel', 'navigation'],
    icons: [
      { src: '/icones/paragem-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/paragem-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icones/paragem-512-mascara.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Os atalhos são os do menu do mapa que TODAS as regiões têm: um atalho
    // para uma página que a região não tem era um 404 no ecrã principal.
    shortcuts: [
      {
        name: 'A rede',
        short_name: 'A rede',
        description: 'Linhas, paragens, estações e concelhos.',
        url: '/rede/',
      },
      {
        name: 'Avisos',
        short_name: 'Avisos',
        description: 'Alterações ao serviço.',
        url: '/avisos/',
      },
    ],
  };

  return Response.json(manifesto, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
