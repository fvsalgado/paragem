import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * A palavra-passe do painel: como se guarda, e como se confere.
 *
 * O painel não tem contas nem registo: tem UMA palavra-passe, e dela o
 * servidor só conhece um hash com sal — `scrypt$N$r$p$sal$hash`, produzido
 * por `scripts/senha.mjs` e posto em `ADMIN_PASSWORD_HASH`. Este ficheiro é
 * o único sítio onde o formato se escreve e se lê.
 *
 * Separado do token de sessão de propósito: isto usa o scrypt do Node e só
 * corre no servidor, enquanto a verificação do token tem de correr também no
 * middleware, em edge. Levantado do Coreto (`admin/password.ts` e
 * `scripts/hash-password.ts`).
 */

/**
 * Os parâmetros do scrypt para produção.
 *
 * N = 2^15 com r = 8 pede 32 MiB de memória por verificação: muito acima do
 * que uma placa gráfica paraleliza em condições, e irrelevante para um
 * servidor que faz isto uma vez por entrada. `maxmem` tem de ser dado à mão —
 * o valor por omissão do Node fica exatamente no limite destes parâmetros.
 */
export const CUSTO = 32_768;
export const BLOCO = 8;
export const PARALELISMO = 1;
const COMPRIMENTO_DA_CHAVE = 64;
const COMPRIMENTO_DO_SAL = 16;

/** O mínimo. Isto guarda o interruptor de todas as regiões. */
export const COMPRIMENTO_MINIMO = 12;

function memoriaMaxima(custo: number, bloco: number): number {
  return 128 * custo * bloco * 2;
}

/**
 * Codifica uma palavra-passe. Cada chamada dá um valor diferente para a mesma
 * palavra-passe — o sal é novo de cada vez, e é isso que se pretende. Os
 * parâmetros só se baixam nos testes, onde 32 MiB por verificação tornariam a
 * suíte lenta sem provar mais nada sobre o formato.
 */
export function codificarSenha(senha: string, custo = CUSTO, bloco = BLOCO): string {
  const sal = randomBytes(COMPRIMENTO_DO_SAL);
  const derivada = scryptSync(senha, sal, COMPRIMENTO_DA_CHAVE, {
    N: custo,
    r: bloco,
    p: PARALELISMO,
    maxmem: memoriaMaxima(custo, bloco),
  });
  return [
    'scrypt',
    custo,
    bloco,
    PARALELISMO,
    sal.toString('base64'),
    derivada.toString('base64'),
  ].join('$');
}

/**
 * Compara uma palavra-passe com o hash guardado.
 *
 * Um hash mal formado é tratado como «não confere», e mais nada. Deixar a
 * exceção subir daria uma resposta diferente para configuração inválida e
 * para palavra-passe errada — e isso conta a quem tenta em qual dos dois
 * casos está. Quem configura descobre pelo registo do servidor.
 */
export function verificarSenha(senha: string, codificada: string): boolean {
  const partes = codificada.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') {
    console.error('ADMIN_PASSWORD_HASH mal formado: não tem a forma scrypt$N$r$p$sal$hash');
    return false;
  }
  const [, custo, bloco, paralelismo, sal, esperado] = partes as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  try {
    const esperadoBytes = Buffer.from(esperado, 'base64');
    const derivada = scryptSync(senha, Buffer.from(sal, 'base64'), esperadoBytes.length, {
      N: Number(custo),
      r: Number(bloco),
      p: Number(paralelismo),
      maxmem: memoriaMaxima(Number(custo), Number(bloco)),
    });
    return derivada.length === esperadoBytes.length && timingSafeEqual(derivada, esperadoBytes);
  } catch (erro) {
    console.error('verificarSenha', erro);
    return false;
  }
}
