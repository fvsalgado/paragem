import { normalizarHost } from '@/lib/regiao-host';
import { origemDoProduto } from '@/lib/produto';

/**
 * `GET /robots.txt` no anfitrião do PRODUTO — e este deixa indexar.
 *
 * Havia um ficheiro só, em `public/`, servido igual a todos os anfitriões, e o
 * `Disallow: /` que lá está por causa dos horários (§4.4) fechava também esta
 * página, que não tem horário nenhum (P4-004). Um decisor a quem falaram do
 * produto, e que o procurava pelo nome, não o encontrava — e a página dizia
 * que as páginas «são indexáveis». As regiões continuam com a regra delas,
 * tal e qual (`app/[regiao]/robots.txt`).
 *
 * SÓ NO ENDEREÇO DO PRODUTO. Esta página responde a qualquer anfitrião que o
 * mapa de domínios não conheça: o endereço provisório de uma publicação, o
 * domínio de um cliente apontado para cá antes de a região dele existir. Aí
 * fecha-se a porta — a mesma página indexada em dois endereços põe-nos a
 * competir um com o outro, e um deles nem é nosso. Quem diz qual é o endereço
 * do produto é `NEXT_PUBLIC_PARAGEM_PRODUTO`; sem ela não se sabe, e abre-se
 * no anfitrião de quem pergunta, que é o que há.
 */
export function GET(pedido: Request): Response {
  const canonica = origemDoProduto();
  const host = normalizarHost(pedido.headers.get('host'));
  const daqui = !canonica || canonica.hostname === host;
  const origem = (canonica ?? new URL(pedido.url)).origin;

  const texto = daqui
    ? `# A página do Paragem.pt: o produto, o contacto, a privacidade e a
# acessibilidade. Não tem horários — os horários vivem nos endereços das
# regiões, e cada uma responde o seu robots.txt, que continua fechado até a
# autoridade de transportes autorizar a publicação.
#
# Esta deixa-se encontrar: quem ouve falar do produto e o procura pelo nome
# tem de dar com ele.

User-agent: *
Allow: /
Disallow: /admin/

Sitemap: ${origem}/sitemap.xml
`
    : `# Este endereço mostra a página do Paragem.pt, mas não é o dela. A do
# produto é esta:
#
#   ${origem}/
#
# A mesma página indexada em dois endereços põe-nos a competir um com o outro.

User-agent: *
Disallow: /
`;

  return new Response(texto, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
