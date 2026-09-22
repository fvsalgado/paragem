import { revalidateTag } from 'next/cache';
import {
  ETIQUETA_DAS_REGIOES,
  IDENTIFICADOR,
  etiquetaDaRegiao,
  regioesDisponiveis,
} from '@/lib/dados';

/**
 * O sinal de que os dados mudaram.
 *
 * As páginas são servidas da cache, com uma etiqueta por região. O pipeline
 * chama aqui no fim de `uv run pipeline publicar`, com a região que acabou de
 * subir, e as páginas dela são deitadas fora — a próxima visita rende-as com
 * os dados novos. Sem este sinal continuavam válidas até o prazo de uma hora
 * passar: não é uma avaria, é só mais lento.
 *
 * Levantado do Coreto (`app/api/revalidate/route.ts`), com uma diferença: lá
 * invalidam-se etiquetas por tipo de conteúdo; aqui por região, que é a
 * unidade de publicação do pipeline. Um corpo sem regiões invalida as que se
 * conhecem — e a lista delas, que é a etiqueta da página de produto.
 *
 * A comparação do segredo é em tempo constante, byte a byte, sem sair mais
 * cedo: um `===` sobre cadeias diz, pelo tempo que demora, em que posição o
 * palpite falhou.
 */

export const dynamic = 'force-dynamic';

function naoAutorizado(): Response {
  return Response.json({ erro: 'não autorizado' }, { status: 401 });
}

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function POST(pedido: Request): Promise<Response> {
  const segredo = process.env.REVALIDATE_SECRET ?? '';
  if (segredo.length < 16) {
    return Response.json({ erro: 'REVALIDATE_SECRET não configurado' }, { status: 503 });
  }
  const cabecalho = pedido.headers.get('authorization') ?? '';
  const chave = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  if (!iguais(chave, segredo)) return naoAutorizado();

  let corpo: unknown = {};
  try {
    corpo = await pedido.json();
  } catch {
    // Sem corpo, ou corpo que não é JSON: vale «tudo».
  }
  const pedidas = (corpo as { regioes?: unknown }).regioes;
  if (pedidas !== undefined && !Array.isArray(pedidas)) {
    return Response.json({ erro: '`regioes` tem de ser uma lista' }, { status: 400 });
  }
  const lista = (pedidas as unknown[] | undefined)?.map(String) ?? [];
  if (lista.length > 30 || lista.some((r) => !IDENTIFICADOR.test(r))) {
    return Response.json({ erro: 'identificador de região inválido' }, { status: 400 });
  }

  const regioes = lista.length ? lista : await regioesDisponiveis();
  const etiquetas = new Set<string>([ETIQUETA_DAS_REGIOES, ...regioes.map(etiquetaDaRegiao)]);
  for (const etiqueta of etiquetas) revalidateTag(etiqueta);

  return Response.json({ revalidated: [...etiquetas], at: new Date().toISOString() });
}
