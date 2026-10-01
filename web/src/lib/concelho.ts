/**
 * «COMO SAIO DAQUI?» — a pergunta da página de um concelho, respondida com as
 * viagens que lá param.
 *
 * A página listava as linhas como números soltos («12 · 34 · 56…»), sem
 * destino nem ligação, e quem morava no concelho tinha de abrir linha a linha
 * para saber se alguma o levava à cidade do lado. As viagens já cá estão — são as do
 * horário de cada linha (`quadro`, em `linhas/<id>.json`) —, e a conta é
 * simples: para cada viagem que passa no concelho, os outros concelhos a que
 * ela chega depois, e a que horas sai daqui.
 *
 * Funções puras, sem leituras: a página dá-lhes o que já leu, e os testes
 * dão-lhes o que inventarem.
 */
import type { Linha, LinhaDetalhe, Paragem } from './formato';

export type SaidaDoConcelho = {
  /** O concelho de destino, ou `fora:<nome da paragem>` para o que fica fora da região. */
  chave: string;
  /** O nome do concelho, ou o da paragem quando fica fora da região: «Vila Nova (Terminal)». */
  nome: string;
  /** Para onde levar o «Como chegar»: a paragem com mais partidas desse concelho. */
  para: string;
  linhas: Pick<Linha, 'id' | 'codigo' | 'cor'>[];
  viagens: number;
  /**
   * A que horas sai daqui, por tipo de dia — os mais servidos primeiro. Vazio
   * com dados de antes do horário da linha: aí sabe-se o destino, e não a hora.
   */
  porDia: { dia: string; horas: string[] }[];
};

type Acumulado = {
  nome: string;
  para: string;
  linhas: Map<string, Pick<Linha, 'id' | 'codigo' | 'cor'>>;
  viagens: number;
  porDia: Map<string, string[]>;
};

/** A paragem com mais partidas de cada concelho — o «terminal», quase sempre. */
export function paragemPrincipal(paragens: Paragem[]): Map<string, Paragem> {
  const m = new Map<string, Paragem>();
  for (const p of paragens) {
    if (!p.concelho) continue;
    const atual = m.get(p.concelho);
    if (!atual || p.partidas > atual.partidas) m.set(p.concelho, p);
  }
  return m;
}

export function saidasDoConcelho(
  concelho: string,
  detalhes: LinhaDetalhe[],
  paragens: Paragem[],
  nomesDosConcelhos: Map<string, string>,
): SaidaDoConcelho[] {
  const concelhoDe = new Map(paragens.map((p) => [p.id, p.concelho]));
  const principal = paragemPrincipal(paragens);
  const saidas = new Map<string, Acumulado>();

  const destinoDe = (id: string, nome: string) => {
    const c = concelhoDe.get(id) ?? null;
    if (c && nomesDosConcelhos.has(c)) {
      return { chave: c, nome: nomesDosConcelhos.get(c)!, para: principal.get(c)?.nome ?? nome };
    }
    return { chave: `fora:${nome}`, nome, para: nome };
  };
  const juntar = (
    d: { chave: string; nome: string; para: string },
    l: LinhaDetalhe,
    viagens: number,
    dia?: string,
    hora?: string,
  ) => {
    const a = saidas.get(d.chave) ?? {
      nome: d.nome,
      para: d.para,
      linhas: new Map(),
      viagens: 0,
      porDia: new Map(),
    };
    a.linhas.set(l.id, { id: l.id, codigo: l.codigo, cor: l.cor });
    a.viagens += viagens;
    if (dia && hora) a.porDia.set(dia, [...(a.porDia.get(dia) ?? []), hora]);
    saidas.set(d.chave, a);
  };

  /**
   * Os destinos de UMA viagem a partir deste concelho, pela ordem em que
   * passa: cada concelho da região uma vez; e, fora da região, só onde ela
   * ACABA. Contar cada paragem de fora como um destino enchia a lista de
   * aldeias de outro distrito por onde a carreira passa a caminho do
   * terminal — que é o que quem lê quer saber.
   */
  const destinosDaViagem = (paragensDepois: { id: string; nome: string }[]) => {
    const saida: { chave: string; nome: string; para: string }[] = [];
    const vistos = new Set<string>();
    let ultimaDeFora: { id: string; nome: string } | null = null;
    for (const p of paragensDepois) {
      const c = concelhoDe.get(p.id) ?? null;
      if (c === concelho) {
        ultimaDeFora = null;
        continue;
      }
      if (c && nomesDosConcelhos.has(c)) {
        ultimaDeFora = null;
        if (!vistos.has(c)) {
          vistos.add(c);
          saida.push(destinoDe(p.id, p.nome));
        }
        continue;
      }
      ultimaDeFora = p;
    }
    if (ultimaDeFora) saida.push(destinoDe(ultimaDeFora.id, ultimaDeFora.nome));
    return saida;
  };

  for (const l of detalhes) {
    for (const s of l.sentidos) {
      const q = s.quadro;
      let contadas = 0;
      if (q?.paragens.length) {
        for (const v of q.viagens) {
          // A HORA A QUE SAI DAQUI é a da primeira paragem do concelho por onde
          // a viagem passa; os destinos são os sítios a que chega DEPOIS.
          const i = q.paragens.findIndex(
            (p, k) => !!v.horas[k] && concelhoDe.get(p.id) === concelho,
          );
          if (i < 0) continue;
          contadas++;
          const depois = q.paragens.filter((_, k) => k > i && !!v.horas[k]);
          for (const d of destinosDaViagem(depois)) {
            juntar(d, l, 1, v.servico_nome, v.horas[i]);
          }
        }
      }
      if (contadas > 0) continue;
      // SEM HORÁRIO NO SENTIDO — ou sem hora marcada nenhuma neste concelho —,
      // vale o percurso mais servido: sabe-se para onde vai, não a que horas.
      const i = s.paragens.findIndex((p) => concelhoDe.get(p.id) === concelho);
      if (i < 0) continue;
      for (const d of destinosDaViagem(s.paragens.slice(i + 1))) juntar(d, l, s.viagens);
    }
  }

  return [...saidas.entries()]
    .map(([chave, a]) => ({
      chave,
      nome: a.nome,
      para: a.para,
      linhas: [...a.linhas.values()].sort((x, y) =>
        x.codigo.localeCompare(y.codigo, 'pt', { numeric: true }),
      ),
      viagens: a.viagens,
      porDia: [...a.porDia.entries()]
        .map(([dia, horas]) => ({ dia, horas: [...new Set(horas)].sort() }))
        .sort((x, y) => y.horas.length - x.horas.length || x.dia.localeCompare(y.dia, 'pt')),
    }))
    .sort((a, b) => b.viagens - a.viagens || a.nome.localeCompare(b.nome, 'pt'));
}
