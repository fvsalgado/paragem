import type { Ponto } from './formato';

/**
 * AS SEDES DE CONCELHO, para o mapa as nomear a todos os zooms.
 *
 * O mapa de fundo traz os nomes das terras, mas não todos a todos os zooms: o
 * recorte do OpenStreetMap só leva as cidades e algumas vilas para o zoom em
 * que se vê uma região inteira, e no telemóvel é esse o primeiro ecrã. Medido
 * na região real: a z8, das treze sedes servidas só cinco tinham nome no
 * mapa. Quem abria o sítio via a rede e não sabia onde ficava a terra dele.
 *
 * NÃO SE INVENTA ONDE FICA UMA SEDE (§4.4). O sítio dela é o do lugar do
 * OpenStreetMap que tem o nome do concelho, é cidade, vila ou aldeia, e está
 * dentro do concelho — tudo do `sitios.json`, que o pipeline já tira do
 * recorte. Um concelho cuja sede não se encontre assim fica sem nome no mapa,
 * e não com um nome posto no meio do concelho a fingir que é ali.
 */
export type Sede = {
  nome: string;
  lat: number;
  lon: number;
  concelho: string;
  /**
   * Entre duas sedes que não cabem lado a lado, qual fica: a cidade antes da
   * vila e a vila antes da aldeia (a classe do lugar no OpenStreetMap), e
   * entre duas da mesma classe a do concelho com mais paragens. Contas sobre
   * os dados, e não uma lista de terras «importantes» escrita à mão.
   */
  peso: number;
};

/** As classes de lugar que podem ser a sede, da mais forte para a mais fraca. */
const CLASSES = ['place=city', 'place=town', 'place=village'];

/** Sem acentos, sem maiúsculas e sem espaços a mais: «Vila  Nova» e «vila nova» são o mesmo nome. */
const simples = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function sedesDosConcelhos(
  concelhos: readonly { id: string; nome: string; paragens?: number }[],
  sitios: readonly Ponto[],
): Sede[] {
  // Os lugares que podem ser sede, pelo concelho onde caem e pelo nome.
  const porChave = new Map<string, Ponto[]>();
  for (const s of sitios) {
    if (!CLASSES.includes(s.classe ?? '') || !s.concelho) continue;
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const chave = `${s.concelho}|${simples(s.nome)}`;
    porChave.set(chave, [...(porChave.get(chave) ?? []), s]);
  }
  return concelhos.flatMap((c) => {
    const candidatos = porChave.get(`${c.id}|${simples(c.nome)}`) ?? [];
    if (!candidatos.length) return [];
    // Entre dois lugares com o nome do concelho, a cidade ganha à vila e a
    // vila à aldeia: a aldeia homónima não é a sede.
    const s = [...candidatos].sort(
      (a, b) => CLASSES.indexOf(a.classe ?? '') - CLASSES.indexOf(b.classe ?? ''),
    )[0];
    const classe = CLASSES.length - CLASSES.indexOf(s.classe ?? '');
    return [
      {
        nome: s.nome,
        lat: s.lat,
        lon: s.lon,
        concelho: c.id,
        peso: classe * 100_000 + (c.paragens ?? 0),
      },
    ];
  });
}
