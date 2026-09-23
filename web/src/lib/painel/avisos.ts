import 'server-only';
import { ler } from './base';
import type { Aviso } from '../avisos';

/**
 * As leituras dos avisos PELO PAINEL — com a chave de serviço, e por isso com
 * os rascunhos também.
 *
 * O sítio lê a mesma tabela com a chave pública (`lib/avisos.ts`), e a policy
 * `avisos_public_read` só lhe deixa ver o que está publicado. É a mesma
 * tabela e são duas vistas: quem redige vê o que ainda não mostrou; quem
 * viaja vê o que a autoridade decidiu mostrar.
 */

export type { Aviso };

/** Todos os de uma região, publicados e rascunhos, do mais recente ao mais antigo. */
export async function avisosDaRegiao(regiao: string): Promise<Aviso[]> {
  return ler<Aviso>(
    'avisos',
    `select=*&region_id=eq.${encodeURIComponent(regiao)}&order=created_at.desc`,
  );
}

/** Um só, para o formulário de edição. `null` quando não há. */
export async function avisoPorId(id: string): Promise<Aviso | null> {
  const linhas = await ler<Aviso>('avisos', `select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return linhas[0] ?? null;
}

/** Quantos estão publicados em cada região — para a lista do painel. */
export async function contarAvisosPublicados(): Promise<Map<string, number>> {
  const linhas = await ler<{ region_id: string }>(
    'avisos',
    'select=region_id&publicado=eq.true&limit=1000',
  );
  const conta = new Map<string, number>();
  for (const l of linhas) conta.set(l.region_id, (conta.get(l.region_id) ?? 0) + 1);
  return conta;
}
