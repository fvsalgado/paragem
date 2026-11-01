/**
 * O QUE CADA MODO TEM, CONTADO E COM UNIDADE — a coluna da direita da grelha
 * «Por modo» da página da rede.
 *
 * Metade dos números não dizia de quê (auditoria de 1/11/2026, #109): «Urbano
 * municipal 7», «Bicicleta partilhada 81», «Expresso 4», «Táxi 9» — sete quê?
 * 81 bicicletas ou estações? O `quantos` do pipeline soma coisas diferentes
 * (estações, pontos, percursos, paragens, horários) e serve para saber se um
 * modo produziu alguma coisa; para o mostrar, conta-se cada parte com o nome
 * dela.
 */
import type { ModoDetalhe } from './formato.ts';
import { plural } from './prosa.ts';

/** «TU — Linha Verde» e «TU» + «Linha Verde» são a mesma linha. */
const chaveDaLinha = (rede: string | null | undefined, nome: string) =>
  `${rede ?? ''} ${nome}`
    .replace(/\s+—\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * As linhas de um modo: um horário por linha, e os percursos que nenhum
 * horário já conta — o mesmo urbano vem do cartaz da câmara E do
 * OpenStreetMap, e contá-lo duas vezes era o «7» de cinco linhas.
 */
export function linhasDoModo(m: Pick<ModoDetalhe, 'horarios' | 'percursos'>): number {
  const vistas = new Set<string>();
  for (const h of m.horarios ?? []) {
    const nome = h.rede && !h.nome.startsWith(h.rede) ? `${h.rede} ${h.nome}` : h.nome;
    vistas.add(chaveDaLinha(null, nome));
  }
  for (const p of m.percursos ?? []) vistas.add(chaveDaLinha(p.rede, p.nome));
  return vistas.size;
}

/**
 * «81 estações», «9 praças», «4 paragens», «5 linhas» — e, num modo que tenha
 * mais do que uma coisa, as partes separadas por « · ». Vazio quando o modo
 * não tem nada, e aí quem chama diz o que diz nesses casos.
 */
export function quantosNoModo(modo: string, m: ModoDetalhe): string {
  const estacoes = (m.sistemas ?? []).reduce((n, s) => n + (s.estacoes?.length ?? 0), 0);
  const pontos = (m.pontos ?? []).length;
  const linhas = linhasDoModo(m);
  const paragens = (m.paragens ?? []).length;
  const partes = [
    estacoes ? plural(estacoes, 'estação', 'estações') : '',
    pontos
      ? modo === 'taxi'
        ? plural(pontos, 'praça', 'praças')
        : plural(pontos, 'local', 'locais')
      : '',
    linhas ? plural(linhas, 'linha', 'linhas') : '',
    paragens ? plural(paragens, 'paragem', 'paragens') : '',
  ].filter(Boolean);
  return partes.join(' · ');
}
