import 'server-only';
import { ehEsquemaPorAplicar, ler } from './base';
import type { Contactos } from '../contactos';

/**
 * Os contactos de uma região, PELO PAINEL — com a chave de serviço, também
 * os de uma região desligada (que o sítio não mostra, mas que se preparam
 * antes de a ligar).
 *
 * `'por-aplicar'` quando a base ainda não tem a migração 0010: a ficha diz
 * que esta instalação ainda não guarda contactos, em vez de rebentar — o
 * sítio novo tem de funcionar antes de a migração chegar à produção.
 */
export async function contactosDoPainel(regiao: string): Promise<Contactos | null | 'por-aplicar'> {
  try {
    const linhas = await ler<Contactos>(
      'region_contactos',
      `select=*&region_id=eq.${encodeURIComponent(regiao)}&limit=1`,
    );
    return linhas[0] ?? null;
  } catch (erro) {
    if (ehEsquemaPorAplicar(erro)) return 'por-aplicar';
    throw erro;
  }
}
