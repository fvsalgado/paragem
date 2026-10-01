/**
 * O MAPA DO SÍTIO de uma região — as páginas que ela tem, numa lista que um
 * motor de busca lê.
 *
 * O endereço dava a página de 404 em HTML (P3-026). Não é por a região se
 * deixar indexar: não deixa, e o `robots.txt` dela continua a mandar (§4.4).
 * É para o dia em que a autoridade de transportes autorizar (Fase 5) ser uma
 * linha no `robots.txt` e não um trabalho por fazer — milhares de paragens
 * sem mapa do sítio levam meses a aparecer.
 *
 * As páginas saem DOS MESMOS ÍNDICES que as páginas usam, e pelas MESMAS
 * REGRAS: uma página de um modo que a região não tem não existe, e por isso
 * não entra; e cada identificador vai como a página o procura — pelo
 * `seguro()` onde a página o compara depois de o passar por ele (paragens,
 * linhas, estações), tal e qual onde o compara tal e qual.
 *
 * Há um teste que pede ao sítio a correr cada endereço daqui
 * (`tests/robots.spec.ts`): um mapa do sítio com um 404 lá dentro é um mapa
 * que mente, e os motores de busca deixam de confiar nele.
 *
 * Funções puras, sem leituras: a rota dá-lhes o que leu.
 */
import { seguro } from './formato.ts';
import { letraDe, paraUrl } from './letras.ts';
import { caminhoDoHorario } from './a-pedido.ts';

export type IndicesDaRegiao = {
  /** Os modos da região, já sem os que o painel desligou. */
  modos: readonly string[];
  paragens: readonly { id: string; nome: string }[];
  linhas: readonly { id: string }[];
  concelhos: readonly { id: string }[];
  estacoes: readonly { id: string }[];
  /** Os grupos de circuitos a pedido com horário; `null` sem transporte a pedido. */
  aPedido: readonly { id: string }[] | null;
  /** Os modos com página própria em `/modos/` (`modos.json`). */
  paginasDeModo: readonly string[];
};

/** Os caminhos de uma região, pela ordem em que se navega: do mapa às fichas. */
export function caminhosDaRegiao(d: IndicesDaRegiao): string[] {
  const caminhos = ['/', '/viagem/', '/rede/'];
  const tem = (m: string) => d.modos.includes(m);

  if (tem('autocarro')) {
    caminhos.push('/rede/paragens/');
    const letras = new Set(d.paragens.map((p) => letraDe(p.nome)));
    for (const l of [...letras].sort()) caminhos.push(`/rede/paragens/letra/${paraUrl(l)}/`);
    for (const p of d.paragens) caminhos.push(`/rede/paragens/${seguro(p.id)}/`);
    caminhos.push('/rede/linhas/');
    for (const l of d.linhas) caminhos.push(`/rede/linhas/${seguro(l.id)}/`);
  }
  caminhos.push('/rede/concelhos/');
  for (const c of d.concelhos) caminhos.push(`/rede/concelhos/${c.id}/`);
  if (tem('comboio')) {
    caminhos.push('/rede/estacoes/');
    for (const e of d.estacoes) caminhos.push(`/rede/estacoes/${seguro(e.id)}/`);
  }
  caminhos.push('/rede/tarifario/');
  if (d.aPedido) {
    caminhos.push('/a-pedido/');
    for (const h of d.aPedido) caminhos.push(`/${caminhoDoHorario(h.id)}`);
  }
  for (const m of d.paginasDeModo) caminhos.push(`/modos/${m}/`);
  caminhos.push('/avisos/', '/dados-abertos/', '/acessibilidade/', '/privacidade/');
  return [...new Set(caminhos)];
}

/** O que não pode ir cru para dentro de um elemento de XML. */
function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * O XML do protocolo dos mapas do sítio: um `<loc>` por página, com a morada
 * inteira — o protocolo não aceita caminhos relativos. Sem `<lastmod>`: a data
 * em que uma página mudou não se sabe, e uma data errada é pior do que
 * nenhuma, porque ensina o motor de busca a ignorá-la.
 */
export function mapaDoSitio(origem: string, caminhos: readonly string[]): string {
  const base = origem.replace(/\/+$/, '');
  const linhas = caminhos.map((c) => `  <url><loc>${escapar(encodeURI(base + c))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...linhas,
    '</urlset>',
    '',
  ].join('\n');
}
