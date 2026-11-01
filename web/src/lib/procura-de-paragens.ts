/**
 * A PROCURA NAS PARAGENS, PELO NOME E PELA TERRA — sem JavaScript no navegador.
 *
 * A lista das paragens só se percorria pela inicial: para chegar a um terminal
 * era preciso abrir a letra e descer setenta nomes, e numa letra grande eram
 * seiscentos (auditoria de 1/11/2026, #103). A caixa do mapa procura, mas
 * precisa de JavaScript e de um índice de dezenas de kB; esta é a do caminho
 * sem mapa — e o de quem usa um leitor de ecrã —, e responde no servidor, a um
 * formulário simples: escreve-se, carrega-se em «Procurar», e a página que
 * volta é a lista do que se encontrou.
 *
 * O que encontra, por esta ordem:
 *
 * 1. **as linhas** cujo número é o que se escreveu, ou cujo nome tem as
 *    palavras todas — «Procurar paragem ou linha» é o que a página que não
 *    existe oferece, e quem lá chega por uma ligação antiga pode vir de uma
 *    linha;
 * 2. **as paragens pelo nome**: todas as palavras têm de estar no nome ou no
 *    concelho, e pelo menos uma no nome — «terminal pedra alta» acha o terminal, e
 *    o nome do concelho sozinho não devolve as trezentas paragens dele;
 * 3. **as paragens perto de uma terra** com esse nome, quando a terra não dá
 *    nome a paragem nenhuma: uma aldeia pode ser servida por paragens
 *    chamadas pela rua ou pelo cruzamento, e quem mora lá procura-a pela
 *    aldeia.
 *
 * As palavras comparam-se sem acentos nem maiúsculas (`simples`), como em
 * toda a procura do sítio.
 */
import type { Linha, Ponto } from './formato.ts';
import { simples } from './homonimos.ts';
import { metrosEntre, type GrupoDeParagens } from './lista-de-paragens.ts';

/** Até onde uma paragem conta como «perto» de uma terra procurada pelo nome. */
export const RAIO_DA_TERRA = 800;

/**
 * As classes do OpenStreetMap que são terras — e não um café ou uma escola
 * com o mesmo nome.
 */
const TERRAS = new Set([
  'place=city',
  'place=town',
  'place=village',
  'place=hamlet',
  'place=suburb',
  'place=neighbourhood',
  'place=quarter',
  'place=locality',
]);

/** As palavras de uma procura: sem acentos, sem pontuação, sem vazios. */
export function palavrasDe(q: string): string[] {
  return simples(q)
    .split(/[\s()/,.;:–—-]+/u)
    .filter(Boolean);
}

export type PertoDeUmaTerra = { terra: string; grupos: GrupoDeParagens[] };

export type ResultadoDaProcura = {
  palavras: string[];
  linhas: Linha[];
  /** As paragens com a procura no nome, até `limite`. */
  paragens: GrupoDeParagens[];
  /** Quantas eram, antes do limite. */
  total: number;
  /** As de uma terra com o nome procurado, que não estão já em `paragens`. */
  perto: PertoDeUmaTerra[];
};

export function procurarParagens(
  q: string,
  {
    grupos,
    nomesDosConcelhos,
    linhas = [],
    terras = [],
    limite = 60,
  }: {
    grupos: GrupoDeParagens[];
    nomesDosConcelhos: Record<string, string>;
    linhas?: Linha[];
    terras?: Ponto[];
    limite?: number;
  },
): ResultadoDaProcura {
  const palavras = palavrasDe(q);
  // Uma letra só devolvia meia rede: pede-se mais. Um número só, não — há
  // linhas de um algarismo, e esse procura-se pelo número exato.
  const curta = palavras.join('').length < 2;
  if (curta && !/^\d$/.test(palavras.join(''))) {
    return { palavras, linhas: [], paragens: [], total: 0, perto: [] };
  }

  const tem = (texto: string, p: string) => texto.includes(p);

  const dasLinhas = linhas
    .filter((l) => {
      if (palavras.length === 1 && simples(l.codigo) === palavras[0]) return true;
      if (curta) return false;
      const nome = simples(`${l.codigo} ${l.nome}`);
      return palavras.every((p) => tem(nome, p)) && palavras.some((p) => tem(simples(l.nome), p));
    })
    // O número exato à frente: «7» é a linha 7, e não a 70.
    .sort(
      (a, b) =>
        Number(simples(b.codigo) === palavras[0]) - Number(simples(a.codigo) === palavras[0]) ||
        a.ordem.localeCompare(b.ordem),
    )
    .slice(0, 10);

  const porNome = (curta ? [] : grupos).filter((g) => {
    const nome = simples(g.nome);
    const concelho = simples(g.concelho ? (nomesDosConcelhos[g.concelho] ?? '') : '');
    return (
      palavras.every((p) => tem(nome, p) || tem(concelho, p)) && palavras.some((p) => tem(nome, p))
    );
  });
  // As da região primeiro; dentro delas, as mais servidas.
  porNome.sort(
    (a, b) =>
      Number(!a.concelho) - Number(!b.concelho) ||
      (b.principal.partidas ?? 0) - (a.principal.partidas ?? 0) ||
      a.nome.localeCompare(b.nome, 'pt'),
  );

  const jaEstao = new Set(porNome.map((g) => g.principal.id));
  const procurada = palavras.join(' ');
  const perto: PertoDeUmaTerra[] = [];
  for (const t of curta ? [] : terras) {
    if (!TERRAS.has(t.classe ?? '') || palavrasDe(t.nome).join(' ') !== procurada) continue;
    const aqui = grupos
      .filter((g) => !jaEstao.has(g.principal.id))
      .map((g) => ({ g, m: metrosEntre(t, g.principal) }))
      .filter(({ m }) => m <= RAIO_DA_TERRA)
      .sort((a, b) => a.m - b.m)
      .map(({ g }) => g);
    for (const g of aqui) jaEstao.add(g.principal.id);
    if (aqui.length) perto.push({ terra: t.nome, grupos: aqui });
  }

  return {
    palavras,
    linhas: dasLinhas,
    paragens: porNome.slice(0, limite),
    total: porNome.length,
    perto,
  };
}
