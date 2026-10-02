/**
 * O relatório das procuras sem resposta (P4-030), na parte que não precisa de
 * rede: as consultas que se mandam à medição, e o que se lê da resposta.
 *
 * A medição é o PostHog do sítio (`docs/MEDICAO.md`): o planeador conta cada
 * `viagem_sem_resposta`, com a ligação pedida — «Covas do Vento → Porto
 * Ameno» —, o dia e a hora, e nunca quem a pediu. O painel pergunta-lhe pela
 * API de consultas (HogQL), agregado por ligação: o que sai daqui são nomes
 * públicos de paragens e contagens, e nada que identifique alguém.
 *
 * Puro, para se testar sem a medição: as consultas são texto, e a resposta é
 * um JSON com `results` em linhas.
 */

/** Uma ligação pedida e sem resposta, quantas vezes, e a última. */
export type ProcuraSemResposta = { ligacao: string; vezes: number; ultima: string | null };

/** Uma cadeia em HogQL, com as aspas e as barras escapadas. */
export function literal(texto: string): string {
  return `'${texto.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * QUE EVENTOS SÃO DESTA REGIÃO: os que levam o identificador dela (desde que
 * o planeador o manda), e os que vieram dos domínios dela — o principal e os
 * que levam a ele —, que é como se sabia antes. Só um dos dois não chegava: o
 * domínio muda quando a região muda de endereço, e os eventos antigos não têm
 * o identificador.
 */
export function daRegiao(regiao: string, dominios: readonly string[]): string {
  const condicoes = [`properties.regiao = ${literal(regiao)}`];
  if (dominios.length) {
    condicoes.push(`properties.$host IN (${dominios.map(literal).join(', ')})`);
  }
  return `(${condicoes.join(' OR ')})`;
}

export function consultaDasProcuras(
  regiao: string,
  dominios: readonly string[],
  dias = 90,
  limite = 50,
): string {
  return [
    'SELECT properties.ligacao AS ligacao, count() AS vezes, max(timestamp) AS ultima',
    'FROM events',
    "WHERE event = 'viagem_sem_resposta'",
    `  AND timestamp > now() - INTERVAL ${Math.trunc(dias)} DAY`,
    `  AND ${daRegiao(regiao, dominios)}`,
    'GROUP BY ligacao',
    'ORDER BY vezes DESC, ultima DESC',
    `LIMIT ${Math.trunc(limite)}`,
  ].join('\n');
}

export function consultaDosTotais(regiao: string, dominios: readonly string[], dias = 90): string {
  return [
    "SELECT countIf(event = 'viagem_procurada') AS procuradas,",
    "       countIf(event = 'viagem_sem_resposta') AS sem_resposta",
    'FROM events',
    "WHERE event IN ('viagem_procurada', 'viagem_sem_resposta')",
    `  AND timestamp > now() - INTERVAL ${Math.trunc(dias)} DAY`,
    `  AND ${daRegiao(regiao, dominios)}`,
  ].join('\n');
}

/** As linhas da resposta, com o que não se lê deixado de fora — nunca inventado. */
export function lerProcuras(resposta: unknown): ProcuraSemResposta[] {
  const linhas = (resposta as { results?: unknown })?.results;
  if (!Array.isArray(linhas)) return [];
  return linhas
    .filter((l): l is unknown[] => Array.isArray(l) && typeof l[0] === 'string' && l[0] !== '')
    .map((l) => ({
      ligacao: l[0] as string,
      vezes: Number(l[1]) || 0,
      ultima: typeof l[2] === 'string' ? l[2] : null,
    }))
    .filter((p) => p.vezes > 0);
}

export function lerTotais(resposta: unknown): { procuradas: number; semResposta: number } | null {
  const linha = (resposta as { results?: unknown[][] })?.results?.[0];
  if (!Array.isArray(linha)) return null;
  return { procuradas: Number(linha[0]) || 0, semResposta: Number(linha[1]) || 0 };
}

/**
 * O que falta para o painel poder perguntar à medição: os nomes das variáveis,
 * para quem gere a instalação. Vazio quando não falta nada.
 */
export function oQueFalta(ambiente: Record<string, string | undefined>): string[] {
  return ['POSTHOG_CHAVE_PESSOAL', 'POSTHOG_PROJETO'].filter((v) => !ambiente[v]);
}
