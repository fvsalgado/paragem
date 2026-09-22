/**
 * O que as duas barreiras de `/admin` têm de saber uma da outra.
 *
 * O painel é guardado em dois sítios: o middleware, à porta, e o layout de
 * `app/admin`, já dentro do servidor. Não é redundância por gosto — uma
 * verificação só à porta é uma verificação que um dia alguém contorna com
 * um pedido direto, e as escritas pedem ainda a sessão uma terceira vez, em
 * cada ação. Duas barreiras só valem se disserem o mesmo, e por isso o que
 * elas partilham vive aqui: o nome do cabeçalho por onde uma fala com a
 * outra, e a conta de para onde se manda quem não tem sessão.
 *
 * Este módulo não importa nada — corre tal e qual no runtime de edge do
 * middleware e no servidor das páginas. Levantado do Coreto (`admin/guarda.ts`).
 */

/**
 * O cabeçalho de PEDIDO com que o middleware diz ao layout qual o caminho de
 * `/admin` que deixou passar. Tem de ser um cabeçalho de pedido
 * (`NextResponse.next({ request: { headers } })`): só esses é que o
 * `headers()` de um componente de servidor lê. Que um visitante o possa forjar
 * não muda nada — o middleware reescreve-o em todos os pedidos a `/admin`.
 */
export const CABECALHO_DO_CAMINHO = 'x-paragem-caminho-admin';

/**
 * O endereço da entrada. Um só, para as duas barreiras não divergirem — e com
 * a barra no fim, como todos os endereços deste sítio (`trailingSlash`).
 */
export const CAMINHO_DA_ENTRADA = '/admin/entrar/';

/** `/admin/auditoria/` e `/admin/auditoria` são o mesmo sítio. */
function semBarraFinal(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** `/admin` e tudo o que está debaixo dele — e não `/administracao`. */
export function ehDoPainel(pathname: string): boolean {
  const caminho = semBarraFinal(pathname);
  return caminho === '/admin' || caminho.startsWith('/admin/');
}

export function ehAEntrada(pathname: string): boolean {
  return semBarraFinal(pathname) === semBarraFinal(CAMINHO_DA_ENTRADA);
}

/**
 * Para onde mandar um pedido a `/admin` que não tem sessão. Guarda-se o
 * caminho a que a pessoa ia, em `destino`, para não se perder o gesto ao
 * entrar; `/admin` não leva destino porque é para lá que a entrada vai dar de
 * qualquer maneira, e a própria entrada também não.
 */
export function caminhoDaEntrada(pathname: string): string {
  const caminho = semBarraFinal(pathname);
  if (ehAEntrada(caminho) || caminho === '/admin') return CAMINHO_DA_ENTRADA;
  return `${CAMINHO_DA_ENTRADA}?${new URLSearchParams({ destino: `${caminho}/` })}`;
}

/**
 * Só caminhos do painel. Um `destino` para fora virava a entrada num
 * redirecionador aberto; um `//` é «outra origem» para um navegador.
 */
export function destinoSeguro(destino: string | undefined): string {
  if (!destino || destino.startsWith('//') || !ehDoPainel(destino)) return '/admin/';
  return destino;
}

/**
 * Para onde o layout tem de mandar este pedido, ou `null` quando o serve.
 *
 * Barra-se quando não há sessão, E o middleware disse por onde o pedido
 * entrou, E esse caminho não é a entrada — porque o layout também envolve a
 * `/admin/entrar`, e uma guarda ingénua redirecionava a página de entrada
 * para si própria, em ciclo. Sem cabeçalho não se barra: é o caso patológico
 * de o middleware não ter corrido, e nele quem tinha de barrar era ele —
 * esta é a segunda barreira, não a substituta da primeira.
 */
export function barreiraDoLayout(temSessao: boolean, cabecalho: string | null): string | null {
  if (temSessao) return null;
  if (!cabecalho || ehAEntrada(cabecalho)) return null;
  return caminhoDaEntrada(cabecalho);
}
