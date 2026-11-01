/**
 * Os degraus do trilho das páginas da rede (`componentes/Trilho.tsx`).
 *
 * Recebe os segmentos do endereço POR BAIXO de `/rede/` — `['paragens',
 * 'g19-407']` numa paragem — e devolve os níveis de cima, do mais largo para o
 * mais estreito. A página em que se está não entra: é o título dela.
 *
 * Os caminhos são os de `urlRede` (`dados.ts`): sem a região à frente, que o
 * middleware põe por dentro.
 */
export type Degrau = { nome: string; caminho: string };

/** As listas da rede, pelo segmento do endereço. Uma que não esteja aqui não tem degrau. */
const LISTAS: Record<string, string> = {
  paragens: 'Paragens',
  linhas: 'Linhas',
  estacoes: 'Estações',
  concelhos: 'Concelhos',
};

export function degrausDoTrilho(segmentos: readonly string[]): Degrau[] {
  // Os segmentos de grupo, `(…)`, e os da página não são caminho nenhum.
  const s = segmentos.filter((x) => x && !x.startsWith('(') && !x.startsWith('__'));
  if (!s.length) return [];
  const rede: Degrau = { nome: 'A rede', caminho: '/rede/' };
  const lista = LISTAS[s[0]];
  // Numa lista — `/rede/paragens/` — ou numa página solta — o tarifário —, o
  // degrau de cima é a rede.
  if (s.length === 1 || !lista) return [rede];
  return [rede, { nome: lista, caminho: `/rede/${s[0]}/` }];
}
