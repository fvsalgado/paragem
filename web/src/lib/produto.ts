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
 * QUEM FAZ O PRODUTO ASSINA COMO STINETA (decidido pelo dono a 10/11/2026).
 *
 * Uma frase só, igual em todos os produtos da casa: «Stineta — software para
 * regiões e comunidades.» — a marca e o nome a levar à morada dela, e a
 * descrição em texto ao lado (`componentes/AssinaturaStineta.tsx`). Vai no
 * rodapé do produto e no de cada região, por baixo do «Feito com Paragem.pt».
 *
 * O nome de uma pessoa saiu das assinaturas e da prosa do produto. A
 * titularidade dos direitos continua no `AUTORIA.md`, que é o sítio canónico
 * dessa afirmação, e não muda com isto.
 */
export const STINETA = {
  nome: 'Stineta',
  url: 'https://stineta.pt',
  descricao: 'software para regiões e comunidades',
} as const;

/**
 * Quem desenha e desenvolve o produto, e é titular dos direitos — o mesmo
 * nome do `AUTORIA.md`, que é o sítio canónico dessa afirmação.
 */
export const AUTOR = { nome: 'Fábio Salgado' } as const;

/** O código, que é público e livre (AGPL-3.0-only). */
export const CODIGO = 'https://github.com/fvsalgado/paragem';

/** A política de segurança do código: como se comunica uma vulnerabilidade. */
export const SEGURANCA = `${CODIGO}/blob/main/SECURITY.md`;

/**
 * O contacto publicado no repositório — o do `AUTORIA.md` e do `SECURITY.md`.
 *
 * É a OMISSÃO e não o contacto: quem aloja o produto põe o seu em
 * `NEXT_PUBLIC_PARAGEM_CONTACTO` (`docs/ALOJAMENTO.md`), e o domínio não se
 * crava no código (§4.7). Sem variável fica este, que é o endereço do produto
 * e recebe correio desde 13/10/2026 — um endereço inventado à espera de que
 * alguém crie a caixa era um contacto que ninguém lê. Era uma caixa pessoal,
 * que saiu de todas as páginas e ficheiros do repositório.
 * O `tests/produto.test.mts` confere que continua a ser o do `AUTORIA.md`.
 */
export const CONTACTO_PUBLICADO = 'correio@paragem.pt';

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
 * A MONTRA SÓ MOSTRA DEMONSTRAÇÕES — nenhum cliente. Decidido pelo dono a
 * 2/10/2026.
 *
 * Listava todas as regiões construídas, e com cada uma a rede, a autoridade de
 * transportes e os números dela. É a mesma razão do cabeçalho deste ficheiro,
 * vista do outro lado: a página do produto responde a qualquer anfitrião
 * desconhecido, e um cliente cujo domínio aponte para cá antes de a região
 * dele existir via os cartões dos outros. Mostrar um cliente na página de
 * quem o vende é decisão dele, e não um efeito de a região estar construída.
 *
 * As demonstrações são do produto e inventadas de fio a pavio: são elas que
 * se mostram, e é para uma delas que leva o «Experimentar a demonstração».
 */
export function eDaMontra(r: { demonstracao?: boolean }): boolean {
  return r.demonstracao === true;
}

/**
 * A ordem dos cartões da montra: a demonstração mais completa primeiro — a
 * mesma que o «Experimentar a demonstração» escolhe, pelos dados e não pelo
 * nome, para que uma demonstração nova e maior passe à frente no dia em que
 * é ligada. Em caso de empate, pelo identificador, para a ordem não mudar de
 * uma construção para a seguinte.
 */
export function ordemDaMontra<T extends { id: string; paragens: number }>(fichas: T[]): T[] {
  return [...fichas].sort((a, b) => b.paragens - a.paragens || a.id.localeCompare(b.id, 'pt'));
}

/** Os modos da região por extenso, em minúsculas, para uma frase. */
const MODO_NUMA_FRASE: Record<string, string> = {
  autocarro: 'autocarro',
  'a-pedido': 'transporte a pedido',
  comboio: 'comboio',
  'urbano-municipal': 'urbano municipal',
  bicicleta: 'bicicleta partilhada',
  expresso: 'expresso',
  taxi: 'táxi',
};

/** Quem é a autoridade de uma demonstração, com o género do nome dela. */
const QUEM_E: Record<string, { nome: string; feminino: boolean }> = {
  cim: { nome: 'uma comunidade intermunicipal', feminino: true },
  municipio: { nome: 'um município', feminino: false },
  'area-metropolitana': { nome: 'uma área metropolitana', feminino: true },
};

const POR_EXTENSO = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

/**
 * O QUE CADA DEMONSTRAÇÃO TEM DE SEU, numa frase: o tipo de autoridade e os
 * modos. Os três cartões da montra diziam a mesma frase — «uma região
 * inventada, para ver o produto a funcionar» —, e quem os lia não sabia porque
 * havia três. Cada uma prova uma coisa diferente: uma comunidade
 * intermunicipal com os modos todos, outra com poucos, e um município sozinho,
 * só com autocarro. A frase sai do que a região declara — não se escreve o
 * nome de nenhuma —, e uma demonstração nova diz o que tem no dia em que é
 * construída.
 */
export function fraseDaDemonstracao(r: {
  autoridade?: { tipo?: string };
  modos: readonly string[];
}): string {
  const quem = QUEM_E[r.autoridade?.tipo ?? ''] ?? {
    nome: 'uma autoridade de transportes',
    feminino: true,
  };
  const inventada = quem.feminino ? 'inventada' : 'inventado';
  const modos = r.modos.map((m) => MODO_NUMA_FRASE[m] ?? m);
  const sujeito = `${quem.nome[0].toUpperCase()}${quem.nome.slice(1)} ${inventada}`;
  if (modos.length === 0) return `${sujeito}.`;
  if (modos.length === 1) return `${sujeito}, só com ${modos[0]}.`;
  const quantos = POR_EXTENSO[modos.length] ?? String(modos.length);
  const emLista = `${modos.slice(0, -1).join(', ')} e ${modos[modos.length - 1]}`;
  return `${sujeito}, com ${quantos} modos: ${emLista}.`;
}

/**
 * A morada da montra, quando está declarada e é absoluta: a mesma
 * `NEXT_PUBLIC_PARAGEM_PRODUTO` para onde já levam a marca e o «Sobre o
 * Paragem.pt» de cada região (`docs/ALOJAMENTO.md`). É ela que diz qual é O
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
