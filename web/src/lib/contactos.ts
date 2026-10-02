/**
 * Os contactos que a declaração de acessibilidade e a privacidade mostram
 * (P4-024): escreve-os quem gere a região, no painel; leem-se aqui com a chave
 * pública, como os avisos publicados (migração 0010).
 *
 * `null` quando não se sabe — sem base, sem a migração aplicada, sem linha —
 * e as páginas dizem «Por preencher», que é o que diziam antes de haver onde
 * os pôr. Um contacto inventado é pior do que nenhum: quem reclamar fica à
 * espera.
 */
import { IDENTIFICADOR } from './formato.ts';

export type Contactos = {
  region_id: string;
  acessibilidade_email: string | null;
  acessibilidade_telefone: string | null;
  reclamacao_url: string | null;
  responsavel: 'por-preencher' | 'autoridade' | 'outra';
  responsavel_nome: string | null;
  responsavel_artigo: '' | 'o' | 'a' | 'os' | 'as';
  privacidade_email: string | null;
  updated_at: string;
};

/** A etiqueta de cache dos contactos de uma região: é o que gravar no painel invalida. */
export const etiquetaDosContactos = (r: string): string => `contactos:${r}`;

/**
 * Uma hora, e a etiqueta: mudam poucas vezes por ano, e gravar no painel
 * invalida-a — a visita seguinte já os mostra.
 */
const VALIDADE_S = 3600;

export async function lerContactos(
  regiao: string,
  buscar: typeof fetch = fetch,
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): Promise<Contactos | null> {
  if (!url || !chave || !IDENTIFICADOR.test(regiao)) return null;
  try {
    const res = await buscar(
      `${url.replace(/\/+$/, '')}/rest/v1/region_contactos` +
        `?select=*&region_id=eq.${encodeURIComponent(regiao)}&limit=1`,
      {
        headers: { apikey: chave, accept: 'application/json' },
        next: { revalidate: VALIDADE_S, tags: [etiquetaDosContactos(regiao)] },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const linhas = (await res.json()) as Contactos[];
    return linhas[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Quem responde pelos dados, numa frase: «a Comunidade Intermunicipal da Serra
 * da Pedra Alta», «a Transportes do Vale, S.A.», «Fulano, Lda.».
 *
 * A AUTORIDADE LEVA O ARTIGO QUE A REGIÃO DECLARA (lote 1, `aAutoridade`), e
 * vem de fora já feita; outra entidade leva o artigo que se escolheu no
 * painel, e sem artigo vai sem nenhum — nunca se adivinha um. `null` quando
 * ainda não se declarou.
 */
export function responsavelNaFrase(
  c: Pick<Contactos, 'responsavel' | 'responsavel_nome' | 'responsavel_artigo'> | null,
  aAutoridade: string,
): string | null {
  if (!c) return null;
  if (c.responsavel === 'autoridade') return aAutoridade;
  if (c.responsavel === 'outra' && c.responsavel_nome) {
    return c.responsavel_artigo
      ? `${c.responsavel_artigo} ${c.responsavel_nome}`
      : c.responsavel_nome;
  }
  return null;
}

/** O telefone como se marca: sem espaços, para o `tel:`. */
export const telefoneParaMarcar = (t: string): string => t.replace(/[^0-9+]/g, '');
