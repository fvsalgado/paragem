/**
 * Os endereços dos serviços de cada região, lidos NO SERVIDOR.
 *
 * Um motor de viagens por região, um serviço de disponibilidade por região,
 * um de expressos por região. Os endereços vêm do ambiente — é a regra do
 * §4.7 do briefing, a mesma do domínio — e cada região tem o seu.
 *
 * **PORQUE É QUE ISTO VIVE NO SERVIDOR.** O Next.js só substitui
 * `process.env.NEXT_PUBLIC_*` no código do navegador quando o nome está
 * escrito por extenso; uma chave calculada não é substituída. Enquanto a
 * leitura era do lado do navegador, isso obrigava a um mapa literal — e um
 * mapa literal obriga a escrever o identificador de cada cliente no código do
 * produto, que é precisamente o que o §11.1 proíbe.
 *
 * Do lado do servidor a chave calcula-se, e uma região nova entra com uma
 * variável de ambiente e zero linhas de código. O valor segue para o
 * navegador como propriedade, que é como ele já recebe tudo o resto.
 *
 * Aceitam-se os dois nomes: `PARAGEM_OTP_<REGIAO>` (o certo, porque isto lê-se
 * no servidor) e `NEXT_PUBLIC_PARAGEM_OTP_<REGIAO>` (o de antes, para não
 * obrigar ninguém a mexer no alojamento no dia em que isto mudou). Sem sufixo
 * serve quem aloja uma região só.
 */

import 'server-only';

/** `serra-da-pedra-alta` → `SERRA_DA_PEDRA_ALTA`: um nome de variável. */
export function sufixo(regiao: string): string {
  return String(regiao || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function primeiro(...nomes: string[]): string {
  for (const n of nomes) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}

/**
 * O endereço de um serviço para uma região, ou '' se não estiver configurado.
 *
 * '' e não um endereço inventado: quando não está configurado, a página diz
 * isso. Dizer «não há viagem» quando o que há é um motor desligado é mentir a
 * quem está à espera do autocarro.
 */
export function enderecoDoServico(
  servico: 'OTP' | 'DISPONIBILIDADE' | 'EXPRESSOS',
  regiao: string,
): string {
  const s = sufixo(regiao);
  return primeiro(
    `PARAGEM_${servico}_${s}`,
    `NEXT_PUBLIC_PARAGEM_${servico}_${s}`,
    `PARAGEM_${servico}`,
    `NEXT_PUBLIC_PARAGEM_${servico}`,
  );
}

export const motorDaRegiao = (regiao: string): string => enderecoDoServico('OTP', regiao);
export const disponibilidadeDaRegiao = (regiao: string): string =>
  enderecoDoServico('DISPONIBILIDADE', regiao);
export const expressosDaRegiao = (regiao: string): string => enderecoDoServico('EXPRESSOS', regiao);
