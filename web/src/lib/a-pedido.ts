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

// --- o transporte a pedido no planeador -----------------------------------

/** Uma ponta de uma viagem, como o planeador a conhece: o nome e o concelho. */
export type PontaAPedido = { nome: string; concelho: string | null };

/**
 * O que se propõe a quem pede uma viagem, do transporte a pedido.
 *
 * NÃO É UM ITINERÁRIO, e não finge ser: não há horas inventadas, nem uma
 * viagem montada com um circuito que só passa se alguém o chamar. É o que os
 * dados dizem — o circuito, onde passa, os dias que a brochura escreve —, com
 * a regra de reserva e o caminho para reservar.
 */
export type PropostaAPedido = {
  /** O circuito, ou a zona, ou a ligação. */
  nome: string;
  /** «em Pedra Alta», «entre Pedra Alta e Ribeira do Corvo». */
  onde: string;
  /** As paragens do circuito na terra da partida, e na da chegada. */
  naPartida: string[];
  naChegada: string[];
  /** O que a brochura diz do circuito — os dias, sobretudo. */
  regras: string[];
  /** Onde estão as horas dele, quando alguma fonte as publica. */
  horario: string | null;
  /** Que pontas liga: as duas, ou só uma delas. */
  liga: 'as-duas' | 'de' | 'para';
  /** O que é — e é o que a ligação para lá diz: «Ver o circuito», «Ver a zona». */
  oQue: 'ligacao' | 'circuito' | 'zona' | 'zonas';
  /** Se a reserva online serve esta zona — quando a fonte o diz. */
  reservaOnline: boolean | null;
};

/** O nome sem o que vem entre parênteses: «Pedra Alta (Centro)» → «pedra alta». */
const terraDe = (nome: string): string => simples(nome.replace(/\s*\([^)]*\)\s*$/, ''));

/** Uma paragem de um circuito que é, ou fica na terra de, uma ponta da viagem. */
function bate(paragem: string, ponta: PontaAPedido | null): boolean {
  if (!ponta?.nome) return false;
  const p = simples(paragem);
  const q = simples(ponta.nome);
  return p === q || terraDe(paragem) === terraDe(ponta.nome);
}

/**
 * O TRANSPORTE A PEDIDO QUE SERVE AS PONTAS DE UMA VIAGEM (P2-036).
 *
 * O planeador nunca o propunha, nem onde é o único transporte da aldeia: a
 * quem pedia uma viagem de uma terra só servida a pedido respondia «não há»,
 * que é falso. Três maneiras de bater, da mais forte para a mais fraca:
 *
 * 1. uma LIGAÇÃO a pedido entre os concelhos das duas pontas (`entre`) — é o
 *    serviço desenhado para essa viagem;
 * 2. um CIRCUITO cujas paragens são as pontas, ou ficam nas terras delas —
 *    pelo nome, que é o que as brochuras publicam (não têm coordenadas);
 * 3. as ZONAS do concelho de uma ponta, quando nada mais bate — «há
 *    transporte a pedido em X», com o caminho para as zonas.
 *
 * `soAsDuas` deixa só o que liga as duas pontas: com opções da rede regular
 * à frente, um circuito que serve uma ponta só é ruído.
 */
export function aPedidoNasPontas(
  d: APedido,
  de: PontaAPedido | null,
  para: PontaAPedido | null,
  url: (caminho: string) => string,
  { soAsDuas = false, maximo = 4 }: { soAsDuas?: boolean; maximo?: number } = {},
): PropostaAPedido[] {
  const propostas: PropostaAPedido[] = [];
  const prazo = simples(d.reservas.prazo ?? '');
  // A regra de reserva geral vai à parte, uma vez; repeti-la em cada circuito
  // era a mesma frase quatro vezes seguidas.
  const semOPrazo = (regras: string[]) =>
    regras.filter((x) => !prazo || !simples(x).includes(prazo.slice(0, 20)));

  // 1. As ligações entre os dois concelhos.
  const cDe = de?.concelho ?? null;
  const cPara = para?.concelho ?? null;
  if (cDe && cPara && cDe !== cPara) {
    for (const z of d.zonas) {
      if (!z.entre?.includes(cDe) || !z.entre.includes(cPara)) continue;
      propostas.push({
        // O nome de uma ligação já diz entre onde («… Pedra Alta – Ribeira
        // do Corvo»); repeti-lo era a mesma informação duas vezes na linha.
        nome: z.nome,
        onde: '',
        naPartida: [],
        naChegada: [],
        regras: [],
        horario: url(`a-pedido/#z-${z.id}`),
        liga: 'as-duas',
        oQue: 'ligacao',
        reservaOnline: z.reserva_online ?? null,
      });
    }
  }

  // 2. Os circuitos com paragens nas pontas.
  const vistos = new Set<string>();
  for (const h of d.horarios) {
    for (const q of h.quadros) {
      // Um quadro de PARTIDAS é uma tabela, e o nome dele diz o que a tabela
      // é («Partidas de cada cidade»), não o serviço: aí o nome é o da folha.
      const nome = (q.tipo === 'partidas' ? '' : q.nome) || h.nome;
      const nasDe = q.paragens.filter((p) => bate(p, de));
      const nasPara = q.paragens.filter((p) => bate(p, para));
      if (!nasDe.length && !nasPara.length) continue;
      const liga = nasDe.length && nasPara.length ? 'as-duas' : nasDe.length ? 'de' : 'para';
      if (soAsDuas && liga !== 'as-duas') continue;
      const chave = `${h.id}\u0000${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      propostas.push({
        nome,
        // «Circuitos da Serra em Serra» não: o concelho só se diz se o nome não o diz.
        onde:
          h.concelho_nome && !simples(nome).includes(simples(h.concelho_nome))
            ? `em ${h.concelho_nome}`
            : '',
        naPartida: nasDe,
        naChegada: nasPara,
        regras: semOPrazo(q.regras ?? []),
        horario: url(`${caminhoDoHorario(h.id)}#${idDoQuadro(nome)}`),
        liga,
        oQue: 'circuito',
        reservaOnline: null,
      });
    }
  }

  // 3. As zonas do concelho, para a ponta que nada mais serviu — uma vez por
  //    concelho: com as duas pontas no mesmo, eram as mesmas zonas duas vezes.
  if (!soAsDuas) {
    const ditos = new Set<string>();
    for (const [ponta, liga] of [
      [de, 'de'],
      [para, 'para'],
    ] as const) {
      const c = ponta?.concelho;
      if (!c || ditos.has(c)) continue;
      if (propostas.some((p) => p.liga === liga || p.liga === 'as-duas')) continue;
      const zonas = d.zonas.filter((z) => z.concelho === c);
      if (!zonas.length) continue;
      ditos.add(c);
      propostas.push({
        nome: zonas.length === 1 ? zonas[0].nome : `${zonas.length} zonas de transporte a pedido`,
        onde: zonas[0].concelho_nome ? `em ${zonas[0].concelho_nome}` : '',
        naPartida: [],
        naChegada: [],
        regras: [],
        horario: url(`a-pedido/#z-${zonas[0].id}`),
        liga,
        oQue: zonas.length === 1 ? 'zona' : 'zonas',
        reservaOnline: zonas.every((z) => z.reserva_online === true)
          ? true
          : zonas.some((z) => z.reserva_online === false)
            ? false
            : null,
      });
    }
  }

  const peso = { 'as-duas': 0, de: 1, para: 1 } as const;
  return propostas.sort((a, b) => peso[a.liga] - peso[b.liga]).slice(0, maximo);
}
