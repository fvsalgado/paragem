/**
 * O MANIFESTO — o que o telemóvel lê para pôr o sítio no ecrã principal.
 *
 * Não havia nenhum, nem ícone, nem cor de tema (P3-004): o atalho era uma
 * letra num quadrado cinzento, abria com a barra do navegador, e no separador
 * e nos favoritos não havia marca nenhuma. Pôr o sítio no ecrã principal é a
 * maneira natural de o ter à mão na paragem.
 *
 * UM POR ANFITRIÃO: o de uma região chama-se como ela e abre nela — quem o
 * instala quer os transportes da sua terra, não a página do produto. Os
 * ícones são os do produto até a região ter os seus.
 *
 * As cores são as do §6: o fundo do sítio e a cor da marca.
 */

/**
 * A cor da barra do navegador e do ecrã de arranque do PRODUTO: o azul-noite,
 * que é a marca a uma cor (§6). Foi o azul antigo da marca, que não é nenhuma
 * das cores do feixe; a 3/10/2026 o desenho do produto passou a sair do
 * logótipo. Uma região usa a cor dela (`app/[regiao]/layout.tsx`).
 */
export const COR_DO_TEMA = '#102C3F';
/** O fundo do sítio (§6), que é também o do quadrado do ícone. */
export const COR_DE_FUNDO = '#F5F7F4';

/**
 * Os ícones do ecrã principal: o «p» vetorial do feixe, em papel, tirado de
 * `lib/marca-do-produto.ts` por `scripts/imagens-do-produto.mjs`. O
 * «maskable» é o mesmo desenho, a cheio e mais pequeno, para o Android o poder
 * recortar num círculo sem lhe comer o bojo.
 *
 * O `icon.svg` NÃO ENTRA AQUI. É o «p» desenhado ao píxel para 16 px, e um
 * SVG com `sizes: any` é o que o Chrome escolhe para o ecrã principal: o
 * atalho saía com os píxeis de um ícone de separador ampliados doze vezes.
 */
export const ICONES = [
  { src: '/produto/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/produto/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: '/produto/icone-mascaravel-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
] as const;

export function manifesto(p: {
  nome: string;
  nomeCurto: string;
  descricao: string;
  /** A cor da marca da região, quando é dela; sem ela, a do produto. */
  corDoTema?: string;
}) {
  return {
    name: p.nome,
    short_name: p.nomeCurto,
    description: p.descricao,
    lang: 'pt-PT',
    dir: 'ltr',
    // A raiz do anfitrião: numa região é o mapa dela, no produto é a montra.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: COR_DE_FUNDO,
    theme_color: p.corDoTema ?? COR_DO_TEMA,
    icons: ICONES,
  };
}

/** A resposta, com o tipo que o manifesto pede. */
export function respostaDeManifesto(m: ReturnType<typeof manifesto>): Response {
  return new Response(JSON.stringify(m, null, 2), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
