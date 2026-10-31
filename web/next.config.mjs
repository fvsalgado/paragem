/**
 * O sítio deixou de ser exportação estática (CLAUDE.md §11.7).
 *
 * Foi `output: 'export'` enquanto serviu uma região: as páginas saíam do GTFS
 * na construção e o CI enviava os ficheiros prontos. A segunda região não
 * cabia no limite de ficheiros da plataforma, e o painel do dono não podia
 * esperar dezoito minutos por uma reconstrução. As páginas continuam a ser
 * servidas da cache como ficheiros — `revalidate` no invólucro de cada região,
 * etiquetas por região nas leituras (`src/lib/dados.ts`) — e invalidam-se por
 * sinal (`/api/revalidate`). A plataforma constrói o sítio a partir do Git; os
 * dados chegam do armazém em tempo de pedido.
 *
 * `trailingSlash` fica: todas as ligações internas terminam em `/`, e mudar
 * isso era mudar todos os endereços de uma vez.
 */
import { createRequire } from 'node:module';

/**
 * A versão do MapLibre instalada, para o mapa saber em que pasta de
 * `public/maplibre/` está o que o `scripts/copiar-maplibre.mjs` lá pôs. Vai
 * cravada no código do navegador na construção, como as outras
 * `NEXT_PUBLIC_*`: a pasta e o código saem da mesma instalação.
 */
const { version: MAPLIBRE } = createRequire(import.meta.url)('maplibre-gl/package.json');

/**
 * OS CABEÇALHOS DE SEGURANÇA, os mesmos do Coreto (`apps/web/next.config.ts`),
 * com as diferenças que este sítio pede e escritas ao lado.
 *
 * Não havia nenhum: só o HSTS que a plataforma põe por omissão. A entrada do
 * painel podia ser emoldurada por outro sítio, e nada impedia um `<object>`
 * ou um `<base>` injetados de mudar o que a página carrega.
 *
 * **O `connect-src` aceita qualquer `https:`, e é uma decisão.** O navegador
 * fala com o armazém dos dados, com a base, com a medição, com o motor de
 * viagens e com o serviço de disponibilidade de cada região — e os endereços
 * do motor e da disponibilidade leem-se no SERVIDOR, a cada pedido
 * (`lib/enderecos.ts`), enquanto estes cabeçalhos se escrevem na construção.
 * Uma lista fechada partia o planeador de uma região no dia em que ela
 * ganhasse um motor sem nova construção. O que se fecha é o que uma página
 * injetada mais usaria: scripts de fora, molduras, formulários, `<base>`.
 *
 * Nos testes o sítio corre por HTTP (`PARAGEM_ESQUEMA=http`), com o armazém e
 * o motor em `127.0.0.1` e as regiões em `*.localhost`: aí aceitam-se esses
 * anfitriões por HTTP, e o `upgrade-insecure-requests` fica de fora, porque
 * levava os pedidos para um HTTPS que ali não existe.
 */
const POR_HTTP = process.env.PARAGEM_ESQUEMA === 'http';
const LOCAIS = POR_HTTP ? ['http://127.0.0.1:*', 'http://localhost:*', 'http://*.localhost:*'] : [];

const CSP = [
  "default-src 'self'",
  // `'unsafe-inline'` nos scripts, pela mesma razão do Coreto: o App Router
  // arranca com scripts inline, e o guião do tema também o é (`lib/tema.ts`).
  // A alternativa (um nonce por pedido) obrigava a renderizar cada página a
  // pedido e deitava fora a cache que deixa este sítio de pé com o motor em
  // baixo. A medição vem empacotada, sem scripts de fora (`lib/medicao.ts`).
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  ['img-src', "'self'", 'data:', 'blob:', 'https:', ...LOCAIS].join(' '),
  "font-src 'self' data:",
  ['connect-src', "'self'", 'https:', ...LOCAIS].join(' '),
  // O processador do mapa (`/maplibre/`) e os que ele cria.
  "worker-src 'self' blob:",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  ...(POR_HTTP ? [] : ['upgrade-insecure-requests']),
].join('; ');

/**
 * O que o navegador não deixa esta página fazer. A localização fica para o
 * próprio sítio: é o «Perto de ti», e só se pede a carregar no botão.
 */
const PERMISSOES = [
  'accelerometer=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=(self)',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'serial=()',
  'usb=()',
].join(', ');

/**
 * Um dia, sem subdomínios e sem `preload`, para começar (decisão do dono a
 * 31/10/2026). Um HSTS servido fica no navegador de quem visitou até acabar o
 * prazo, e não se retira: começa curto enquanto se confirma que a região do
 * cliente vive bem com os cabeçalhos novos, e sobe depois para os dois anos
 * com subdomínios (63072000; includeSubDomains) num PR à parte. Nunca
 * `preload`: a lista dos navegadores aceita qualquer domínio que sirva a
 * palavra, sem verificar de quem é, e sair dela demora meses.
 */
const HSTS = 'max-age=86400';

export const CABECALHOS_DE_SEGURANCA = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: HSTS },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: PERMISSOES },
  // Isola o `window.opener`, e deixa as janelas que se abrem para fora — o
  // sítio de reservas do transporte a pedido, o de uma câmara — continuarem a
  // abrir.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

/**
 * As caixas que as câmaras colam nos sítios delas (`/widget/…`) são a exceção:
 * existem para viver dentro de um `<iframe>` alheio. Sem `X-Frame-Options` e
 * com `frame-ancestors *`; sem `Cross-Origin-Opener-Policy`, que só vale para
 * contextos de topo.
 */
export const CABECALHOS_DAS_CAIXAS = [
  {
    key: 'Content-Security-Policy',
    value: CSP.replace("frame-ancestors 'none'", 'frame-ancestors *'),
  },
  { key: 'Strict-Transport-Security', value: HSTS },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

/**
 * OS FICHEIROS QUE NÃO SÃO PÁGINAS não levam os cabeçalhos delas.
 *
 * A política de conteúdo, as molduras, as permissões e o isolamento da janela
 * só valem num documento: num pedaço de JavaScript, numa letra ou num glifo o
 * navegador ignora-os. E pesam: são 1,1 KiB por resposta, e uma página da rede
 * pede vinte e duas — medido a 13/10/2026, quando estes cabeçalhos entraram e o
 * orçamento de peso do Lighthouse (`tests/lighthouse.mjs`) apanhou 16 a 20 KiB
 * a mais em cada página. A expressão é a que a documentação do Next usa para a
 * política de conteúdo — tudo menos `_next/static` e `_next/image` —, e aqui
 * também o processador do mapa, os glifos e as imagens.
 *
 * O `nosniff` fica em todos, porque é neles que conta: é o que impede um
 * ficheiro servido com o tipo errado de correr como script ou folha de estilos.
 *
 * AS IMAGENS levam, além dele, uma política de conteúdo própria, e curta. Um
 * SVG aberto sozinho no separador é um documento, e podia correr scripts; a
 * política fecha-lhe tudo menos os estilos que ele traz dentro (o ícone muda
 * de cor com o tema, e o logótipo pinta-se com as variáveis da região). Num
 * PNG não faz nada, e não custa nada.
 */
export const FICHEIROS = '/:pasta(_next/static|_next/image|maplibre|glifos)/:caminho*';
export const IMAGENS = '/(.*\\.(?:svg|png|ico))';
export const PAGINAS =
  '/((?!widget/|_next/static/|_next/image|maplibre/|glifos/)(?!.*\\.(?:svg|png|ico)$).*)';
export const CABECALHOS_DOS_FICHEIROS = [{ key: 'X-Content-Type-Options', value: 'nosniff' }];
export const CABECALHOS_DAS_IMAGENS = [
  { key: 'Content-Security-Policy', value: "default-src 'none'; style-src 'unsafe-inline'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

const config = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_MAPLIBRE: MAPLIBRE },
  poweredByHeader: false,
  trailingSlash: true,
  images: { unoptimized: true },
  /*
   * OS METADADOS VÃO NO <head>, SEMPRE — e não a meio da página.
   *
   * O Next 15 «transmite» os metadados: se o `generateMetadata` acaba depois
   * de o cabeçalho do HTML ter saído, o título, a descrição e o `og:*` vão
   * parar ao corpo, e o navegador arruma-os depois. Só os manda no `<head>`
   * aos robôs que ele conhece. Mas aqui as páginas ficam em cache: a primeira
   * visita rende-a, e a cópia serve toda a gente durante uma hora — também o
   * WhatsApp que pede a pré-visualização da paragem, e que só lê o `<head>`.
   * Medido antes de escrever isto: na mesma construção, a página de uma
   * paragem saía com os metadados no `<head>` e a de uma linha no corpo,
   * conforme a leitura dos dados acabava antes ou depois.
   *
   * Tratar todos os pedidos como robôs põe os metadados no `<head>` em todas
   * as renderizações. O custo é o cabeçalho esperar pelos metadados — que
   * leem os mesmos dados que a página já está à espera de ler.
   */
  htmlLimitedBots: /.*/,
  /*
   * A LETRA DOS CARTÕES DE PARTILHA vai com as rotas que os desenham
   * (`src/lib/cartao.tsx`). Hoje o rastreio dos ficheiros de cada função já a
   * apanha sozinho — o nome sai de uma lista, e ele leva a pasta inteira —,
   * mas isso é um pormenor do rastreador, e a falta dela não rebenta nada: o
   * cartão desenhava-se com a letra de reserva, e ninguém dava por isso. Por
   * isso diz-se aqui. As chaves são padrões sobre o caminho da rota, e o
   * `[regiao]` não se escreve: num padrão, parênteses retos são uma classe de
   * caracteres.
   */
  outputFileTracingIncludes: {
    '/*/cartao.png': ['./src/fontes/*.ttf'],
    '/*/cartao/**': ['./src/fontes/*.ttf'],
  },
  async headers() {
    return [
      // As caixas para os sítios das câmaras, as páginas, os ficheiros e as
      // imagens, cada um com os seus — a expressão das páginas deixa os outros
      // de fora.
      { source: '/widget/:caminho*', headers: CABECALHOS_DAS_CAIXAS },
      { source: PAGINAS, headers: CABECALHOS_DE_SEGURANCA },
      { source: FICHEIROS, headers: CABECALHOS_DOS_FICHEIROS },
      { source: IMAGENS, headers: CABECALHOS_DAS_IMAGENS },
      // O processador do mapa leva a versão no caminho
      // (`scripts/copiar-maplibre.mjs`): um caminho que muda com a versão pode
      // ser imutável, e um Worker que não se volta a pedir é um mapa que abre
      // mais depressa na segunda visita.
      {
        source: '/maplibre/:versao/:ficheiro',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // OS GLIFOS DO MAPA (70 kB por gama de letras) não mudam de uma visita
      // para a outra: sem isto, cada abertura do mapa voltava a perguntar por
      // eles ao servidor — uma ida e volta inteira, em 4G, antes de os nomes
      // das terras se poderem desenhar. Não levam versão no caminho, por isso
      // uma semana e não um ano: um glifo novo chega na semana em que muda.
      {
        source: '/glifos/:fonte/:gama',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default config;
