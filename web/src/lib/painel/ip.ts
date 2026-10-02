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
function comSal(valor: string): string {
  const sal = process.env.IP_HASH_SALT || 'paragem-sem-sal-configurado';
  return createHash('sha256').update(`${sal}|${valor}`).digest('hex').slice(0, 32);
}

export function hashDoIp(cabecalhos: Headers): string {
  const cabecalho = cabecalhos.get('x-forwarded-for') ?? cabecalhos.get('x-real-ip') ?? '';
  const ip = cabecalho.split(',')[0]?.trim() || 'desconhecido';
  return comSal(ip);
}

/**
 * O email com que se TENTOU entrar, para o limite de tentativas por email
 * (0009). Também não se guarda em claro: o balde de uma tentativa falhada é
 * de alguém que pode nem ter conta, e o email dela não tem nada que ficar
 * numa tabela nossa.
 */
export function hashDoEmail(email: string): string {
  return comSal(`email|${email.trim().toLowerCase()}`);
}
