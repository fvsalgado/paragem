import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Endereços IP nunca se guardam em claro.
 *
 * O que se guarda é um hash com sal — chega para travar abuso (a mesma origem
 * produz sempre o mesmo balde) e para a auditoria dizer «foi da mesma
 * origem», e não permite reconstruir o endereço. É o mínimo que o RGPD pede e
 * o máximo de que se precisa. Sem `IP_HASH_SALT` vale um sal escrito aqui —
 * e um sal escrito num repositório é um endereço com um passo a mais, por
 * isso a variável existe em produção (`docs/ALOJAMENTO.md`).
 */
export function hashDoIp(cabecalhos: Headers): string {
  const cabecalho = cabecalhos.get('x-forwarded-for') ?? cabecalhos.get('x-real-ip') ?? '';
  const ip = cabecalho.split(',')[0]?.trim() || 'desconhecido';
  const sal = process.env.IP_HASH_SALT || 'paragem-sem-sal-configurado';
  return createHash('sha256').update(`${sal}|${ip}`).digest('hex').slice(0, 32);
}
