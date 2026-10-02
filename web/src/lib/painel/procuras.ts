import 'server-only';
import {
  consultaDasProcuras,
  consultaDosTotais,
  lerProcuras,
  lerTotais,
  oQueFalta,
  type ProcuraSemResposta,
} from './procuras-puro';

export type RelatorioDasProcuras =
  | { estado: 'sem-ligacao'; falta: string[] }
  | { estado: 'erro'; mensagem: string }
  | {
      estado: 'ok';
      dias: number;
      procuras: ProcuraSemResposta[];
      totais: { procuradas: number; semResposta: number } | null;
    };

/** Uma hora: o relatório é de planeamento, e não de urgência. */
const VALIDADE_S = 3600;

/**
 * As procuras sem resposta de uma região, nos últimos `dias` (P4-030).
 *
 * PRECISA DE UMA CHAVE PESSOAL DA MEDIÇÃO, só de leitura: a chave do sítio
 * (`NEXT_PUBLIC_PARAGEM_POSTHOG`) só sabe ESCREVER eventos, e é pública — vai
 * no código de todas as páginas. Ler exige outra, que vive só no servidor
 * (`POSTHOG_CHAVE_PESSOAL`, com o âmbito `query:read`), e o número do projeto
 * (`POSTHOG_PROJETO`). Sem elas, o painel diz o que falta — não há serviço
 * novo nenhum, há duas variáveis.
 */
export async function relatorioDasProcuras(
  regiao: string,
  dominios: readonly string[],
  dias = 90,
  buscar: typeof fetch = fetch,
  ambiente: Record<string, string | undefined> = process.env,
): Promise<RelatorioDasProcuras> {
  const falta = oQueFalta(ambiente);
  if (falta.length) return { estado: 'sem-ligacao', falta };
  const api = (ambiente.POSTHOG_API || 'https://eu.posthog.com').replace(/\/+$/, '');
  const perguntar = async (consulta: string): Promise<unknown> => {
    const resposta = await buscar(
      `${api}/api/projects/${encodeURIComponent(ambiente.POSTHOG_PROJETO as string)}/query/`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ambiente.POSTHOG_CHAVE_PESSOAL}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: consulta } }),
        next: { revalidate: VALIDADE_S, tags: [`procuras:${regiao}`] },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resposta.ok) throw new Error(`a medição respondeu ${resposta.status}`);
    return resposta.json();
  };
  try {
    const [linhas, totais] = await Promise.all([
      perguntar(consultaDasProcuras(regiao, dominios, dias)),
      perguntar(consultaDosTotais(regiao, dominios, dias)),
    ]);
    return { estado: 'ok', dias, procuras: lerProcuras(linhas), totais: lerTotais(totais) };
  } catch (erro) {
    return {
      estado: 'erro',
      mensagem: erro instanceof Error ? erro.message : 'não foi possível perguntar à medição',
    };
  }
}
