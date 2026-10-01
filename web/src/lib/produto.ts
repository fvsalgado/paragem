/**
 * O que é do PRODUTO, escrito uma vez — e o que não muda de região para região.
 *
 * A declaração de cada região (`regiao.json`) guarda o que é dela: o nome, a
 * autoridade, a rede. Isto guarda o que é igual em todas: o nome do produto,
 * quem o faz, onde está o código e para onde se escreve. É a fronteira que o
 * multi-região exige: o que estiver aqui aparece igual em todas as páginas do
 * produto, e o que não puder aparecer igual em todas não pertence aqui.
 *
 * NENHUM CLIENTE ESTÁ AQUI (§7). A página do produto responde a qualquer
 * anfitrião que o mapa de domínios não conheça — incluindo o domínio de um
 * cliente apontado para cá antes de a região dele existir —, e o que se
 * escrevesse aqui sobre um cliente mostrava-se a quem quer que aparecesse.
 */

export const PRODUTO = { nome: 'Paragem.pt' } as const;

/**
 * Quem desenha e desenvolve o produto, e é titular dos direitos — o mesmo
 * nome do `AUTORIA.md`, que é o sítio canónico dessa afirmação.
 */
export const AUTOR = { nome: 'Fábio Salgado' } as const;

/** O código, que é público e livre (AGPL-3.0-only). */
export const CODIGO = 'https://github.com/fvsalgado/paragem';

/** A política de segurança do código: como se comunica uma vulnerabilidade. */
export const SEGURANCA = `${CODIGO}/blob/main/SECURITY.md`;

/** O produto irmão, da mesma casa, que se vende às mesmas autoridades. */
export const CORETO = 'https://coreto.org';

/**
 * O contacto publicado no repositório — o do `AUTORIA.md` e do `SECURITY.md`.
 *
 * É a OMISSÃO e não o contacto: quem aloja o produto põe o seu em
 * `NEXT_PUBLIC_PARAGEM_CONTACTO` (`docs/ALOJAMENTO.md`), e o domínio não se
 * crava no código (§4.7). Sem variável fica este, que já é público e que
 * recebe — um endereço inventado à espera de que alguém crie a caixa era um
 * contacto que ninguém lê, e quem escreve conclui que ninguém está a ouvir.
 * O `tests/produto.test.mts` confere que continua a ser o do `AUTORIA.md`.
 */
export const CONTACTO_PUBLICADO = 'fvsalgado@gmail.com';

/**
 * Um endereço de correio, e só isso: sem espaços, com uma arroba e um domínio
 * com ponto. Não é a validação do RFC — é o bastante para uma variável mal
 * colada (com `mailto:` à frente, com aspas, com o nome da pessoa) não chegar
 * à página como se fosse um endereço.
 */
const ENDERECO = /^[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+$/;

/**
 * O contacto que se mostra. O Next troca `process.env.NEXT_PUBLIC_*` por texto
 * na construção, e só quando o nome está escrito por extenso — por isso está
 * aqui uma vez. Uma variável que não seja um endereço não se mostra: vale a
 * omissão, que recebe, em vez de um contacto partido em todas as páginas.
 */
export function contactoDoProduto(valor = process.env.NEXT_PUBLIC_PARAGEM_CONTACTO): string {
  const limpo = (valor ?? '').trim();
  return ENDERECO.test(limpo) ? limpo : CONTACTO_PUBLICADO;
}

export const CONTACTO = contactoDoProduto();

/**
 * A morada da montra, quando está declarada e é absoluta: a mesma
 * `NEXT_PUBLIC_PARAGEM_PRODUTO` para onde já levam a marca e o «Outras
 * regiões» de cada região (`docs/ALOJAMENTO.md`). É ela que diz qual é O
 * endereço do produto — o que se indexa, o que vai no mapa do sítio e nas
 * imagens de partilha —, e não o anfitrião de quem pergunta: a página do
 * produto responde a qualquer anfitrião desconhecido, e só um deles é o dela.
 *
 * `null` sem variável, ou com uma que não seja uma morada `http(s)` inteira:
 * aí não se sabe, e quem chama decide o que fazer sem adivinhar.
 */
export function origemDoProduto(valor = process.env.NEXT_PUBLIC_PARAGEM_PRODUTO): URL | null {
  try {
    const u = new URL((valor ?? '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Um `mailto:` com o assunto já escrito — é o que separa um pedido de
 * demonstração de um email perdido entre os outros.
 *
 * O assunto vai codificado por `encodeURIComponent`, e não por
 * `URLSearchParams`: este escreve os espaços como `+`, e há clientes de
 * correio que os deixam ficar como `+` no assunto.
 */
export function correioPara(assunto: string, endereco = CONTACTO): string {
  return `mailto:${endereco}?subject=${encodeURIComponent(assunto)}`;
}
