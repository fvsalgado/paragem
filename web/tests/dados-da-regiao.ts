/**
 * O QUE ESTA REGIÃO TEM, lido do que o pipeline acabou de construir.
 *
 * Os testes de interface precisam de exemplos concretos: uma paragem com
 * muitas partidas, uma linha com muitas viagens, um concelho com muitas
 * paragens, um sítio onde haja paragens à volta. Estavam escritos à mão — o
 * identificador de uma paragem de um cliente, o nome de uma terra — e isso
 * tem dois defeitos, e o segundo é o pior:
 *
 *   1. a suite é pública e o território de quem nos contrata não é nosso para
 *      publicar (§11.6): um teste que diga o nome de uma paragem dele só corre
 *      onde esse contrato está, e escreve na suite o que ele tem;
 *   2. o exemplo cravado ENVELHECE. «A paragem com mais partidas» deixou de
 *      ser aquela na primeira alteração de horários, e o teste passou a medir
 *      o molde mais fácil sem ninguém dar por isso.
 *
 * Aqui pergunta-se aos dados, todas as vezes. O comentário que escolhia os
 * exemplos — «as mais DIFÍCEIS de cada tipo» — passa a ser código.
 *
 * E o que a região NÃO tem responde-se da mesma maneira: a demonstração não
 * tem comboio nem transporte a pedido nem sítios do OpenStreetMap, e um caso
 * que precise deles SALTA com a razão escrita em vez de falhar ou de
 * desaparecer.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { modoDoTipo, modulosDesligadosDoAmbiente } from '../src/lib/modulos.ts';
import { BUILD, REGIAO } from './anfitrioes';

const cache = new Map<string, unknown>();

function lerDe<T>(...partes: string[]): T | null {
  const chave = partes.join('/');
  if (!cache.has(chave)) {
    const f = join(BUILD, ...partes);
    cache.set(chave, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  }
  return cache.get(chave) as T | null;
}

const ler = <T>(regiao: string, nome: string): T | null => lerDe<T>(regiao, 'sitio', nome);

export type Paragem = {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  linhas: string[];
  partidas: number;
  concelho: string;
};
type Linha = { id: string; codigo: string; nome: string; modo: string; viagens: number };
type Concelho = { id: string; nome: string; paragens: number };
type Estacao = { id: string; nome: string; lat: number; lon: number; concelho: string | null };
export type Sistema = { nome: string; estado: string | null; estacoes: Estacao[] };
type Viagem = { passagens: [string, string][]; rotulo: string };
type Quadro = { nome: string; tipo?: string; viagens: Viagem[] };
export type HorarioDeModo = {
  id: string;
  nome: string;
  operador: string;
  regras: string[];
  paragens: string[];
  sem_coordenada: string[];
  viagens: number;
  coordenadas: Record<string, unknown>;
  quadros: Quadro[];
};
export type ParagemDeModo = { nome: string; concelho: string | null };
export type Modo = {
  modo: string;
  quantos: number;
  incompleto: boolean;
  notas: string[];
  sistemas: Sistema[];
  horarios: HorarioDeModo[];
  percursos: { nome: string }[];
  pontos: { concelho: string | null }[];
  paragens: ParagemDeModo[];
};

/** As paragens de autocarro, como a página de paragens as lista. */
export const paragens = (regiao = REGIAO): Paragem[] =>
  ler<Paragem[]>(regiao, 'paragens.json') ?? [];

/** As estações de comboio. Vazio numa região sem comboio — e isso é uma resposta. */
export const estacoes = (regiao = REGIAO): Estacao[] =>
  ler<Estacao[]>(regiao, 'estacoes.json') ?? [];

export const linhas = (regiao = REGIAO): Linha[] => ler<Linha[]>(regiao, 'linhas.json') ?? [];

export const concelhos = (regiao = REGIAO): Concelho[] =>
  ler<Concelho[]>(regiao, 'concelhos.json') ?? [];

export const modos = (regiao = REGIAO): Record<string, Modo> =>
  ler<Record<string, Modo>>(regiao, 'modos.json') ?? {};

/** O que a região tem de um modo — vazio se não o declarar. */
export const modo = (m: string, regiao = REGIAO): Modo | null => modos(regiao)[m] ?? null;

/** Um modo existe nesta região? É o que decide se a página dele abre ou dá 404. */
export const temModo = (m: string, regiao = REGIAO): boolean => m in modos(regiao);

/**
 * Os modos desta região que o sítio serve HOJE: os que ela declara menos os
 * que estiverem desligados no ambiente. Um modo desligado dá 404 de propósito
 * — é o interruptor do painel a fazer efeito (`modulos.spec.ts`) —, e um teste
 * que o visite tem de saltar em vez de reprovar.
 */
export function modosDisponiveis(regiao = REGIAO): string[] {
  const desligados = modulosDesligadosDoAmbiente()[regiao] ?? [];
  return Object.keys(modos(regiao)).filter((m) => !desligados.includes(m));
}

export const temModoLigado = (m: string, regiao = REGIAO): boolean =>
  modosDisponiveis(regiao).includes(m);

/**
 * Um modo com página própria: os outros seis, que não a rede nem o comboio —
 * esses vivem em `/rede/`. Serve para provar que a grelha «Por modo» leva a
 * algum lado sem nomear um modo que esta região possa não ter.
 */
export function umModoComPagina(regiao = REGIAO): string | null {
  return modosDisponiveis(regiao).find((m) => !['autocarro', 'comboio'].includes(m)) ?? null;
}

/** Há sítios do OpenStreetMap para a procura responder além das paragens? */
export const temSitios = (regiao = REGIAO): boolean =>
  existsSync(join(BUILD, regiao, 'sitio', 'sitios.json'));

export type APedido = {
  circuitos: { nome: string }[];
  zonas: {
    id: string;
    nome: string;
    concelho: string;
    concelho_nome: string;
    circuitos: unknown[];
  }[];
  sem_zona: { id: string; nome: string }[];
  horarios: {
    id: string;
    nome: string;
    concelho: string;
    quadros: { tipo?: string; horas?: string[][]; viagens?: Viagem[] }[];
  }[];
  reservas: { telefone?: string; telefone_apresentado?: string; online?: string };
};

/** O transporte a pedido desta região — nulo se ela não tiver nenhum. */
export const aPedido = (regiao = REGIAO): APedido | null => {
  const a = ler<APedido>(regiao, 'a-pedido.json');
  return a && Array.isArray(a.circuitos) && a.circuitos.length > 0 ? a : null;
};

/** Há transporte a pedido levantado? */
export const temAPedido = (regiao = REGIAO): boolean => aPedido(regiao) !== null;

/**
 * A paragem mais difícil de desenhar: a que tem mais partidas.
 *
 * É a que o molde tem de aguentar — mais linhas, mais horas, mais tudo. Se o
 * molde parte, parte primeiro aqui.
 */
export function paragemComMaisPartidas(regiao = REGIAO): Paragem {
  const todas = paragens(regiao);
  if (!todas.length) throw new Error(`a região ${regiao} não tem paragens construídas`);
  return [...todas].sort((a, b) => b.partidas - a.partidas || a.id.localeCompare(b.id))[0];
}

/** A linha com mais viagens, pela mesma razão. */
export function linhaComMaisViagens(regiao = REGIAO): Linha {
  const todas = linhas(regiao);
  if (!todas.length) throw new Error(`a região ${regiao} não tem linhas construídas`);
  return [...todas].sort((a, b) => b.viagens - a.viagens || a.id.localeCompare(b.id))[0];
}

/** O concelho com mais paragens. */
export function concelhoComMaisParagens(regiao = REGIAO): Concelho {
  const todos = concelhos(regiao);
  if (!todos.length) throw new Error(`a região ${regiao} não tem concelhos construídos`);
  return [...todos].sort((a, b) => b.paragens - a.paragens || a.id.localeCompare(b.id))[0];
}

/**
 * Onde pôr o ponto azul para o «Perto de ti» ter o que mostrar: em cima da
 * paragem com mais partidas, que é onde há mais para responder à volta.
 */
export function ondeHaParagens(regiao = REGIAO): { latitude: number; longitude: number } {
  const p = paragemComMaisPartidas(regiao);
  return { latitude: p.lat, longitude: p.lon };
}

/**
 * O que escrever na caixa de procura para encontrar UMA paragem e não vinte.
 *
 * Os nomes têm a forma `Terra (Sítio)`; o pedaço entre parênteses é o que
 * distingue duas paragens da mesma terra, e é por isso que se procura pelo
 * nome inteiro sem o fecho — como quem escreve e deixa a lista filtrar.
 */
export function buscaDeUmaParagem(regiao = REGIAO): { nome: string; busca: string } {
  const nome = paragemComMaisPartidas(regiao).nome;
  return { nome, busca: nome.replace(/\)\s*$/, '') };
}

/** Uma estação de bicicletas partilhadas, se a região tiver alguma. */
export function umaEstacaoDeBicicletas(regiao = REGIAO): Estacao | null {
  const bicicleta = modo('bicicleta', regiao);
  for (const sistema of bicicleta?.sistemas ?? []) {
    const primeira = [...(sistema.estacoes ?? [])].sort((a, b) => a.nome.localeCompare(b.nome))[0];
    if (primeira) return primeira;
  }
  return null;
}

/**
 * Os sítios do OpenStreetMap — o que se escreve quando não se procura uma
 * paragem. Vazio numa região que não tenha nenhum.
 */
export function sitios(regiao = REGIAO): { nome: string; tipo: string; classe: string }[] {
  const indice = ler<{ campos: string[]; sitios: unknown[][] }>(regiao, 'sitios.json');
  if (!indice) return [];
  const onde = (campo: string) => indice.campos.indexOf(campo);
  const [n, tp, cl] = [onde('nome'), onde('tipo'), onde('classe')];
  return indice.sitios.map((s) => ({
    nome: String(s[n]),
    tipo: String(s[tp]),
    classe: String(s[cl]),
  }));
}

/**
 * Os pontos do índice da procura — paragens, estações, bicicletas, táxis,
 * sítios do OpenStreetMap. É o mesmo ficheiro que alimenta o mapa.
 */
export function pontosDaProcura(regiao = REGIAO): { nome: string; tipo: string; id: string }[] {
  const indice = ler<{ campos: string[]; pontos: unknown[][] }>(regiao, 'procura.json');
  if (!indice) return [];
  const onde = (campo: string) => indice.campos.indexOf(campo);
  const [n, tp, id] = [onde('nome'), onde('tipo'), onde('id')];
  return indice.pontos.map((p) => ({
    nome: String(p[n]),
    tipo: String(p[tp]),
    id: String(p[id]),
  }));
}

/**
 * As camadas que o mapa desta região vai ter: um tipo por camada, menos o que
 * estiver desligado no ambiente (`PARAGEM_MODULOS_DESLIGADOS`, que é como o CI
 * prova o interruptor do painel sem base nenhuma). Os sítios não são de modo
 * nenhum e não ganham camada.
 */
export function tiposNoMapa(regiao = REGIAO): string[] {
  const desligados = modulosDesligadosDoAmbiente()[regiao] ?? [];
  const tipos = new Set(
    pontosDaProcura(regiao)
      .map((p) => p.tipo)
      .filter((t) => t !== 'sitio' && !desligados.includes(modoDoTipo(t))),
  );
  return [...tipos].sort();
}

/**
 * As viagens que a região EXIGE que se saibam responder.
 *
 * São a declaração dela (`motor.viagens_de_prova`), a mesma que o motor usa —
 * e é por isso que estão aqui em vez de escritas no teste: uma região nova
 * traz as suas, e uma região que não declare nenhuma não tem por onde este
 * caso correr.
 */
export type ViagemDeProva = {
  nome: string;
  de: { nome: string; lat: number; lon: number };
  para: { nome: string; lat: number; lon: number };
};

export function viagensDeProva(regiao = REGIAO): ViagemDeProva[] {
  return lerDe<{ viagens: ViagemDeProva[] }>(regiao, 'oraculo.json')?.viagens ?? [];
}

/**
 * O dia em que vale a pena perguntar: o de mais serviço a partir de hoje.
 *
 * Uma data escrita à mão no teste passa a ser passado — e um domingo, ou um
 * dia fora do calendário, devolve «não há viagem» sem que isso prove nada.
 */
export function diaComMaisServico(regiao = REGIAO): string | null {
  const datas = ler<{ datas: Record<string, unknown[]> }>(regiao, 'viagens.json')?.datas;
  if (!datas) return null;
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todas = Object.keys(datas).sort();
  const futuras = todas.filter((d) => d >= hoje);
  const escolhida = (futuras.length ? futuras : todas)
    .map((d) => [d, datas[d].length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return escolhida
    ? `${escolhida.slice(0, 4)}-${escolhida.slice(4, 6)}-${escolhida.slice(6)}`
    : null;
}

/** A paragem mais perto de um ponto, se houver alguma a menos de `raio` metros. */
export function paragemPerto(
  lat: number,
  lon: number,
  raio = 400,
  regiao = REGIAO,
): Paragem | null {
  const metros = (a: Paragem) =>
    Math.hypot((a.lat - lat) * 111_320, (a.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180));
  const perto = [...paragens(regiao)].sort((a, b) => metros(a) - metros(b))[0];
  return perto && metros(perto) <= raio ? perto : null;
}

/**
 * Duas paragens distintas para encher os dois campos das direções — de
 * concelhos diferentes quando os há, que é como se pede uma viagem a sério.
 */
export function duasParagens(regiao = REGIAO): [Paragem, Paragem] | null {
  const porPartidas = [...paragens(regiao)].sort(
    (a, b) => b.partidas - a.partidas || a.id.localeCompare(b.id),
  );
  const a = porPartidas[0];
  if (!a) return null;
  const b = porPartidas.find((p) => p.concelho !== a.concelho) ?? porPartidas[1];
  return b ? [a, b] : null;
}

/**
 * A região tem mosaicos para o mapa desenhar?
 *
 * As demonstrações constroem-se sem rede e não têm recorte do OpenStreetMap:
 * a página diz «sem mapa» e desenha a lista. Um caso que toque no mapa não tem
 * lá o que medir.
 */
export const temMosaicos = (regiao = REGIAO): boolean =>
  existsSync(join(BUILD, regiao, 'mosaicos', 'regiao.pmtiles'));

/** Quantos títulos do tarifário estão por confirmar com quem os publica. */
export const tarifasPorConfirmar = (regiao = REGIAO): number =>
  ler<{ por_confirmar?: number }>(regiao, 'tarifas.json')?.por_confirmar ?? 0;

/**
 * Quantas descargas estão «para consulta» — sem licença aberta declarada.
 *
 * Zero é um estado legítimo e é onde se quer chegar: quer dizer que tudo o
 * que esta região publica se pode reutilizar. O que NÃO é legítimo é a página
 * não dizer qual dos dois casos é — e é isso que o teste do §4.4 verifica.
 */
export const descargasParaConsulta = (regiao = REGIAO): number =>
  (ler<{ termos?: string }[]>(regiao, 'dados-abertos.json') ?? []).filter(
    (d) => d.termos === 'consulta',
  ).length;

/** O fuso em que esta região lê as suas horas. */
export const fusoDaRegiao = (regiao = REGIAO): string =>
  ler<{ fuso?: string }>(regiao, 'viagens.json')?.fuso ?? 'Europe/Lisbon';

/**
 * UMA PARTIDA A SÉRIO, com o dia e a hora em que ela acontece.
 *
 * A folha de partidas responde «falta quanto tempo», e isso depende da hora a
 * que se pergunta: numa rede pequena as últimas partidas são ao fim da tarde,
 * e um teste que corra às 19h não tem partida nenhuma para medir. Em vez de
 * saltar meio dia, o teste PÕE O RELÓGIO onde há serviço — e isto diz-lhe
 * onde é: a paragem com mais partidas, o dia de mais serviço da região, e a
 * primeira partida dessa paragem num serviço que corra nesse dia.
 */
export function umaPartidaFutura(
  regiao = REGIAO,
): { paragem: Paragem; hora: string; quando: Date } | null {
  const p = paragemComMaisPartidas(regiao);
  const dia = diaComMaisServico(regiao);
  const grelha = ler<{ servicos: string[]; datas: Record<string, number[]> }>(
    regiao,
    'viagens.json',
  );
  const folha = ler<Record<string, { hora: string; servico_id: string }[]>>(
    regiao,
    `partidas/${p.concelho}.json`,
  );
  if (!dia || !grelha || !folha?.[p.id]) return null;

  const doDia = new Set((grelha.datas[dia.replace(/-/g, '')] ?? []).map((i) => grelha.servicos[i]));
  const partida = [...folha[p.id]]
    .filter((x) => doDia.has(x.servico_id))
    .sort((a, b) => a.hora.localeCompare(b.hora))[0];
  if (!partida) return null;

  // Cinco minutos antes dela, no fuso da região — que é o relógio de quem
  // está na paragem, e não o da máquina onde os testes correm.
  const [h, min] = partida.hora.split(':').map(Number);
  const alvo = new Date(`${dia}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`);
  alvo.setUTCMinutes(alvo.getUTCMinutes() - 5);
  const fuso = fusoDaRegiao(regiao);
  const comoLocal = new Date(alvo.toLocaleString('en-US', { timeZone: fuso }));
  const comoUtc = new Date(alvo.toLocaleString('en-US', { timeZone: 'UTC' }));
  return {
    paragem: p,
    hora: partida.hora,
    quando: new Date(alvo.getTime() - (comoLocal.getTime() - comoUtc.getTime())),
  };
}

/** O nome da região, como o sítio o escreve — para os títulos das páginas. */
export function nomeDaRegiao(regiao = REGIAO): string {
  return ler<{ nome: string }>(regiao, 'regiao.json')?.nome ?? regiao;
}

/**
 * Os modos que a região DECLARA — que não é o mesmo que os de `modos.json`.
 *
 * O `modos.json` tem os que têm página própria; a declaração tem os sete, a
 * rede de autocarros e o comboio incluídos, e é ela que a grelha «Por modo»
 * mostra. Confundir os dois dava um teste a exigir menos cartões do que a
 * página tem.
 */
export function modosDeclarados(regiao = REGIAO): string[] {
  const desligados = modulosDesligadosDoAmbiente()[regiao] ?? [];
  const todos = ler<{ modos: string[] }>(regiao, 'regiao.json')?.modos ?? [];
  return todos.filter((m) => !desligados.includes(m));
}

/**
 * As razões escritas. Um teste que salta tem de dizer PORQUÊ — senão, daqui a
 * um mês ninguém sabe se saltou por desenho ou por avaria.
 */
/**
 * Uma grelha de horário deste modo, com o que o resumo do `<details>` tem de
 * dizer: quantas viagens, de onde sai a primeira e a que horas.
 */
export function umQuadroDe(
  m: string,
  regiao = REGIAO,
): { linha: string; regras: string[]; viagens: number; paragem: string; hora: string } | null {
  for (const h of modo(m, regiao)?.horarios ?? []) {
    for (const q of h.quadros ?? []) {
      const primeira = q.viagens?.[0]?.passagens?.[0];
      if (primeira) {
        return {
          linha: h.nome,
          regras: h.regras ?? [],
          viagens: q.viagens.length,
          paragem: primeira[0],
          hora: primeira[1],
        };
      }
    }
  }
  return null;
}

/**
 * Uma linha deste modo cujas paragens não estão todas no mapa — é o caso que
 * obriga a página a nomear o que falta em vez de contar um número.
 */
export function horarioComParagensPorSituar(
  m: string,
  regiao = REGIAO,
): { linha: string; faltam: string[] } | null {
  const h = (modo(m, regiao)?.horarios ?? []).find((x) => (x.sem_coordenada ?? []).length > 0);
  return h ? { linha: h.nome, faltam: h.sem_coordenada } : null;
}

/**
 * Um concelho onde exista alguma coisa de outro modo — é o que a página do
 * concelho conta em «Outros modos aqui».
 */
export function concelhoComOutroModo(regiao = REGIAO): { concelho: string; modo: string } | null {
  const ids = new Set(concelhos(regiao).map((c) => c.id));
  for (const m of modosDisponiveis(regiao)) {
    if (['autocarro', 'comboio'].includes(m)) continue;
    const d = modo(m, regiao);
    const onde = [
      ...(d?.sistemas ?? []).flatMap((s) => s.estacoes.map((e) => e.concelho)),
      ...(d?.pontos ?? []).map((p) => p.concelho),
      ...(d?.paragens ?? []).map((p) => p.concelho),
    ];
    const c = onde.find((x): x is string => !!x && ids.has(x));
    if (c) return { concelho: c, modo: m };
  }
  return null;
}

export const SEM = {
  regiaoReal:
    'esta raiz não tem nenhuma região com dados reais (§11.6): o caso precisa de uma rede a sério',
  sitios: `a região ${REGIAO} não tem sítios do OpenStreetMap — só paragens`,
  aPedido: `a região ${REGIAO} não tem transporte a pedido levantado`,
  comboio: `a região ${REGIAO} não tem comboio`,
  modo: (m: string) => `a região ${REGIAO} não declara o modo ${m}`,
  lacunas: (m: string) =>
    `a região ${REGIAO} não declara lacunas em ${m} — e é a lacuna que desenha a secção`,
  mosaicos: `a região ${REGIAO} constrói-se sem recorte do OpenStreetMap: não tem mapa`,
};
