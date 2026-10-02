/**
 * Os avisos: o que a autoridade de transportes tem a dizer hoje.
 *
 * Isto é a única leitura do sítio que NÃO vem do armazém. Os horários são
 * construídos pelo pipeline e publicados por ficheiro; um aviso não pode
 * esperar por uma publicação. Uma greve marcada para amanhã de manhã, um
 * desvio que começa daqui a uma hora — quem escreve isso no painel tem de o
 * ver no sítio a seguir, não à próxima construção.
 *
 * Lê-se com a CHAVE PÚBLICA, e a policy `avisos_public_read` só deixa ver o
 * que está publicado (migração 0007): um rascunho não existe para quem
 * pergunta daqui. A chave de serviço fica onde estava — no painel, e só lá.
 *
 * O PÚBLICO DEGRADA, como em todo o resto: se a base não responder, a página
 * de avisos mostra que não conseguiu ler, e não «não há avisos». As duas
 * frases dizem coisas opostas a quem está à espera do autocarro.
 */
import { cache } from 'react';
import { IDENTIFICADOR } from './formato.ts';
import { porExtenso } from './fuso.ts';
import type { Causa, Efeito, Gravidade } from './gtfs-rt';

/** Uma linha de `public.avisos`, tal como o PostgREST a devolve. */
export type Aviso = {
  id: string;
  region_id: string;
  titulo: string;
  texto: string;
  gravidade: string;
  causa: string;
  efeito: string;
  inicio: string | null;
  fim: string | null;
  linhas: string[];
  paragens: string[];
  modos: string[];
  url: string | null;
  publicado: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

/**
 * Os rótulos em português, para o painel e para o sítio.
 *
 * O tipo é `Record<Gravidade, string>` e não `Record<string, string>`: um
 * valor novo no GTFS-RT que entre em `gtfs-rt.ts` e não entre aqui não
 * compila. Era o género de divergência que ninguém vê — o feed leva o número
 * certo e a página mostra o nome em inglês.
 */
export const GRAVIDADES: Record<Gravidade, string> = {
  UNKNOWN_SEVERITY: 'sem gravidade declarada',
  INFO: 'informação',
  WARNING: 'aviso',
  SEVERE: 'grave',
};

export const CAUSAS: Record<Causa, string> = {
  UNKNOWN_CAUSE: 'causa não declarada',
  OTHER_CAUSE: 'outra causa',
  TECHNICAL_PROBLEM: 'avaria',
  STRIKE: 'greve',
  DEMONSTRATION: 'manifestação',
  ACCIDENT: 'acidente',
  HOLIDAY: 'feriado',
  WEATHER: 'meteorologia',
  MAINTENANCE: 'manutenção',
  CONSTRUCTION: 'obra',
  POLICE_ACTIVITY: 'ação policial',
  MEDICAL_EMERGENCY: 'emergência médica',
};

export const EFEITOS: Record<Efeito, string> = {
  NO_SERVICE: 'sem serviço',
  REDUCED_SERVICE: 'serviço reduzido',
  SIGNIFICANT_DELAYS: 'atrasos significativos',
  DETOUR: 'desvio',
  ADDITIONAL_SERVICE: 'serviço reforçado',
  MODIFIED_SERVICE: 'serviço alterado',
  OTHER_EFFECT: 'outro efeito',
  UNKNOWN_EFFECT: 'efeito não declarado',
  STOP_MOVED: 'paragem mudada de sítio',
  NO_EFFECT: 'sem efeito no serviço',
  ACCESSIBILITY_ISSUE: 'problema de acessibilidade',
};

/** O rótulo, ou o próprio valor quando for um que não conhecemos. */
export const nomeDaGravidade = (v: string): string => GRAVIDADES[v as Gravidade] ?? v;
export const nomeDaCausa = (v: string): string => CAUSAS[v as Causa] ?? v;
export const nomeDoEfeito = (v: string): string => EFEITOS[v as Efeito] ?? v;

/**
 * Em vigor agora: já começou e ainda não acabou.
 *
 * Sem início quer dizer «já está a acontecer» e sem fim quer dizer «não se
 * sabe quando acaba» — é o `active_period` do GTFS-RT, e é o caso mais
 * honesto numa avaria. Um aviso publicado com prazo que já passou fica na
 * base, para o rasto, e sai daqui.
 */
export function emVigor(a: Pick<Aviso, 'inicio' | 'fim'>, agora: Date = new Date()): boolean {
  const t = agora.getTime();
  if (a.inicio && Date.parse(a.inicio) > t) return false;
  if (a.fim && Date.parse(a.fim) < t) return false;
  return true;
}

/**
 * Quando é que o aviso vale, por extenso — NO FUSO DA REGIÃO, e não no do
 * servidor.
 *
 * O painel já escrevia e mostrava as horas no fuso declarado (`lib/fuso.ts`);
 * a página pública formatava-as com o `toLocaleString` sem fuso, que no
 * servidor é UTC. No verão, o aviso que o técnico marcou para as 7h saía às
 * 6h — informação errada em nome da autoridade, e no aviso, que é a única
 * coisa que ela escreve à mão e em cima da hora.
 *
 * SEM FIM NÃO SE INVENTA UM: é o que a operadora sabe, e é isso que se diz.
 * «Até às 18h» num aviso que ninguém datou é uma promessa. E sem início nem
 * fim não se diz nada — o aviso está a acontecer, e é tudo o que se sabe.
 */
export function prazoDoAviso(a: Pick<Aviso, 'inicio' | 'fim'>, fuso?: string): string {
  const desde = a.inicio ? ` · desde ${porExtenso(a.inicio, fuso)}` : '';
  const ate = a.fim ? ` até ${porExtenso(a.fim, fuso)}` : a.inicio ? ', sem fim previsto' : '';
  return desde + ate;
}

/** Os graves primeiro; dentro da mesma gravidade, o que começou há menos tempo. */
const PESO: Record<string, number> = { SEVERE: 0, WARNING: 1, INFO: 2, UNKNOWN_SEVERITY: 3 };

export function ordenar(avisos: Aviso[]): Aviso[] {
  return [...avisos].sort((a, b) => {
    const p = (PESO[a.gravidade] ?? 9) - (PESO[b.gravidade] ?? 9);
    if (p !== 0) return p;
    return (b.inicio ?? b.created_at).localeCompare(a.inicio ?? a.created_at);
  });
}

/** A etiqueta de cache dos avisos de uma região: é o que publicar invalida. */
export const etiquetaDosAvisos = (r: string): string => `avisos:${r}`;

/**
 * Sessenta segundos, e uma etiqueta.
 *
 * NÃO É `no-store`, e a razão é concreta: a faixa de avisos aparece no
 * catálogo, que é uma página servida da cache com milhares de linhas. Uma
 * leitura sem cache lá dentro arrastava a página inteira para renderização
 * por pedido — pagar o catálogo todo por duas linhas de uma tabela pequena.
 *
 * O que torna os sessenta segundos aceitáveis é que quase nunca são
 * esperados: publicar um aviso no painel invalida esta etiqueta, e a página
 * rende-se de novo à visita seguinte. O minuto é o que sobra para o caso de
 * o sinal se perder — o mesmo desenho das regiões e dos módulos.
 *
 * O QUE ISTO CUSTA, escrito para quem vier medir: uma página que mostre a
 * faixa passa a revalidar-se ao minuto em vez de à hora, porque o Next toma o
 * prazo mais curto de todas as leituras que ela faz. Os DADOS dela continuam
 * guardados por uma hora com as etiquetas que já tinham; o que se repete ao
 * minuto é render HTML a partir deles, e só quando alguém pede a página.
 */
const VALIDADE_S = 60;

/**
 * `null` quando NÃO SE SABE — sem base configurada, ou com a base a não
 * responder — e uma lista (que pode ser vazia) quando se sabe. Quem mostra
 * isto trata as duas de maneira diferente, e é essa a razão de o tipo não ser
 * só `Aviso[]`.
 */
export async function lerAvisosNaBase(
  regiao: string,
  buscar: typeof fetch = fetch,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Promise<Aviso[] | null> {
  if (!url || !chave || !IDENTIFICADOR.test(regiao)) return null;
  try {
    const res = await buscar(
      `${url.replace(/\/+$/, '')}/rest/v1/avisos` +
        `?select=*&region_id=eq.${encodeURIComponent(regiao)}&order=inicio.desc.nullslast`,
      {
        headers: { apikey: chave, accept: 'application/json' },
        next: { revalidate: VALIDADE_S, tags: [etiquetaDosAvisos(regiao)] },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as Aviso[];
  } catch {
    return null;
  }
}

/** Os avisos em vigor de uma região, uma leitura por pedido. */
export const avisosEmVigor = cache(async (regiao: string): Promise<Aviso[] | null> => {
  const todos = await lerAvisosNaBase(regiao);
  if (todos === null) return null;
  return ordenar(todos.filter((a) => emVigor(a)));
});

// --- onde um aviso aparece (P4-019, P2-025, P1-045) ------------------------
//
// Um aviso publicado só aparecia na página «Avisos» e na faixa de «A rede»: não
// no mapa, onde se procura e se planeia, nem na página da linha desviada, nem
// na das paragens dela. Quem abria a linha 1 para ver a hora não sabia que ela
// estava desviada — e quem o publicou achava que a ferramenta não funcionava.
// Estas funções dizem a que páginas cada aviso pertence, e são as mesmas que
// a pré-visualização do painel usa para dizer «aparece também em…».

/** Sem linhas, paragens nem modos: a rede toda — o que o GTFS-RT manda, e é raro. */
export function redeToda(a: Pick<Aviso, 'linhas' | 'paragens' | 'modos'>): boolean {
  return a.linhas.length === 0 && a.paragens.length === 0 && a.modos.length === 0;
}

/** Só modos, sem linhas nem paragens: todo o serviço desses modos. */
function soModos(a: Pick<Aviso, 'linhas' | 'paragens' | 'modos'>): boolean {
  return a.linhas.length === 0 && a.paragens.length === 0 && a.modos.length > 0;
}

/**
 * O aviso diz respeito a esta LINHA: nomeia-a, nomeia uma paragem dela, é do
 * modo dela sem nomear linhas nem paragens, ou é da rede toda.
 */
export function aplicaALinha(
  a: Pick<Aviso, 'linhas' | 'paragens' | 'modos'>,
  linha: { id: string; modo: string; paragens: readonly string[] },
): boolean {
  if (redeToda(a)) return true;
  if (a.linhas.includes(linha.id)) return true;
  if (a.paragens.some((p) => linha.paragens.includes(p))) return true;
  return soModos(a) && a.modos.includes(linha.modo);
}

/**
 * O aviso diz respeito a esta PARAGEM: nomeia-a, nomeia uma linha que lá
 * passa, é de um modo que lá para sem nomear linhas nem paragens, ou é da
 * rede toda.
 */
export function aplicaAParagem(
  a: Pick<Aviso, 'linhas' | 'paragens' | 'modos'>,
  paragem: { id: string; linhas: readonly string[]; modos: readonly string[] },
): boolean {
  if (redeToda(a)) return true;
  if (a.paragens.includes(paragem.id)) return true;
  if (a.linhas.some((l) => paragem.linhas.includes(l))) return true;
  return soModos(a) && a.modos.some((m) => paragem.modos.includes(m));
}

/**
 * O EFEITO E A CAUSA SÓ SE DIZEM QUANDO FORAM DECLARADOS (P4-018). O público via
 * «causa não declarada · outro efeito» — os valores por omissão do formulário,
 * que são ruído com ar de dado. «Não se sabe» e «outro» não dizem nada a quem
 * está na paragem; a especificação precisa deles, a página não.
 */
export function efeitoDeclarado(efeito: string): boolean {
  return efeito !== 'UNKNOWN_EFFECT' && efeito !== 'OTHER_EFFECT' && efeito in EFEITOS;
}
export function causaDeclarada(causa: string): boolean {
  return causa !== 'UNKNOWN_CAUSE' && causa !== 'OTHER_CAUSE' && causa in CAUSAS;
}

/**
 * Quando é que vale, numa frase que se lê sozinha: «Desde 1 de outubro de
 * 2026, 07:00, sem fim previsto», «Até 1 de dezembro de 2026, 18:00». Vazio
 * quando não tem prazo nenhum — está a acontecer, e é tudo o que se sabe.
 */
export function quandoVale(a: Pick<Aviso, 'inicio' | 'fim'>, fuso?: string): string {
  if (a.inicio && a.fim) return `De ${porExtenso(a.inicio, fuso)} até ${porExtenso(a.fim, fuso)}`;
  if (a.inicio) return `Desde ${porExtenso(a.inicio, fuso)}, sem fim previsto`;
  if (a.fim) return `Até ${porExtenso(a.fim, fuso)}`;
  return '';
}

/**
 * Um aviso como vai para o MAPA, que corre no navegador: o mínimo para dizer
 * que existe, a que diz respeito, e com que número de linha. O texto inteiro
 * fica na página de avisos, a uma ligação de distância.
 */
export type AvisoNoMapa = Pick<
  Aviso,
  'id' | 'titulo' | 'gravidade' | 'linhas' | 'paragens' | 'modos'
> & {
  distintivos: { id: string; codigo: string; cor: string | null; modo?: string }[];
};

/** Uma linha como a pré-visualização a conhece. */
export type LinhaDoAviso = { id: string; codigo: string; nome: string; cor: string | null };

/**
 * Onde é que este aviso vai aparecer, dito a quem o escreve — antes de o
 * publicar. Era o que faltava para se confiar na ferramenta: publicava-se, e
 * não se sabia onde procurar.
 *
 * São as mesmas regras que as páginas usam (`aplicaALinha`, `aplicaAParagem`):
 * o que isto diz é o que acontece, e não uma promessa escrita à parte.
 */
export function ondeAparece(
  a: Pick<Aviso, 'linhas' | 'paragens' | 'modos'>,
  catalogo: { linhas: ReadonlyMap<string, LinhaDoAviso>; paragens: ReadonlyMap<string, string> },
  nomeDoModo: (m: string) => string = (m) => m,
): string[] {
  const sitios = ['na página «Avisos»', 'na página inicial'];
  if (redeToda(a)) {
    sitios.push('nas páginas de todas as linhas e de todas as paragens, e nos cartões do mapa');
    return sitios;
  }
  const linhas = a.linhas.map((id) => catalogo.linhas.get(id)?.codigo ?? id);
  if (linhas.length) {
    sitios.push(`na página ${linhas.length === 1 ? 'da linha' : 'das linhas'} ${juntar(linhas)}`);
    sitios.push(
      `nas páginas das paragens ${linhas.length === 1 ? 'dela' : 'delas'} e nos cartões delas no mapa`,
    );
  }
  const paragens = a.paragens.map((id) => catalogo.paragens.get(id) ?? id);
  if (paragens.length) {
    sitios.push(
      `na página ${paragens.length === 1 ? 'da paragem' : 'das paragens'} ${juntar(paragens)}, no cartão do mapa e nas páginas das linhas que lá param`,
    );
  }
  if (soModos(a)) {
    sitios.push(
      `nas páginas e nos pontos do mapa de ${juntar(a.modos.map((m) => nomeDoModo(m).toLowerCase()))}`,
    );
  }
  return sitios;
}

function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
