/**
 * A PROSA QUE O SÍTIO ESCREVE COM NÚMEROS E COM NOMES — num sítio só.
 *
 * Estava espalhada pelas páginas, e cada uma errava à sua maneira: «1
 * paragens perto», «1 viagens», «1 circuitos na zona», «Os outros 1 são obra
 * da casa»; «Demonstração. a Serra da Pedra Alta não existe»; «Rede Rede
 * Alta gerida por Comunidade Intermunicipal…». Numa lista que se lê de cima a
 * baixo, e no rodapé de todas as páginas — que é a frase que nomeia o cliente.
 *
 * **O que isto NÃO faz é contrações.** «da Serra da Pedra Alta», «pela Comunidade
 * Intermunicipal» vêm feitas do pipeline, a partir do artigo que a região
 * DECLARA (`regiao.py`): nenhuma regra acerta nos nomes portugueses. Quando a
 * região não declara o artigo da autoridade ou do operador, as frases saem
 * noutra forma, que não precisa dele — e continuam certas.
 */
import type { Regiao } from './formato.ts';

/**
 * «2 573» — com o separador de milhares da casa, também aos quatro algarismos.
 *
 * O `pt-PT` do `Intl` não separa os números de quatro algarismos («2573»), e
 * a casa escreve-os separados («1 931 paragens»). O espaço é inquebrável,
 * para o número não se partir ao fim de uma linha.
 */
export function numero(n: number): string {
  return n.toLocaleString('pt-PT', { useGrouping: 'always' } as Intl.NumberFormatOptions);
}

/** «1 paragem», «2 paragens» — o número e o nome, a concordar. */
export function plural(n: number, um: string, varios: string): string {
  return `${numero(n)} ${n === 1 ? um : varios}`;
}

/** A primeira letra em maiúscula, para o que abre uma frase. */
export function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «A», «A e B», «A, B e C». */
export function lista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * O nome da região a abrir uma frase: «A Serra da Pedra Alta».
 *
 * Vem feito do pipeline; uns dados construídos antes dele não o trazem, e aí
 * faz-se aqui — é tipografia, não uma contração.
 */
export function regiaoNoInicio(r: Pick<Regiao, 'nome_com_artigo' | 'nome_com_artigo_no_inicio'>) {
  return r.nome_com_artigo_no_inicio || maiuscula(r.nome_com_artigo);
}

/**
 * «Rede Sável Bus», «Rede Alta» — e não «Rede Rede Alta».
 *
 * O nome da rede ora é uma marca («Sável Bus») ora já é uma frase («Rede
 * Alta»), e antepor «Rede» às cegas repetia a palavra no rodapé de todas as
 * páginas.
 */
export function nomeDaRede(r: Pick<Regiao, 'rede'>): string {
  const nome = (r.rede?.nome ?? '').trim();
  if (!nome) return 'A rede';
  return /^rede\b/i.test(nome) ? nome : `Rede ${nome}`;
}

const AUTORIDADE_SEM_ARTIGO = {
  com_artigo: 'a autoridade de transportes',
  de: 'da autoridade de transportes',
  por: 'pela autoridade de transportes',
} as const;

/**
 * A autoridade de transportes numa frase, com a contração que a frase pede:
 * «a Comunidade…», «da Comunidade…», «pela Comunidade…».
 *
 * Com o artigo declarado, vem feita do pipeline. Sem ele, diz-se «a
 * autoridade de transportes» e o nome a seguir, entre parênteses — a
 * contração fica com o substantivo comum, que tem género conhecido, e o nome
 * próprio não precisa de nenhuma. Era daqui que saía «O contacto … é do
 * Comunidade Intermunicipal», com o artigo da REGIÃO no nome da AUTORIDADE.
 */
export function aAutoridade(
  r: Pick<Regiao, 'autoridade'>,
  forma: keyof typeof AUTORIDADE_SEM_ARTIGO,
) {
  const feita = r.autoridade?.[forma];
  if (feita) return feita;
  const nome = r.autoridade?.nome;
  return nome ? `${AUTORIDADE_SEM_ARTIGO[forma]} (${nome})` : AUTORIDADE_SEM_ARTIGO[forma];
}

/**
 * A frase que nomeia o cliente: a rede, quem a gere e quem a opera.
 *
 * «Rede Alta, gerida pela Comunidade Intermunicipal da Serra da Pedra Alta e
 * operada pela Alta Transportes» — quando a região declara os dois artigos.
 * Sem eles, «Rede Alta — gestão: Comunidade Intermunicipal da Serra da Pedra
 * Alta; operação: Alta Transportes», que não precisa de artigo nenhum. O que
 * não se faz é adivinhar um: «gerida por Comunidade Intermunicipal», «com
 * operação de …» foi o que se leu no rodapé de todas as páginas.
 */
export function redeEQuemAGere(r: Pick<Regiao, 'rede' | 'autoridade'>): string {
  const rede = nomeDaRede(r);
  const autoridade = r.autoridade?.nome;
  const operador = r.rede?.operador;
  const pelaAutoridade = r.autoridade?.por;
  const peloOperador = r.rede?.operador_por;
  if (!autoridade) {
    if (!operador) return rede;
    return peloOperador ? `${rede}, operada ${peloOperador}` : `${rede} — operação: ${operador}`;
  }
  if (pelaAutoridade && (!operador || peloOperador)) {
    return `${rede}, gerida ${pelaAutoridade}${operador ? ` e operada ${peloOperador}` : ''}`;
  }
  return `${rede} — gestão: ${autoridade}${operador ? `; operação: ${operador}` : ''}`;
}
