/**
 * O QUE UMA LIGAÇÃO PARTILHADA MOSTRA — o título, a descrição e a imagem que
 * aparecem no WhatsApp, no Facebook, num email.
 *
 * Não havia nada disto (P3-003): o `<head>` só tinha o título e uma descrição
 * igual em todas as páginas de uma região — «Todos os transportes de…, num
 * sítio só.» na paragem, na linha e no tarifário. O gesto mais natural com
 * este sítio é «manda-me o horário da paragem», e a pré-visualização saía sem
 * imagem e sem dizer de que paragem era.
 *
 * Duas regras, e uma razão para cada uma:
 *
 *   · CADA PÁGINA DIZ O QUE É, E DE ONDE: o título do cartão é o da página
 *     com o nome da região e sem a marca («Pedra Alta (Mercado) · Serra da
 *     Pedra Alta»), e a descrição sai dos dados da página. Uma descrição igual
 *     em três mil páginas é um resultado de pesquisa inútil no dia em que a
 *     indexação abrir;
 *   · O CARTÃO VAI INTEIRO EM CADA PÁGINA. O Next junta os metadados de cada
 *     nível do encaminhamento campo a campo, mas o `openGraph` de uma página
 *     SUBSTITUI o do invólucro em vez de se lhe juntar: uma página que só
 *     dissesse o título perdia a imagem. Por isso as páginas pedem o cartão a
 *     estas funções, e não o escrevem à mão.
 *
 * As moradas vão relativas: o invólucro de cada anfitrião declara a sua
 * (`metadataBase`), e é com ela que o Next as completa — a de uma região é a
 * dela, e a imagem de partilha sai pelo domínio dela.
 */
import type { Metadata } from 'next';
import type { Regiao } from './formato';

/**
 * A imagem de partilha do PRODUTO (`scripts/imagens-do-produto.mjs partilha`),
 * 1200 × 630. As regiões usam-na até terem a sua — e quando tiverem, é aqui
 * que a escolha se faz.
 */
export const IMAGEM_DE_PARTILHA = {
  url: '/produto/partilha.png',
  width: 1200,
  height: 630,
  alt: 'Paragem.pt: os transportes de um território, num sítio só.',
} as const;

function cartao(titulo: string, descricao: string, caminho: string | undefined, sitio: string) {
  return {
    openGraph: {
      type: 'website' as const,
      locale: 'pt_PT',
      siteName: sitio,
      title: titulo,
      description: descricao,
      ...(caminho ? { url: caminho } : {}),
      images: [IMAGEM_DE_PARTILHA],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: titulo,
      description: descricao,
      images: [IMAGEM_DE_PARTILHA.url],
    },
  };
}

/** Os metadados de uma página do produto. `absoluto` dispensa o «· Paragem.pt» do modelo. */
export function metadadosDoProduto(p: {
  titulo: string;
  descricao: string;
  caminho: string;
  absoluto?: boolean;
}): Metadata {
  return {
    title: p.absoluto ? { absolute: p.titulo } : p.titulo,
    description: p.descricao,
    alternates: { canonical: p.caminho },
    ...cartao(p.titulo, p.descricao, p.caminho, 'Paragem.pt'),
  };
}

/**
 * Os metadados de uma página de uma região. Sem `titulo` é o início dela, que
 * fica com o título por omissão do invólucro («Transportes da …»). Sem
 * `caminho` é o cartão por omissão do invólucro — o de uma página que não
 * pede o seu, como a de «não encontrada» —, e aí não há morada canónica: uma
 * página que não existe não aponta para o início como se fosse ele.
 */
export function metadadosDaRegiao(
  r: Pick<Regiao, 'nome' | 'de'>,
  p: { titulo?: string; descricao: string; caminho?: string },
): Metadata {
  const doCartao = p.titulo ? `${p.titulo} · ${r.nome}` : `Transportes ${r.de}`;
  return {
    ...(p.titulo ? { title: p.titulo } : {}),
    description: p.descricao,
    ...(p.caminho ? { alternates: { canonical: p.caminho } } : {}),
    ...cartao(doCartao, p.descricao, p.caminho, `${r.nome} · Paragem.pt`),
  };
}
