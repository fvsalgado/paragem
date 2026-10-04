import { ehEsquemaPorAplicar } from './base-pura.ts';

/** Quem fala com a base: `chamar` de `base.ts`, ou um a fingir nos testes. */
export type Chamar = <T>(funcao: string, argumentos: Record<string, unknown>) => Promise<T>;

/**
 * O limite de tentativas de entrada, com estado em Postgres — a lógica, sem a
 * base (`limite.ts` liga-a à base a sério; os testes, a uma a fingir).
 *
 * CONTA SÓ AS FALHADAS (0009), por origem E por email. Contava todas, certas
 * incluídas, e só por origem: cinco entradas bem feitas num quarto de hora —
 * uma formação, uma equipa atrás do mesmo encaminhador — trancavam toda a
 * gente. Agora pergunta-se antes de conferir a palavra-passe
 * (`rate_limit_check`, que não conta), conta-se só a que falhou
 * (`rate_limit_hit`), e uma entrada certa limpa o seu balde
 * (`rate_limit_clear`).
 *
 * ANTES DE A 0009 CHEGAR À BASE, faz o que fazia: as duas funções novas não
 * existem, e conta-se cada tentativa no balde da origem com a `rate_limit_hit`
 * de sempre. É o comportamento de hoje, nem mais nem menos — e é o que deixa o
 * sítio novo ir para o ar antes da migração.
 *
 * Sem chave de serviço deixa passar: em desenvolvimento e no CI é o que se
 * quer, e em produção a chave existe sempre. Um limitador em baixo também
 * deixa passar — regista-se e segue —, porque a alternativa é uma falha de
 * infraestrutura virar uma negação de serviço feita por nós.
 */

/** Como se está a contar: só as falhadas (0009), todas (antes dela), ou nada. */
export type ModoDoLimite = 'falhadas' | 'todas' | 'sem-limite';

export interface Limite {
  permitido: boolean;
  modo: ModoDoLimite;
  /**
   * Quando se pode voltar a tentar, se a resposta for não: o fim da janela do
   * balde cheio que fecha mais tarde. Sem ele, a entrada diz «daqui a um quarto
   * de hora»; com ele, diz a hora — que é o que quem está do outro lado precisa
   * de saber.
   */
  repoeEm: string | null;
}

type Linha = { allowed: boolean; hits: number; reset_at: string | null };

const primeira = (r: Linha[] | Linha): Linha | undefined => (Array.isArray(r) ? r[0] : r);

/** O instante mais tarde de uma lista, saltando os vazios e os que não são instantes. */
function maisTarde(instantes: (string | null)[]): string | null {
  let melhor: string | null = null;
  for (const instante of instantes) {
    if (!instante || Number.isNaN(Date.parse(instante))) continue;
    if (!melhor || Date.parse(instante) > Date.parse(melhor)) melhor = instante;
  }
  return melhor;
}

/**
 * Pode tentar-se mais uma vez? `baldes[0]` é o da origem — o único que existia
 * antes da 0009, e por isso o único que o modo antigo conta.
 */
export async function verificarEntrada(
  chamar: Chamar | null,
  baldes: string[],
  janelaSegundos: number,
  limite: number,
): Promise<Limite> {
  if (!chamar || baldes.length === 0) return { permitido: true, modo: 'sem-limite', repoeEm: null };
  try {
    const respostas = await Promise.all(
      baldes.map((b) =>
        chamar<Linha[] | Linha>('rate_limit_check', {
          p_bucket: b,
          p_window_seconds: janelaSegundos,
          p_limit: limite,
        }),
      ),
    );
    const cheios = respostas.map(primeira).filter((r) => r && !r.allowed);
    return {
      permitido: cheios.length === 0,
      modo: 'falhadas',
      repoeEm: maisTarde(cheios.map((r) => r?.reset_at ?? null)),
    };
  } catch (erro) {
    if (!ehEsquemaPorAplicar(erro)) {
      console.error('rate_limit_check', erro);
      return { permitido: true, modo: 'sem-limite', repoeEm: null };
    }
  }
  // A 0009 ainda não está na base: o limite de antes, que conta tudo.
  try {
    const r = await chamar<Linha[] | Linha>('rate_limit_hit', {
      p_bucket: baldes[0],
      p_window_seconds: janelaSegundos,
      p_limit: limite,
    });
    const linha = primeira(r);
    const permitido = linha?.allowed ?? true;
    return { permitido, modo: 'todas', repoeEm: permitido ? null : (linha?.reset_at ?? null) };
  } catch (erro) {
    console.error('rate_limit_hit', erro);
    return { permitido: true, modo: 'sem-limite', repoeEm: null };
  }
}

/** Uma tentativa falhada conta em todos os baldes — só no modo novo; no antigo já contou. */
export async function contarFalhada(
  chamar: Chamar | null,
  baldes: string[],
  modo: ModoDoLimite,
  janelaSegundos: number,
  limite: number,
): Promise<void> {
  if (!chamar || modo !== 'falhadas') return;
  try {
    await Promise.all(
      baldes.map((b) =>
        chamar('rate_limit_hit', {
          p_bucket: b,
          p_window_seconds: janelaSegundos,
          p_limit: limite,
        }),
      ),
    );
  } catch (erro) {
    console.error('rate_limit_hit', erro);
  }
}

/** Uma entrada certa esquece as falhadas da origem e do email com que entrou. */
export async function limparDepoisDeEntrar(
  chamar: Chamar | null,
  baldes: string[],
  modo: ModoDoLimite,
): Promise<void> {
  if (!chamar || modo !== 'falhadas') return;
  try {
    await Promise.all(baldes.map((b) => chamar('rate_limit_clear', { p_bucket: b })));
  } catch (erro) {
    console.error('rate_limit_clear', erro);
  }
}
