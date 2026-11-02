/**
 * O QUE MAIS HÁ À PORTA DE UMA ESTAÇÃO — e a que distância.
 *
 * O princípio do produto é uma só porta de entrada, e a página de uma estação
 * só mostrava o comboio e o autocarro: a estação de bicicletas do outro lado
 * do largo, a praça de táxis a cem metros e o urbano que acaba «na estação»
 * não apareciam em lado nenhum (auditoria de 1/11/2026, #82). Estão nos dados
 * dos modos; junta-se aqui o que fica a poucos passos.
 *
 * Só o que tem sítio: uma paragem de urbano que o cartaz nomeia e ninguém
 * mapeou não se põe à porta de nada (CLAUDE.md §4.4).
 */
import type { Modos } from './formato.ts';
import { metrosEntre } from './lista-de-paragens.ts';
import { juntarPontos } from './pagina-do-modo.ts';

/** Até onde é «à porta»: o que se anda a pé com uma mala, sem atravessar a vila. */
export const RAIO_DA_PORTA = 400;

export type CoisaAqui = {
  /** O modo, como a região o declara: `bicicleta`, `taxi`, `urbano-municipal`, `expresso`. */
  modo: string;
  /** O que é, para quem lê: o nome da estação, «Praça de táxis», a paragem do urbano. */
  nome: string;
  /** De que sistema ou linha: «Bicla», «Urbano da Vila»; vazio quando o nome já diz tudo. */
  de: string;
  metros: number;
  /** O identificador do ponto no mapa e na disponibilidade, quando há. */
  id: string | null;
};

const arredondar = (m: number) => Math.round(m / 10) * 10;

export function tambemAqui(
  ponto: { lat: number; lon: number },
  modos: Modos,
  raio = RAIO_DA_PORTA,
): CoisaAqui[] {
  const perto = (p: { lat: number; lon: number }) => {
    const m = metrosEntre(ponto, p);
    return Number.isFinite(m) && m <= raio ? arredondar(m) : null;
  };
  const coisas: CoisaAqui[] = [];
  for (const [modo, d] of Object.entries(modos)) {
    for (const s of d.sistemas ?? []) {
      // Um sistema por confirmar não se oferece à porta: pode não estar a
      // funcionar, e a página do modo di-lo com mais espaço.
      if (s.estado === 'por-confirmar') continue;
      for (const e of s.estacoes) {
        const metros = perto(e);
        if (metros !== null)
          coisas.push({ modo, nome: e.nome ?? 'Estação', de: s.nome, metros, id: e.id ?? null });
      }
    }
    // A mesma praça mapeada duas vezes é uma (`juntarPontos`, #189).
    for (const p of juntarPontos(d.pontos ?? [])) {
      const metros = perto(p);
      if (metros !== null) {
        coisas.push({
          modo,
          nome: p.nome ?? (modo === 'taxi' ? 'Praça de táxis' : modo),
          de: '',
          metros,
          id: p.id ?? null,
        });
      }
    }
    for (const h of d.horarios ?? []) {
      // A paragem MAIS PERTO de cada linha, e não todas: os dois lados da
      // rua e a paragem seguinte diziam a mesma coisa três vezes.
      const daLinha = Object.entries(h.coordenadas ?? {})
        .map(([nome, c]) => ({ nome, metros: perto(c) }))
        .filter((x): x is { nome: string; metros: number } => x.metros !== null)
        .sort((a, b) => a.metros - b.metros)[0];
      if (daLinha)
        coisas.push({ modo, nome: daLinha.nome, de: h.nome, metros: daLinha.metros, id: null });
    }
    for (const p of d.paragens ?? []) {
      const metros = perto(p);
      if (metros !== null) coisas.push({ modo, nome: p.nome, de: '', metros, id: p.id ?? null });
    }
  }
  return coisas.sort((a, b) => a.metros - b.metros || a.nome.localeCompare(b.nome, 'pt'));
}
