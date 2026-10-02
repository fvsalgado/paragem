/**
 * DOIS RESULTADOS COM O MESMO NOME TÊM DE SE DISTINGUIR NA LISTA (P2-037).
 *
 * O mesmo «<nome> · lugar», duas vezes: não havia como saber qual era qual,
 * nem antes de escolher nem depois — e escolher o errado dá uma viagem para o
 * outro lado da região. O concelho resolvia os de concelhos diferentes; dentro
 * do mesmo concelho continuavam iguais. Contado nos sítios da região real: 57
 * grupos de nomes repetidos a mais de um quilómetro uns dos outros, no mesmo
 * concelho — lugares, casais, quintas com o mesmo nome em duas freguesias.
 *
 * O que os dados têm para os separar é a TERRA MAIS PERTO: a cidade, a vila
 * ou a aldeia de onde cada um fica (o índice dos sítios tem-nas a todas).
 * Separa 49 dos 57; nos outros, as duas ficam perto da mesma terra, e a
 * distância a ela diz qual é. A freguesia separava-os pelo nome oficial, mas
 * não está nos dados que o sítio publica — e não se adivinha.
 *
 * Só onde é preciso: um nome que só aparece uma vez na lista não ganha nada.
 */
import type { Ponto } from './formato';

/** As classes do OpenStreetMap que servem de referência: as terras com nome que se conhece. */
const REFERENCIAS = new Set(['place=city', 'place=town', 'place=village']);

/** Sem acentos e em minúsculas — a forma com que se compara um nome. */
export function simples(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}

/** Equirretangular: a estas distâncias, a curvatura da Terra não se nota. */
function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/** «a 3 km», «a 800 m» — arredondado ao que distingue, e não ao metro. */
function distancia(m: number): string {
  return m < 1000
    ? `a ${Math.max(100, Math.round(m / 100) * 100)} m`
    : `a ${Math.round(m / 1000)} km`;
}

/**
 * O que acrescentar a cada resultado para nenhum ficar igual a outro.
 *
 * `rotulo` é o que a lista já escreve por baixo do nome («paragem», «lugar»);
 * `concelhos` dá o nome de cada concelho; `sitios` são os do índice, de onde
 * saem as terras de referência. Devolve, por resultado, a lista do que se
 * lhe junta — vazia para quem já se distingue.
 */
export function oQueOsDistingue(
  resultados: Ponto[],
  rotulo: (p: Ponto) => string,
  concelhos: Record<string, string>,
  sitios: Ponto[],
): Map<Ponto, string[]> {
  const saida = new Map<Ponto, string[]>(resultados.map((p) => [p, []]));
  const grupos = (chave: (p: Ponto) => string) => {
    const g = new Map<string, Ponto[]>();
    for (const p of resultados) {
      const k = chave(p);
      g.set(k, [...(g.get(k) ?? []), p]);
    }
    return [...g.values()].filter((x) => x.length > 1);
  };

  // 1. O CONCELHO, a todos os que repetem o nome — como já era.
  for (const grupo of grupos((p) => simples(p.nome))) {
    for (const p of grupo) if (concelhos[p.concelho]) saida.get(p)!.push(concelhos[p.concelho]);
  }

  // 2. A TERRA MAIS PERTO, aos que continuam iguais: o mesmo nome, o mesmo
  //    rótulo e o mesmo concelho (ou nenhum). Sem coordenadas — uma linha —
  //    não há terra a que comparar.
  const iguais = (p: Ponto) => `${simples(p.nome)}|${rotulo(p)}|${saida.get(p)!.join('|')}`;
  const terras = sitios.filter((s) => REFERENCIAS.has(s.classe ?? ''));
  for (const grupo of grupos(iguais)) {
    if (!grupo.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) continue;
    const perto = grupo.map((p) => {
      let melhor: { nome: string; m: number } | null = null;
      for (const t of terras) {
        // A terra com o MESMO nome não diz nada: «Azinhal, perto de Azinhal».
        if (simples(t.nome) === simples(p.nome)) continue;
        const m = metros(p, t);
        if (!melhor || m < melhor.m) melhor = { nome: t.nome, m };
      }
      return melhor;
    });
    if (perto.some((x) => !x)) continue;
    const nomes = perto.map((x) => x!.nome);
    const todasDiferentes = new Set(nomes).size === nomes.length;
    grupo.forEach((p, i) => {
      const t = perto[i]!;
      // 3. A DISTÂNCIA, quando os dois ficam perto da mesma terra.
      saida.get(p)!.push(todasDiferentes ? `perto de ${t.nome}` : `${distancia(t.m)} de ${t.nome}`);
    });
  }
  return saida;
}
