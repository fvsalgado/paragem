/**
 * QUE SERVIÇOS ANDAM HOJE — e, por isso, que partidas se mostram.
 *
 * Um horário não é uma lista de horas: é uma lista de horas COM um dia. A
 * mesma carreira tem a partida das 19:30 nos dias úteis, aos sábados e aos
 * domingos, e no ficheiro isso são três registos com o mesmo aspeto. Mostrar
 * os três é dizer a quem está na paragem numa terça-feira que passam ali três
 * autocarros às 19:30. Passa um.
 *
 * Medido no terminal de uma cidade a 21/09, e foi assim que se descobriu:
 * três partidas às 19:30 na mesma linha — `V5-U`, `V5-S` e `V5-DF` — uma por
 * cima da outra, duas delas para o mesmo destino.
 *
 * **O ficheiro é o mesmo que o planeador usa.** Não é uma segunda cópia da
 * verdade: se a paragem e o planeador tivessem tabelas diferentes, podiam
 * discordar sobre o mesmo autocarro, e quem lê não teria como saber qual
 * estava certa.
 */
import { enderecoDosDados } from './dados-do-navegador.ts';

/** `servicos.json`: os serviços, e os dias (`AAAAMMDD`) em que cada um anda. */
export type DatasDosServicos = { servicos: string[]; datas: Record<string, number[]> };

/**
 * `calendario.json`: a mesma tabela, em máscaras de bits (P3-006).
 *
 * Para cada serviço, a fila dos dias em que anda — o bit `j` (byte `j / 8`,
 * do bit menos significativo para o mais) diz se anda no dia `inicio + j` —, e
 * os serviços com os mesmos dias apontam para a mesma fila (`padrao`). Na
 * região real são 96 kB em vez de 1,9 MB, e a resposta é a mesma: é o
 * `pipeline/src/paragem/sitio.py` (`calendario_em_mascaras`) que a escreve, e
 * há um teste de cada lado.
 */
export type CalendarioEmMascaras = {
  formato?: string;
  /** O primeiro dia da tabela, `AAAAMMDD` — `null` numa tabela sem dias. */
  inicio: string | null;
  /** Quantos dias ela cobre, do primeiro ao último. */
  dias: number;
  servicos: string[];
  /** As máscaras, em base64. */
  padroes: string[];
  /** A máscara de cada serviço, pela ordem de `servicos`. */
  padrao: number[];
};

/**
 * A TABELA DOS DIAS, como o sítio a usa — venha de que ficheiro vier.
 *
 * Não é o ficheiro: é o que se lhe pergunta. «Que serviços andam neste dia?»
 * e «este serviço anda neste dia?», e entre que dias a tabela fala. As duas
 * formas publicadas respondem às mesmas perguntas da mesma maneira, e é por
 * isso que o `proximas` não sabe de qual veio.
 */
export type Calendario = {
  servicos: string[];
  /** O primeiro e o último dia da tabela; `null` numa tabela sem dias. */
  periodo: { inicio: string; fim: string } | null;
  /** Os índices dos serviços que andam num dia (`AAAAMMDD`); vazio fora do período. */
  doDia: (chave: string) => readonly number[];
  /** Se o serviço `i` anda no dia — sem montar a lista do dia inteira. */
  anda: (i: number, chave: string) => boolean;
};

/** A tabela a partir do `servicos.json` — a forma de antes, que o pipeline continua a publicar. */
export function calendarioDasDatas(c: DatasDosServicos): Calendario {
  let inicio = '';
  let fim = '';
  for (const k of Object.keys(c.datas)) {
    if (!inicio || k < inicio) inicio = k;
    if (!fim || k > fim) fim = k;
  }
  const conjuntos = new Map<string, Set<number>>();
  return {
    servicos: c.servicos,
    periodo: inicio ? { inicio, fim } : null,
    doDia: (chave) => c.datas[chave] ?? [],
    anda: (i, chave) => {
      let s = conjuntos.get(chave);
      if (!s) {
        s = new Set(c.datas[chave] ?? []);
        conjuntos.set(chave, s);
      }
      return s.has(i);
    },
  };
}

/** Dias inteiros entre duas chaves `AAAAMMDD`, em UTC para a hora de verão não comer um. */
function diasEntre(de: string, ate: string): number {
  const t = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
  return Math.round((t(ate) - t(de)) / 86_400_000);
}

/** A tabela a partir do `calendario.json`. */
export function calendarioDasMascaras(c: CalendarioEmMascaras): Calendario {
  const mascaras = c.padroes.map((b64) => Uint8Array.from(atob(b64), (x) => x.charCodeAt(0)));
  const inicio = c.inicio;
  const periodo = inicio && c.dias > 0 ? { inicio, fim: chaveMais(inicio, c.dias - 1) } : null;
  const posicao = (chave: string): number => {
    if (!inicio) return -1;
    const j = diasEntre(inicio, chave);
    return j >= 0 && j < c.dias ? j : -1;
  };
  const bit = (i: number, j: number) => {
    const m = mascaras[c.padrao[i]];
    return !!m && (m[j >> 3] & (1 << (j & 7))) !== 0;
  };
  const dias = new Map<string, number[]>();
  return {
    servicos: c.servicos,
    periodo,
    doDia: (chave) => {
      let lista = dias.get(chave);
      if (!lista) {
        const j = posicao(chave);
        lista = [];
        if (j >= 0) for (let i = 0; i < c.servicos.length; i++) if (bit(i, j)) lista.push(i);
        dias.set(chave, lista);
      }
      return lista;
    },
    anda: (i, chave) => {
      const j = posicao(chave);
      return j >= 0 && bit(i, j);
    },
  };
}

const cache = new Map<string, Promise<Calendario | null>>();

/** «Não existe»: 404 num servidor de ficheiros, 400 na porta pública do armazém (`dados.ts`). */
const naoExiste = (r: Response) => r.status === 404 || r.status === 400;

/**
 * A tabela dos dias desta região, buscada uma vez — ou `null` quando não há.
 *
 * **Pede-se o `calendario.json`, e só se ele não existir o `servicos.json`.**
 * O sítio e os dados publicam-se separados: um sítio novo pode encontrar dados
 * de antes das máscaras, e lê a forma antiga em vez de dizer que não sabe.
 *
 * **Uma falha não fica guardada.** A tabela que não chegou por a rede ter
 * caído não é uma região sem tabela: guardar o `null` desta vez era dizer
 * «não se sabe» até alguém recarregar a página, mesmo depois de a rede
 * voltar. Guarda-se a resposta do servidor — que existe, ou que não existe —
 * e esquece-se a falta dela.
 */
export function calendarioDe(regiao: string): Promise<Calendario | null> {
  let p = cache.get(regiao);
  if (!p) {
    p = fetch(enderecoDosDados(regiao, 'calendario.json'))
      .then(async (r): Promise<Calendario | null> => {
        if (r.ok) {
          const c = (await r.json()) as CalendarioEmMascaras;
          return Array.isArray(c?.servicos) && Array.isArray(c?.padroes)
            ? calendarioDasMascaras(c)
            : null;
        }
        if (!naoExiste(r)) throw new Error(`calendario.json: HTTP ${r.status}`);
        const antiga = await fetch(enderecoDosDados(regiao, 'servicos.json'));
        if (antiga.ok) {
          const c = (await antiga.json()) as DatasDosServicos;
          return c?.datas && c?.servicos ? calendarioDasDatas(c) : null;
        }
        if (!naoExiste(antiga)) throw new Error(`servicos.json: HTTP ${antiga.status}`);
        return null;
      })
      .catch(() => {
        cache.delete(regiao);
        return null;
      });
    cache.set(regiao, p);
  }
  return p;
}

/** `AAAAMMDD` no fuso de quem lê. É a chave que a tabela usa. */
export function chaveDoDia(d: Date): string {
  return (
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`
  );
}

/**
 * `AAAA-MM-DD` no fuso de quem lê — a forma de um `<input type="date">`.
 *
 * Existe porque o `toISOString()` é o dia em UTC, e o «Partir agora» usava-o
 * ao lado de uma hora local: entre a meia-noite e a uma da manhã, no verão,
 * o dia era o de ONTEM e a hora era a de hoje. A pergunta ia para a véspera,
 * e o planeador respondia com as carreiras de quinta a quem perguntava na
 * madrugada de sexta. Um relógio só, para o dia e para a hora.
 */
export function dataDoCampo(d: Date): string {
  const c = chaveDoDia(d);
  return `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;
}

/** `HH:MM` no fuso de quem lê. */
export function horaDoRelogio(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** O dia `n` dias depois de uma chave. Em UTC, para a mudança da hora não comer um dia. */
export function chaveMais(chave: string, n: number): string {
  const t = Date.UTC(+chave.slice(0, 4), +chave.slice(4, 6) - 1, +chave.slice(6, 8));
  const d = new Date(t + n * 86_400_000);
  return (
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, '0')}` +
    `${String(d.getUTCDate()).padStart(2, '0')}`
  );
}

/**
 * O primeiro e o último dia que a tabela conhece.
 *
 * A tabela só escreve os dias em que ALGUM serviço anda: um domingo sem
 * serviço nenhum na região inteira não tem linha. Por isso a ausência de um
 * dia quer dizer duas coisas opostas, e é o período que as separa — dentro
 * dele, um dia que falta é um dia sem serviço; fora dele, é um dia de que os
 * horários carregados não falam.
 */
export function periodoDe(cal: Calendario): { inicio: string; fim: string } | null {
  return cal.periodo;
}

/**
 * Os serviços de um dia.
 *
 * **Um conjunto VAZIO não é `null`.** O vazio é saber: dentro do período da
 * tabela, aquele dia não tem serviço nenhum. O `null` é não saber: o dia está
 * fora do período que os horários carregados cobrem.
 */
export function servicosNoDia(cal: Calendario, chave: string): Set<string> | null {
  const p = periodoDe(cal);
  if (!p || chave < p.inicio || chave > p.fim) return null;
  return new Set(
    cal
      .doDia(chave)
      .map((i) => cal.servicos[i])
      .filter(Boolean),
  );
}

/**
 * O que a folha de uma paragem tem para dizer, AGORA.
 *
 * Eram duas respostas e havia cinco perguntas. A conta antiga, quando nenhuma
 * partida da paragem andava hoje, mostrava TODAS — e num domingo, no terminal
 * de uma cidade, anunciava como «agora» e «5 min» cinco autocarros de dias
 * úteis. Medido a 04/10/2026, com o relógio do navegador fixado. Quem lê não
 * tem como saber que aquelas horas são de outro dia, e fica à espera.
 *
 * - `sem-calendario`: a tabela dos dias não chegou, ou a região não a tem. Aí
 *   não se sabe que dia anda cada serviço, e mostra-se tudo — uma folha vazia
 *   por causa de um ficheiro que faltou é pior do que horas a mais —, MAS a
 *   folha tem de dizer que pode não ser hoje;
 * - `fora-do-periodo`: hoje está fora dos dias que os horários carregados
 *   cobrem. Não se sabe o que anda, e não se adivinha;
 * - `nenhuma`: dentro do período, a paragem não tem partida nenhuma de hoje
 *   até ao fim dele;
 * - `no-dia`: as partidas de UM dia — o de hoje, se ainda há; senão o
 *   próximo em que alguma anda AQUI, com os serviços DESSE dia. O «amanhã»
 *   depois da última partida tem de ser o amanhã a sério: numa sexta à
 *   noite, o dia seguinte é sábado, e as horas de sábado não são as de
 *   sexta.
 *
 * `hoje` diz porque é que o dia mostrado não é o de hoje: `nao-ha` (hoje não
 * passa nada nesta paragem) ou `ja-passaram` (passaram todas). Com `dias` a 0
 * vale `ha`.
 */
export type Proximas<T> =
  | { tipo: 'sem-calendario'; partidas: T[] }
  | { tipo: 'fora-do-periodo'; inicio: string; fim: string }
  | { tipo: 'nenhuma'; fim: string }
  | {
      tipo: 'no-dia';
      partidas: T[];
      /** Quantos dias depois de hoje: 0 hoje, 1 amanhã. */
      dias: number;
      /** O dia, `AAAAMMDD`. */
      chave: string;
      hoje: 'ha' | 'nao-ha' | 'ja-passaram';
    };

/** O índice de cada serviço na tabela, feito uma vez por tabela. */
const indices = new WeakMap<Calendario, Map<string, number>>();
function indiceDosServicos(cal: Calendario): Map<string, number> {
  let m = indices.get(cal);
  if (!m) {
    m = new Map(cal.servicos.map((s, i) => [s, i]));
    indices.set(cal, m);
  }
  return m;
}

/**
 * PELA HORA, e não pela ordem em que chegam.
 *
 * O pipeline manda as partidas de uma paragem pela ordem do horário impresso
 * — os serviços anuais antes dos escolares, os dias úteis antes dos sábados —,
 * que é a ordem certa para os quadros e a errada para «a seguir». Numa
 * paragem servida pela rede anual e por uma circular só de período escolar, o
 * corte das primeiras cinco ficava com as cinco seguintes da anual, e a
 * circular que passava dali a um minuto não aparecia. Foi a demonstração, a
 * primeira região com os dois serviços na mesma paragem, que o mostrou.
 */
const pelaHora = <T extends { hora: string }>(ps: T[]): T[] =>
  [...ps].sort((a, b) => a.hora.localeCompare(b.hora));

/** Uma partida sem `servico_id` anda todos os dias: o feed não declara calendário. */
const andaEm =
  <T extends { servico_id?: string }>(activos: Set<string>) =>
  (p: T) =>
    !p.servico_id || activos.has(p.servico_id);

/**
 * As partidas que interessam a quem está ali AGORA.
 *
 * Três cortes, por esta ordem, e cada um responde a uma pergunta diferente:
 *
 * 1. **anda hoje?** — pelo serviço. Uma partida sem `servico_id` passa: é o
 *    caso dos feeds que não declaram calendário, e recusá-la era escondê-la
 *    para sempre;
 * 2. **ainda não passou?** — pela hora. Se já passaram todas, procura-se o
 *    próximo dia em que alguma anda aqui, com os serviços desse dia;
 * 3. **quantas?** — cinco, que é o que cabe na folha sem a fazer rolar.
 *
 * `hoje` é o dia de quem pergunta e `agora` a hora dele, no mesmo relógio.
 */
export function proximas<T extends { hora: string; servico_id?: string }>(
  partidas: T[],
  hoje: Date,
  agora: string,
  cal: Calendario | null,
  quantas = 5,
): Proximas<T> {
  if (!cal) {
    // NÃO SE SABE QUE DIA É DE QUÊ. Mostra-se o que falta pela hora — ou, se
    // já passou tudo, o princípio da lista —, e quem chama diz que as horas
    // podem não ser de hoje e não promete minutos: «agora» sobre um autocarro
    // que pode nem andar hoje é o engano inteiro outra vez.
    const aSeguir = partidas.filter((p) => p.hora >= agora);
    return {
      tipo: 'sem-calendario',
      partidas: pelaHora(aSeguir.length ? aSeguir : partidas).slice(0, quantas),
    };
  }

  const periodo = periodoDe(cal);
  const chave = chaveDoDia(hoje);
  if (!periodo || chave < periodo.inicio || chave > periodo.fim) {
    return {
      tipo: 'fora-do-periodo',
      inicio: periodo?.inicio ?? '',
      fim: periodo?.fim ?? '',
    };
  }

  // Dentro do período, um dia sem linha na tabela é um dia sem serviço.
  const partidasDo = (dia: string) =>
    partidas.filter(
      andaEm(
        new Set(
          cal
            .doDia(dia)
            .map((i) => cal.servicos[i])
            .filter(Boolean),
        ),
      ),
    );

  const deHoje = partidasDo(chave);
  const aSeguir = deHoje.filter((p) => p.hora >= agora);
  if (aSeguir.length) {
    return {
      tipo: 'no-dia',
      partidas: pelaHora(aSeguir).slice(0, quantas),
      dias: 0,
      chave,
      hoje: 'ha',
    };
  }

  // O PRÓXIMO DIA COM PARTIDAS AQUI, e não o dia seguinte às cegas. Uma
  // paragem servida só em período escolar, ou só às quintas-feiras de
  // mercado, tem dias seguidos sem nada — e o que responde a «quando é o
  // próximo?» é o primeiro em que alguma coisa passa. Vai até ao fim do
  // período: depois dele os horários carregados já não falam.
  //
  // Pergunta-se a cada dia só pelos serviços DESTA paragem — uma dezena —, e
  // não se monta o conjunto dos mil e tal da região dia a dia: uma paragem só
  // de verão, aberta em outubro, percorre meses, e isto corre a cada
  // renderização da folha.
  const indice = indiceDosServicos(cal);
  const todosOsDias = partidas.some((p) => !p.servico_id);
  const daqui = new Set<number>();
  for (const p of partidas) {
    const i = p.servico_id ? indice.get(p.servico_id) : undefined;
    if (i !== undefined) daqui.add(i);
  }
  const andaAlgumaNo = (dia: string) => todosOsDias || [...daqui].some((i) => cal.anda(i, dia));
  for (let n = 1, dia = chaveMais(chave, 1); dia <= periodo.fim; n++, dia = chaveMais(chave, n)) {
    const doDia = andaAlgumaNo(dia) ? partidasDo(dia) : [];
    if (doDia.length) {
      return {
        tipo: 'no-dia',
        partidas: pelaHora(doDia).slice(0, quantas),
        dias: n,
        chave: dia,
        hoje: deHoje.length ? 'ja-passaram' : 'nao-ha',
      };
    }
  }
  return { tipo: 'nenhuma', fim: periodo.fim };
}

// --- o dia por extenso -------------------------------------------------------

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** «domingo», «segunda-feira» — o dia da semana de uma chave. */
export function diaDaSemana(chave: string): string {
  const d = new Date(Date.UTC(+chave.slice(0, 4), +chave.slice(4, 6) - 1, +chave.slice(6, 8)));
  return DIAS_DA_SEMANA[d.getUTCDay()];
}

/** «14/12/2025», «01/01/2025» — a data inteira, para os limites do período. */
export function dataCompleta(chave: string): string {
  return `${chave.slice(6, 8)}/${chave.slice(4, 6)}/${chave.slice(0, 4)}`;
}

/** «5/10», ou «5/10/2027» quando o ano não é o de `referencia`. */
export function diaCurto(chave: string, referencia = ''): string {
  const dia = `${+chave.slice(6, 8)}/${+chave.slice(4, 6)}`;
  return referencia && referencia.slice(0, 4) !== chave.slice(0, 4)
    ? `${dia}/${chave.slice(0, 4)}`
    : dia;
}

/**
 * «amanhã», «na segunda-feira, 5/10», «no sábado, 3/10».
 *
 * O artigo é o do dia: o sábado e o domingo são «o», as feiras são «a». É a
 * única contração que esta página escreve, e é sobre o calendário — não sobre
 * nenhuma região.
 */
export function quandoE(chave: string, dias: number, hoje: string): string {
  if (dias === 1) return 'amanhã';
  const nome = diaDaSemana(chave);
  const artigo = nome === 'sábado' || nome === 'domingo' ? 'no' : 'na';
  return `${artigo} ${nome}, ${diaCurto(chave, hoje)}`;
}

/**
 * A frase que vai antes das horas, quando elas não são de hoje.
 *
 * Sem ela, uma lista de horas de segunda-feira lida ao domingo parece a lista
 * de domingo. Vazia quando as horas são de hoje — aí não há nada a explicar.
 */
export function fraseDoDia(r: Proximas<unknown>, hoje: Date): string {
  if (r.tipo !== 'no-dia' || r.dias === 0) return '';
  const h = chaveDoDia(hoje);
  const quando = quandoE(r.chave, r.dias, h);
  return r.hoje === 'nao-ha'
    ? `Hoje, ${diaDaSemana(h)}, não há partidas nesta paragem. As próximas são ${quando}:`
    : `Hoje já não há mais partidas nesta paragem. As próximas são ${quando}:`;
}
