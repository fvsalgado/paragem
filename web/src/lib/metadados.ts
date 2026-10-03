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
 *
 * A IMAGEM É DE QUEM É A PÁGINA. A do produto é o cartão do produto, com o
 * feixe a cores; a de uma região é o cartão dela (`lib/partilha.ts`), com o
 * endereço dela em feixe, nos tons dela, e sem o vermelho do produto (§6) — e
 * a paragem e a linha têm cada uma o seu, com o nome e as linhas que lá passam.
 */
import type { Metadata } from 'next';
import type { Regiao } from './formato';
import { desenhavel } from './feixe.ts';
import { nomesDaAssinatura } from './marca.ts';
import { CARTAO, CARTAO_DA_REGIAO } from './partilha.ts';

/** Uma imagem de partilha: a morada, relativa, e o que ela mostra, para quem não a vê. */
export type ImagemDePartilha = { url: string; alt: string };

/** A imagem de partilha do PRODUTO (`scripts/imagens-do-produto.mjs partilha`). */
export const IMAGEM_DE_PARTILHA: ImagemDePartilha = {
  url: '/produto/partilha.png',
  alt: 'Paragem.pt: os transportes de um território, num sítio só.',
};

function cartao(
  titulo: string,
  descricao: string,
  caminho: string | undefined,
  sitio: string,
  imagem: ImagemDePartilha,
) {
  return {
    openGraph: {
      type: 'website' as const,
      locale: 'pt_PT',
      siteName: sitio,
      title: titulo,
      description: descricao,
      ...(caminho ? { url: caminho } : {}),
      images: [{ url: imagem.url, width: CARTAO.largura, height: CARTAO.altura, alt: imagem.alt }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: titulo,
      description: descricao,
      images: [{ url: imagem.url, alt: imagem.alt }],
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
    ...cartao(p.titulo, p.descricao, p.caminho, 'Paragem.pt', IMAGEM_DE_PARTILHA),
  };
}

/**
 * O cartão de partilha da região — o que vai em todas as páginas dela que não
 * tragam o seu. O texto alternativo é o que o cartão escreve: o endereço, que
 * é o logótipo dela, e o que ela é; sem endereço que se desenhe, os nomes.
 */
export function imagemDaRegiao(r: Pick<Regiao, 'rede' | 'de' | 'dominio'>): ImagemDePartilha {
  const { principal, secundario } = nomesDaAssinatura(r);
  const alt = desenhavel(r.dominio)
    ? `${r.dominio}: ${secundario ?? principal}`
    : secundario
      ? `${principal}: ${secundario}`
      : principal;
  return { url: CARTAO_DA_REGIAO, alt };
}

/**
 * Os metadados de uma página de uma região. Sem `titulo` é o início dela, que
 * fica com o título por omissão do invólucro («Transportes da …»). Sem
 * `caminho` é o cartão por omissão do invólucro — o de uma página que não
 * pede o seu, como a de «não encontrada» —, e aí não há morada canónica: uma
 * página que não existe não aponta para o início como se fosse ele. Sem
 * `imagem` vai o cartão da região.
 */
export function metadadosDaRegiao(
  r: Pick<Regiao, 'nome' | 'de' | 'rede' | 'dominio'>,
  p: { titulo?: string; descricao: string; caminho?: string; imagem?: ImagemDePartilha },
): Metadata {
  const doCartao = p.titulo ? `${p.titulo} · ${r.nome}` : `Transportes ${r.de}`;
  return {
    ...(p.titulo ? { title: p.titulo } : {}),
    description: p.descricao,
    ...(p.caminho ? { alternates: { canonical: p.caminho } } : {}),
    ...cartao(
      doCartao,
      p.descricao,
      p.caminho,
      `${r.nome} · Paragem.pt`,
      p.imagem ?? imagemDaRegiao(r),
    ),
  };
}
