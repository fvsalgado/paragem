import { NextResponse, type NextRequest } from 'next/server';
import {
  CABECALHO_DO_CAMINHO,
  caminhoDaEntrada,
  ehAEntrada,
  ehDoPainel,
} from '@/lib/painel/guarda';
import { COOKIE_DA_SESSAO, lerSessao } from '@/lib/painel/sessao';
import { decidir, mapaDeDominios } from '@/lib/regiao-host';

/**
 * A porta do multi-região, e a guarda do painel.
 *
 * Cada pedido público é reescrito para o segmento da sua região: o Host diz
 * qual (`regiao-host.ts` traduz e decide), e o caminho passa a `/<regiao>/…`
 * por dentro sem o endereço público mudar. Um anfitrião que não é de nenhuma
 * região vê a página do produto em `/` e um 404 em tudo o resto — nunca a
 * rede de um cliente. Um alias redireciona (308) para o domínio canónico.
 *
 * A decisão é uma função pura (`decidir`), testada frase a frase; isto só a
 * traduz para o que o Next entende. Corre no runtime de edge, à frente de
 * todos os pedidos, e por isso nunca rebenta: uma falha na leitura do mapa
 * devolve o mapa que se tinha, e um mapa vazio faz de todos os anfitriões
 * desconhecidos — a montra, nunca a casa de outra pessoa.
 *
 * O PAINEL vem antes de tudo isto. É um só para todas as regiões e vive fora
 * do segmento: `/admin` em qualquer anfitrião é o painel, e não a página
 * `/admin` de uma região. Sem sessão válida não se entra — é a primeira
 * barreira, e não a única: o layout de `app/admin` volta a exigir a sessão
 * antes de servir qualquer leitura, e cada ação volta a exigi-la do seu lado,
 * porque uma verificação só à porta é uma verificação que um dia alguém
 * contorna com um pedido direto. O que as barreiras partilham está em
 * `painel/guarda.ts`.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (ehDoPainel(pathname)) {
    const resposta = await guardarPainel(request);
    // O painel não é para indexar, nem para ficar em cache de ninguém.
    resposta.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    resposta.headers.set('Cache-Control', 'no-store, must-revalidate');
    return resposta;
  }

  const mapa = await mapaDeDominios();
  const decisao = decidir(request.headers.get('host'), pathname, mapa);
  switch (decisao.tipo) {
    case 'passar':
      return NextResponse.next();
    case 'redirecionar': {
      const destino = new URL(pathname + request.nextUrl.search, `https://${decisao.host}`);
      return NextResponse.redirect(destino, 308);
    }
    case 'reescrever': {
      const destino = request.nextUrl.clone();
      destino.pathname = decisao.para;
      const resposta = NextResponse.rewrite(destino);
      // O que não é endereço não se indexa: é um 404 com outro nome.
      if (decisao.para.startsWith('/-')) resposta.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return resposta;
    }
  }
}

/**
 * Deixa seguir, dizendo ao servidor por onde é que este pedido entrou.
 *
 * O caminho vai num cabeçalho de PEDIDO — é o que `NextResponse.next({ request })`
 * faz, e o que um `response.headers.set` não faria —, porque é a única forma
 * de o layout de `app/admin` o ler com `headers()` e voltar a exigir a sessão
 * do seu lado sem se enganar a si próprio na página de entrada. O `set` é
 * deliberado: apaga o que um visitante tenha tentado mandar com este nome.
 */
function deixarPassar(request: NextRequest): NextResponse {
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set(CABECALHO_DO_CAMINHO, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: cabecalhos } });
}

/**
 * A porta do painel, e a única regra que ela tem: sem sessão válida não se
 * entra.
 *
 * Sem `ADMIN_SESSION_SECRET` não há como verificar um token, e manda-se para
 * a entrada como a qualquer pedido sem sessão — é lá que a falta de
 * configuração se explica («Painel por configurar»), sem abrir nada. O
 * público degrada; a segurança fecha.
 */
async function guardarPainel(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (ehAEntrada(pathname)) return deixarPassar(request);

  const segredo = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get(COOKIE_DA_SESSAO)?.value;
  if (segredo && (await lerSessao(token, segredo))) return deixarPassar(request);

  return NextResponse.redirect(new URL(caminhoDaEntrada(pathname), request.url));
}

export const config = {
  /*
   * Tudo menos os ficheiros do próprio Next. As outras exceções decidem-se no
   * código, onde têm nome, razão e teste — um matcher é uma expressão regular
   * de configuração, e regras de negócio em expressões regulares de
   * configuração são as que ninguém volta a ler.
   */
  matcher: ['/((?!_next/).*)'],
};
