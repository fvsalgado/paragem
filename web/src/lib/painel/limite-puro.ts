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
 * quer, e em produção a chave existe sempre.
 *
 * COM O LIMITADOR EM BAIXO, CONTA EM MEMÓRIA, como o Coreto
 * (`apps/web/src/lib/admin/limite-da-entrada.ts`). Deixava passar — «uma falha
 * de infraestrutura não pode virar uma negação de serviço feita por nós» —, e
 * isso queria dizer que a base em baixo era a porta do painel sem limite
 * nenhum. Fechar toda a gente seria a negação de serviço; contar na memória
 * de cada instância é o meio-termo: o limite fica mais largo (cada instância
 * conta as suas), mas existe, e ninguém que acerte na palavra-passe fica de
 * fora.
 */

/**
 * Como se está a contar: só as falhadas (0009), todas (antes dela), na
 * memória da instância (com a base em baixo), ou nada.
 */
export type ModoDoLimite = 'falhadas' | 'todas' | 'memoria' | 'sem-limite';

/** As falhadas de cada balde, por janela, nesta instância. */
const MEMORIA = new Map<string, { janela: number; falhas: number }>();

/** Só para os testes: o processo de testes partilha a memória entre casos. */
export function esquecerMemoriaDoLimite(): void {
  MEMORIA.clear();
}

const janelaDe = (agora: number, janelaSegundos: number) =>
  Math.floor(agora / (janelaSegundos * 1000));

function falhasNaMemoria(balde: string, janelaSegundos: number, agora: number): number {
  const contagem = MEMORIA.get(balde);
  return contagem && contagem.janela === janelaDe(agora, janelaSegundos) ? contagem.falhas : 0;
}

function naMemoria(
  baldes: string[],
  janelaSegundos: number,
  limite: number,
  agora: number,
): Limite {
  const cheio = baldes.some((b) => falhasNaMemoria(b, janelaSegundos, agora) >= limite);
  const repoe = new Date(
    (janelaDe(agora, janelaSegundos) + 1) * janelaSegundos * 1000,
  ).toISOString();
  return { permitido: !cheio, modo: 'memoria', repoeEm: cheio ? repoe : null };
}

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
  agora: number = Date.now(),
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
      return naMemoria(baldes, janelaSegundos, limite, agora);
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
    return naMemoria(baldes, janelaSegundos, limite, agora);
  }
}

/** Uma tentativa falhada conta em todos os baldes — só no modo novo; no antigo já contou. */
export async function contarFalhada(
  chamar: Chamar | null,
  baldes: string[],
  modo: ModoDoLimite,
  janelaSegundos: number,
  limite: number,
  agora: number = Date.now(),
): Promise<void> {
  if (modo === 'memoria') {
    const janela = janelaDe(agora, janelaSegundos);
    for (const b of baldes) {
      const contagem = MEMORIA.get(b);
      MEMORIA.set(b, {
        janela,
        falhas: contagem && contagem.janela === janela ? contagem.falhas + 1 : 1,
      });
    }
    return;
  }
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
  if (modo === 'memoria') {
    for (const b of baldes) MEMORIA.delete(b);
    return;
  }
  if (!chamar || modo !== 'falhadas') return;
  try {
    await Promise.all(baldes.map((b) => chamar('rate_limit_clear', { p_bucket: b })));
  } catch (erro) {
    console.error('rate_limit_clear', erro);
  }
}
