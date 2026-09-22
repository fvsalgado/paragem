import 'server-only';
import { chamar, temChaveDeServico } from './base';

/**
 * O limite de tentativas de entrada, com estado em Postgres
 * (`rate_limit_hit`, migração 0005).
 *
 * Sem chave de serviço deixa passar: em desenvolvimento e no CI é o que se
 * quer, e em produção a chave existe sempre. Um limitador em baixo também
 * deixa passar — regista-se e segue —, porque a alternativa é uma falha de
 * infraestrutura virar uma negação de serviço feita por nós.
 */

export interface Limite {
  permitido: boolean;
  tentativas: number;
  reposicaoEm: string | null;
}

type Linha = { allowed: boolean; hits: number; reset_at: string | null };

export async function verificarLimite(
  balde: string,
  janelaSegundos: number,
  limite: number,
): Promise<Limite> {
  if (!temChaveDeServico()) return { permitido: true, tentativas: 0, reposicaoEm: null };
  try {
    const resposta = await chamar<Linha[] | Linha>('rate_limit_hit', {
      p_bucket: balde,
      p_window_seconds: janelaSegundos,
      p_limit: limite,
    });
    const linha = Array.isArray(resposta) ? resposta[0] : resposta;
    return {
      permitido: linha?.allowed ?? true,
      tentativas: linha?.hits ?? 0,
      reposicaoEm: linha?.reset_at ?? null,
    };
  } catch (erro) {
    console.error('rate_limit_hit', erro);
    return { permitido: true, tentativas: 0, reposicaoEm: null };
  }
}
