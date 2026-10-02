/**
 * Os avisos de uma página do sítio, já com o que é preciso para os mostrar:
 * quais dizem respeito a esta linha ou a esta paragem, e os nomes que o
 * público conhece em vez dos identificadores do GTFS (P4-019, P2-025).
 *
 * Separado de `avisos.ts` porque lê o catálogo da região (`dados.ts`), que só
 * corre no servidor; `avisos.ts` vai também para o navegador, na
 * pré-visualização do painel.
 *
 * O QUE ISTO CUSTA, escrito para quem vier medir: as páginas de linha e de
 * paragem, e o início, passam a refazer-se ao minuto em vez de à hora —
 * o Next toma o prazo mais curto das leituras de uma página, e o dos avisos é
 * um minuto (`VALIDADE_S`, em `avisos.ts`). Os dados delas continuam guardados
 * por uma hora; o que se repete é render o HTML, em segundo plano, e só quando
 * alguém visita a página depois do minuto. Sem base configurada (o CI), não
 * há leitura dos avisos e nada muda.
 */
import { cache } from 'react';
import type { CatalogoDosAvisos } from '@/componentes/Avisos';
import { aplicaALinha, aplicaAParagem, avisosEmVigor, type Aviso } from './avisos';
import { linhas, paragens, NOME_DOS_MODOS } from './dados';

/** O catálogo dos nomes: uma leitura por pedido, e as duas listas já estão na cache. */
export const catalogoDosAvisos = cache(async (regiao: string): Promise<CatalogoDosAvisos> => {
  const [ls, ps] = await Promise.all([
    linhas(regiao).catch(() => []),
    paragens(regiao).catch(() => []),
  ]);
  return {
    linhas: new Map(
      ls.map((l) => [l.id, { id: l.id, codigo: l.codigo, nome: l.nome, cor: l.cor, modo: l.modo }]),
    ),
    paragens: new Map(ps.map((p) => [p.id, p.nome])),
    modos: NOME_DOS_MODOS,
  };
});

/** Os avisos em vigor que dizem respeito a esta linha. Vazio quando não se conseguiu ler. */
export async function avisosDaLinha(
  regiao: string,
  linha: { id: string; modo: string; paragens: readonly string[] },
): Promise<Aviso[]> {
  const todos = (await avisosEmVigor(regiao)) ?? [];
  return todos.filter((a) => aplicaALinha(a, linha));
}

/**
 * Os avisos em vigor que dizem respeito a esta paragem: os que a nomeiam, os
 * das linhas que lá passam, e os do modo dela.
 */
export async function avisosDaParagem(
  regiao: string,
  paragem: { id: string; linhas: readonly string[]; modos: readonly string[] },
): Promise<Aviso[]> {
  const todos = (await avisosEmVigor(regiao)) ?? [];
  return todos.filter((a) => aplicaAParagem(a, paragem));
}
