import 'server-only';
import { chamar, temChaveDeServico } from './base';
import * as puro from './limite-puro.ts';

/**
 * O limite de tentativas de entrada, ligado à base a sério. A regra — só as
 * falhadas, por origem e por email, e o modo de antes enquanto a 0009 não
 * chega — está em `limite-puro.ts`, onde se testa sem servidor.
 */

export type { Limite, ModoDoLimite } from './limite-puro.ts';

const comBase = (): puro.Chamar | null => (temChaveDeServico() ? chamar : null);

export const verificarEntrada = (baldes: string[], janelaSegundos: number, limite: number) =>
  puro.verificarEntrada(comBase(), baldes, janelaSegundos, limite);

export const contarFalhada = (
  baldes: string[],
  modo: puro.ModoDoLimite,
  janelaSegundos: number,
  limite: number,
) => puro.contarFalhada(comBase(), baldes, modo, janelaSegundos, limite);

export const limparDepoisDeEntrar = (baldes: string[], modo: puro.ModoDoLimite) =>
  puro.limparDepoisDeEntrar(comBase(), baldes, modo);
