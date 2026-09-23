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
