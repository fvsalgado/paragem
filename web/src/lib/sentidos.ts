/**
 * Os sentidos de uma linha, em palavras: para onde vai cada um, as pontas da
 * linha pela ordem do caminho, e se o percurso de um sentido é só de pontos de
 * horário. Vivem fora da página da linha para se testarem
 * (`tests/sentidos.test.mts`).
 */
import type { PontaDoSentido, Sentido } from './formato.ts';

/** As pontas de um sentido: as das viagens, se os dados as trazem; senão, as do percurso. */
export function pontas(s: Sentido): { origens: PontaDoSentido[]; destinos: PontaDoSentido[] } {
  if (s.origens?.length && s.destinos?.length) return { origens: s.origens, destinos: s.destinos };
  const primeira = s.paragens[0]?.nome ?? '';
  const ultima = s.paragens[s.paragens.length - 1]?.nome ?? '';
  return {
    origens: primeira ? [{ nome: primeira, viagens: s.viagens }] : [],
    destinos: ultima ? [{ nome: ultima, viagens: s.viagens }] : [],
  };
}

/**
 * O TÍTULO DE UM SENTIDO É PARA ONDE ELE VAI. Era «Ida» e «Volta», que não
 * dizem nada a quem está na paragem — e numa linha chamada «A - B», a «Ida»
 * começava numa terceira terra. Quando a maior parte das viagens parte e
 * acaba no mesmo sítio, é uma circular, e diz-se.
 *
 * E DIZ ATÉ ONDE VAI A MAIS COMPRIDA (auditoria de 1/11/2026, #92). Na linha
 * medida, chamada «A - E» pela operadora, os sentidos chamavam-se «Para D» e
 * «Para B» — os destinos mais comuns —, e quem ia para E ou para A não se via
 * em nenhum. Quando o destino mais longe, pela ordem do horário do sentido,
 * não é o mais comum, junta-se: «Para D e E».
 */
export function tituloDoSentido(s: Sentido): string {
  const { origens, destinos } = pontas(s);
  const para = destinos[0]?.nome;
  if (!para) return `Sentido ${s.sentido}`;
  if (origens[0]?.nome === para) return `Circular, a partir de ${para}`;
  const longe = destinoMaisLonge(s);
  return longe && longe !== para ? `Para ${para} e ${longe}` : `Para ${para}`;
}

/** O destino que fica mais à frente na ordem das paragens do horário do sentido. */
function destinoMaisLonge(s: Sentido): string | null {
  const ordem = (s.quadro?.paragens ?? s.paragens).map((p) => p.nome);
  let melhor: { nome: string; i: number } | null = null;
  for (const d of pontas(s).destinos) {
    const i = ordem.lastIndexOf(d.nome);
    if (i >= 0 && (!melhor || i > melhor.i)) melhor = { nome: d.nome, i };
  }
  return melhor?.nome ?? null;
}

/**
 * AS PONTAS DA LINHA, PELA ORDEM DO CAMINHO, e a viagem que mais se faz (#92).
 *
 * Na linha medida, o nome da operadora era «A - E» e metade das viagens fazia
 * só B – D: lido o título, não se percebia a página. As
 * pontas são as de onde as viagens partem e onde acabam, pela ordem das
 * paragens do horário do primeiro sentido; a viagem mais comum conta-se das
 * viagens do horário, pelo par de pontas.
 *
 * `null` numa linha de duas pontas — aí o título já diz tudo.
 */
export function pontasDaLinha(sentidos: Sentido[]): {
  pontas: string[];
  maisComum: { de: string; a: string; viagens: number; de_total: number } | null;
} | null {
  const nomes = new Set<string>();
  for (const s of sentidos)
    for (const x of [...pontas(s).origens, ...pontas(s).destinos]) nomes.add(x.nome);
  if (nomes.size <= 2) return null;
  const ordem = (sentidos[0]?.quadro?.paragens ?? sentidos[0]?.paragens ?? []).map((p) => p.nome);
  const pos = (n: string) => {
    const i = ordem.indexOf(n);
    return i < 0 ? Infinity : i;
  };
  const ordenadas = [...nomes].sort((a, b) => pos(a) - pos(b));
  // Os pares de pontas das viagens do horário, sem sentido: B – D e D – B são
  // a mesma viagem, feita para os dois lados.
  const pares = new Map<string, { de: string; a: string; viagens: number }>();
  let total = 0;
  for (const s of sentidos) {
    const q = s.quadro;
    if (!q) continue;
    for (const v of q.viagens) {
      const i = v.horas.findIndex(Boolean);
      const de = i >= 0 ? q.paragens[i]?.nome : undefined;
      const a = v.destino;
      if (!de || !a) continue;
      total++;
      const [p1, p2] = pos(de) <= pos(a) ? [de, a] : [a, de];
      const k = `${p1}\u0000${p2}`;
      const antes = pares.get(k) ?? { de: p1, a: p2, viagens: 0 };
      antes.viagens++;
      pares.set(k, antes);
    }
  }
  const [topo] = [...pares.values()].sort((a, b) => b.viagens - a.viagens);
  return {
    pontas: ordenadas,
    maisComum:
      topo && topo.viagens > 1 && topo.viagens < total ? { ...topo, de_total: total } : null,
  };
}

/**
 * SÓ OS PONTOS DE HORÁRIO, NESTE SENTIDO (#93). Há viagens que o levantamento
 * não alinhou, e saem só com as paragens que o horário da operadora marca —
 * na linha medida, o regresso tinha cinco paragens e a ida quarenta,
 * e quem lia pensava que pelo caminho o autocarro não parava em lado nenhum.
 * Diz-se quando o percurso mostrado é só de paragens com hora marcada e o do
 * sentido contrário tem as do caminho: não se inventam as que faltam.
 */
export function soPontosDeHorario(s: Sentido, todos: Sentido[]): boolean {
  const marcadas = (x: Sentido) => new Set((x.quadro?.paragens ?? []).map((p) => p.id));
  const temIntermedias = (x: Sentido) => {
    const m = marcadas(x);
    return m.size > 0 && x.paragens.some((p) => !m.has(p.id));
  };
  const deste = marcadas(s);
  return (
    deste.size > 0 &&
    s.paragens.every((p) => deste.has(p.id)) &&
    todos.some((o) => o !== s && temIntermedias(o))
  );
}
