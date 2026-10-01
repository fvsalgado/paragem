/**
 * O transporte a pedido, arrumado para quem pergunta «há na minha terra?».
 *
 * Funções puras, sem leituras: a página dá-lhes o que leu do `a-pedido.json`.
 */
import type { APedido } from './formato';
import { simples } from './letras.ts';

/** O endereço do horário de um grupo de circuitos — uma brochura, um folheto. */
export const caminhoDoHorario = (grupo: string): string => `a-pedido/${grupo}/`;

/** O identificador de um quadro dentro da página do grupo, para lá ir direto. */
export const idDoQuadro = (nome: string): string =>
  `q-${simples(nome)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/**
 * Um circuito onde se pode procurar: o nome, onde é (o concelho ou a zona,
 * quando se sabe), e para onde levar — o horário dele nesta página, ou o
 * folheto da autoridade, ou nada, quando nenhuma fonte publica as horas.
 */
export type CircuitoProcuravel = {
  nome: string;
  onde: string;
  horario: string | null;
  folheto: string | null;
};

/**
 * O ÍNDICE DAS TERRAS: cada nome que aparece nos circuitos — o do circuito, o
 * das paragens de cada quadro, o das zonas — e os circuitos onde aparece.
 *
 * É pequeno de propósito, porque vai para o navegador: os nomes escrevem-se
 * uma vez e os circuitos são índices. «Há transporte a pedido na minha
 * terra?» obrigava a ler 24 ecrãs de zonas com nomes de contrato; com isto,
 * escreve-se o nome da aldeia e a resposta diz qual circuito lá passa.
 */
export type IndiceDasTerras = {
  circuitos: CircuitoProcuravel[];
  /** `[nome da terra, índices em circuitos]`. */
  terras: [string, number[]][];
};

export function indiceDasTerras(d: APedido, url: (caminho: string) => string): IndiceDasTerras {
  const circuitos: CircuitoProcuravel[] = [];
  const chaveDe = new Map<string, number>();
  const terras = new Map<string, Set<number>>();
  const juntarCircuito = (c: CircuitoProcuravel) => {
    const k = `${c.nome}\u0000${c.horario ?? c.folheto ?? c.onde}`;
    let i = chaveDe.get(k);
    if (i === undefined) {
      i = circuitos.push(c) - 1;
      chaveDe.set(k, i);
    }
    return i;
  };
  const juntarTerra = (nome: string, i: number) => {
    const n = nome.trim();
    if (!n) return;
    const s = terras.get(n) ?? new Set<number>();
    s.add(i);
    terras.set(n, s);
  };

  const horarioDe = (grupo: string, quadro?: string) =>
    url(`${caminhoDoHorario(grupo)}${quadro ? `#${idDoQuadro(quadro)}` : ''}`);

  // Primeiro os horários, que sabem o concelho; depois as zonas, que sabem a
  // zona; e por fim o catálogo, que só sabe o nome. Um circuito que esteja
  // nos três fica com o que se soube primeiro.
  for (const h of d.horarios) {
    const onde = h.concelho_nome || '';
    for (const q of h.quadros) {
      const nome = q.nome || h.nome;
      const i = juntarCircuito({ nome, onde, horario: horarioDe(h.id, q.nome), folheto: null });
      juntarTerra(nome, i);
      for (const p of q.paragens) juntarTerra(p, i);
    }
  }
  for (const z of d.zonas) {
    for (const c of z.circuitos) {
      const i = juntarCircuito({
        nome: c.nome,
        onde: `zona ${z.nome}`,
        horario: c.horario ? horarioDe(c.horario.grupo, c.horario.quadro) : null,
        folheto: c.folheto ?? null,
      });
      juntarTerra(c.nome, i);
    }
  }
  for (const c of d.circuitos) {
    const i = juntarCircuito({
      nome: c.nome,
      onde: '',
      horario: c.horario ? horarioDe(c.horario.grupo, c.horario.quadro) : null,
      folheto: c.folheto ?? null,
    });
    juntarTerra(c.nome, i);
  }
  return {
    circuitos,
    terras: [...terras.entries()]
      .map(([nome, s]) => [nome, [...s].sort((a, b) => a - b)] as [string, number[]])
      .sort((a, b) => a[0].localeCompare(b[0], 'pt')),
  };
}

/**
 * As terras cujo nome tem o que se escreveu, e os circuitos de cada uma — as
 * que COMEÇAM pelo que se escreveu primeiro. Sem acentos e sem maiúsculas.
 */
export function procurarTerra(
  indice: IndiceDasTerras,
  pergunta: string,
  quantas = 8,
): { terra: string; circuitos: CircuitoProcuravel[] }[] {
  const q = simples(pergunta);
  if (q.length < 2) return [];
  const achadas = indice.terras
    .map(([nome, is]) => ({ nome, is, s: simples(nome) }))
    .filter((t) => t.s.includes(q))
    .sort(
      (a, b) =>
        Number(!a.s.startsWith(q)) - Number(!b.s.startsWith(q)) ||
        a.nome.localeCompare(b.nome, 'pt'),
    );
  return achadas.slice(0, quantas).map((t) => ({
    terra: t.nome,
    circuitos: t.is.map((i) => indice.circuitos[i]),
  }));
}
