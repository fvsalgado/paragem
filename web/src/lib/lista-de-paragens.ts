/**
 * A LISTA DAS PARAGENS, UMA POR SÍTIO — e não uma por poste.
 *
 * Uma paragem tem quase sempre duas: uma de cada lado da estrada, com o mesmo
 * nome. A lista por inicial mostrava as duas, iguais, sem forma de as
 * distinguir — 74 nomes repetidos só na letra A, e o mesmo hospital três
 * vezes (auditoria de 1/11/2026, #15). O mapa já as juntava; a lista não.
 *
 * Junta-se pelo NOME e pela DISTÂNCIA: o mesmo nome a menos de `raio` metros
 * de outra do grupo é o mesmo sítio. O mesmo nome longe é outro sítio — há
 * lugares com o mesmo nome em freguesias diferentes — e fica noutra linha,
 * distinguida pelo concelho e, quando é preciso, pela terra mais perto
 * (`homonimos.ts`).
 *
 * Cada grupo leva à paragem mais servida dele; a página dela mostra as outras
 * do mesmo sítio, e para onde vai cada uma.
 */
import type { Paragem, Ponto } from './formato.ts';
import { simples } from './homonimos.ts';

/**
 * O raio do mesmo sítio: os dois lados de uma estrada, o largo de um terminal,
 * e os dois postes de uma aldeia com o mesmo nome. Era 300 m, e na região real
 * deixava duas paragens a 354 m uma da outra, com o mesmo nome, as mesmas
 * linhas e os mesmos destinos, em duas linhas iguais da lista.
 */
export const RAIO_DO_MESMO_SITIO = 400;

export type GrupoDeParagens = {
  nome: string;
  /** A mais servida do grupo: é para ela que a lista leva. */
  principal: Paragem;
  /** As do grupo, a principal primeiro. */
  paragens: Paragem[];
  /** As linhas de todas, sem repetir, pela ordem em que aparecem. */
  linhas: string[];
  /** O concelho da principal, ou o de outra do grupo, ou `null` fora da região. */
  concelho: string | null;
};

/** Equirretangular: a estas distâncias, a curvatura da Terra não se nota. */
export function metrosEntre(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

const temSitio = (p: { lat: number; lon: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon);

/**
 * As paragens com o mesmo nome e a menos de `raio` metros umas das outras —
 * em cadeia: se A está perto de B e B perto de C, as três são o mesmo sítio.
 * Uma paragem sem coordenadas fica sozinha: não há como saber onde fica.
 */
export function agruparParagens(ps: Paragem[], raio = RAIO_DO_MESMO_SITIO): GrupoDeParagens[] {
  const porNome = new Map<string, Paragem[]>();
  for (const p of ps) {
    const k = simples(p.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), p]);
  }
  const grupos: GrupoDeParagens[] = [];
  for (const mesmas of porNome.values()) {
    const resto = [...mesmas];
    while (resto.length) {
      const grupo = [resto.shift()!];
      for (let i = 0; i < grupo.length; i++) {
        const a = grupo[i];
        if (!temSitio(a)) continue;
        for (let j = resto.length - 1; j >= 0; j--) {
          const b = resto[j];
          if (temSitio(b) && metrosEntre(a, b) <= raio) grupo.push(...resto.splice(j, 1));
        }
      }
      // A mais servida à frente; em empate, a que já vinha primeiro.
      const ordenadas = grupo
        .map((p, i) => ({ p, i }))
        .sort((x, y) => (y.p.partidas ?? 0) - (x.p.partidas ?? 0) || x.i - y.i)
        .map((x) => x.p);
      const principal = ordenadas[0];
      grupos.push({
        nome: principal.nome,
        principal,
        paragens: ordenadas,
        linhas: [...new Set(ordenadas.flatMap((p) => p.linhas))],
        concelho: principal.concelho ?? ordenadas.find((p) => p.concelho)?.concelho ?? null,
      });
    }
  }
  // Pela ordem da lista de partida (o campo `ordem` do pipeline).
  const ordem = new Map(ps.map((p, i) => [p.id, i]));
  return grupos.sort(
    (a, b) =>
      a.principal.ordem.localeCompare(b.principal.ordem, 'pt') ||
      (ordem.get(a.principal.id) ?? 0) - (ordem.get(b.principal.id) ?? 0),
  );
}

/** Um grupo como ponto, para o `oQueOsDistingue` de `homonimos.ts`. */
export function pontoDoGrupo(g: GrupoDeParagens): Ponto {
  return {
    nome: g.nome,
    lat: g.principal.lat,
    lon: g.principal.lon,
    tipo: 'paragem',
    id: g.principal.id,
    concelho: g.concelho ?? 'fora-da-regiao',
  };
}

/**
 * As OUTRAS paragens do mesmo sítio de uma paragem: o mesmo nome, a menos de
 * `raio` metros dela ou de outra do grupo. É o que a página da paragem mostra
 * em «Do mesmo sítio», para quem chegou pela lista, que leva à mais servida.
 */
export function doMesmoSitio(p: Paragem, todas: Paragem[], raio = RAIO_DO_MESMO_SITIO): Paragem[] {
  const nome = simples(p.nome);
  const grupo = agruparParagens(
    todas.filter((x) => simples(x.nome) === nome),
    raio,
  ).find((g) => g.paragens.some((x) => x.id === p.id));
  return (grupo?.paragens ?? []).filter((x) => x.id !== p.id);
}

/**
 * Para onde vão as partidas de uma paragem: os dois destinos mais comuns, sem
 * as circulares e sem o nome da própria paragem. É o que distingue duas
 * paragens com o mesmo nome dos dois lados da estrada.
 */
export function paraOnde(
  partidas: { destino: string; circular?: boolean }[],
  nome: string,
): string[] {
  const conta = new Map<string, number>();
  for (const d of partidas) {
    if (d.circular || !d.destino || d.destino === nome) continue;
    conta.set(d.destino, (conta.get(d.destino) ?? 0) + 1);
  }
  return [...conta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([destino]) => destino);
}

/**
 * O ÚLTIMO RECURSO PARA DISTINGUIR SÍTIOS IGUAIS NA LISTA: onde fica cada um
 * em relação aos outros — «a norte» e «a sul», ou «a oeste» e «a leste», pelo
 * eixo em que estão mais afastados; com três ou mais, a ordem nesse eixo. É
 * verdade sempre, e diz a quem conhece a terra qual é qual.
 */
export function posicoesRelativas(ps: readonly { lat: number; lon: number }[]): string[] {
  if (ps.length < 2) return ps.map(() => '');
  const lats = ps.map((p) => p.lat);
  const lons = ps.map((p) => p.lon * Math.cos((ps[0].lat * Math.PI) / 180));
  const porLat = Math.max(...lats) - Math.min(...lats) >= Math.max(...lons) - Math.min(...lons);
  const chave = porLat ? lats.map((v) => -v) : lons;
  const ordem = chave.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const rotulos: string[] = new Array(ps.length).fill('');
  ordem.forEach(({ i }, k) => {
    rotulos[i] =
      ps.length === 2
        ? porLat
          ? ['a norte', 'a sul'][k]
          : ['a oeste', 'a leste'][k]
        : `${k + 1}.ª ${porLat ? 'de norte para sul' : 'de oeste para leste'}`;
  });
  return rotulos;
}
