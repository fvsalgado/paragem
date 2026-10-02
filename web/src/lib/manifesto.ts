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

/** A cor da barra do navegador e do ecrã de arranque: a da marca (§6). */
export const COR_DO_TEMA = '#0A5C7A';
/** O fundo do sítio (§6), que é também o do quadrado do ícone. */
export const COR_DE_FUNDO = '#F5F7F4';

/**
 * Os ícones, todos tirados do `app/icon.svg` por
 * `scripts/imagens-do-produto.mjs`. O «maskable» é o mesmo desenho, a cheio e
 * mais pequeno, para o Android o poder recortar num círculo sem lhe comer a
 * placa.
 */
export const ICONES = [
  { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
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
