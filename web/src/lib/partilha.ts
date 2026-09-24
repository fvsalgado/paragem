/**
 * O que um sítio diz de si quando alguém partilha uma ligação para ele.
 *
 * Os cartões — a imagem que o WhatsApp, o Facebook ou o Mastodon mostram ao
 * lado da ligação — são desenhados por rotas do sítio (`lib/cartao.tsx`), e
 * não pela convenção `opengraph-image` do Next, pela razão que o Coreto já
 * escreveu no `cartaz` dele: a convenção cunha o endereço a partir do caminho
 * do segmento, e o caminho aqui é o INTERNO, com a região lá dentro. Saía um
 * `og:image` a apontar para `/<regiao>/…`, que do lado de fora é
 * `/<regiao>/<regiao>/…` e dá 404. Assim cada cartão tem um endereço público
 * escrito aqui, o middleware leva-o à região como leva tudo o resto, e as
 * páginas declaram-no por extenso.
 *
 * Este ficheiro é o leve: só endereços e metadados, para os invólucros e as
 * páginas o importarem sem arrastar o desenho dos cartões.
 */
import type { Metadata } from 'next';
import { seguro } from './formato.ts';

/** O que as redes recortam: 1200 × 630, a proporção que toda a gente usa. */
export const CARTAO = { largura: 1200, altura: 630 } as const;

/**
 * O cartão da montra. Vive na raiz e passa pelo middleware sem região — está
 * na lista fechada de `regiao-host.ts`, que o repete à letra (e um teste
 * confere que é o mesmo).
 */
export const CARTAO_DO_PRODUTO = '/cartao-do-produto.png';

/** O cartão de uma região, no domínio dela. */
export const CARTAO_DA_REGIAO = '/cartao.png';

/** O cartão de uma paragem — pelo `stop_id` tal como vem, como `urlDaParagem`. */
export const cartaoDaParagem = (stopId: string): string => `/cartao/paragens/${seguro(stopId)}.png`;

/**
 * Uma origem que se pode escrever num `og:image`: absoluta, `http` ou `https`.
 * As redes não resolvem caminhos relativos — um `og:image` relativo é um
 * cartão que não aparece, sem erro nenhum.
 */
export function origemAbsoluta(origem: string | null | undefined): string | null {
  return origem && /^https?:\/\/[^/]/.test(origem) ? origem.replace(/\/+$/, '') : null;
}

/**
 * O `openGraph` e o `twitter` de uma página, com o cartão.
 *
 * O título e a descrição não se escrevem aqui, de propósito: sem eles, o Next
 * usa os da própria página, e o cartão de uma linha partilhada diz o nome da
 * linha e não o da região. E o objeto vai inteiro, porque o `openGraph` de
 * uma página SUBSTITUI o do invólucro — não se junta a ele.
 *
 * Sem origem conhecida não se promete imagem nenhuma: um `og:image` que não
 * responde é pior do que nenhum.
 */
export function partilha(
  origem: string | null | undefined,
  imagem: string,
  alt: string,
): Pick<Metadata, 'openGraph' | 'twitter'> {
  const base = origemAbsoluta(origem);
  return {
    openGraph: {
      type: 'website',
      locale: 'pt_PT',
      siteName: 'Paragem.pt',
      ...(base
        ? {
            images: [
              { url: `${base}${imagem}`, width: CARTAO.largura, height: CARTAO.altura, alt },
            ],
          }
        : {}),
    },
    twitter: { card: base ? 'summary_large_image' : 'summary' },
  };
}
