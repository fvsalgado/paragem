/**
 * Horas de parede num fuso declarado.
 *
 * O PROBLEMA, medido e não imaginado: o painel escreve «a greve começa às 8h»
 * num campo `datetime-local`, que não leva fuso nenhum — é hora de parede. A
 * base guarda `timestamptz`, que é um instante. Traduzir de um para o outro
 * precisa de saber EM QUE FUSO são essas 8h, e nenhuma das respostas fáceis
 * serve:
 *
 *   · o fuso do SERVIDOR é UTC na plataforma onde isto corre. Um aviso das 8h
 *     ficaria guardado como 8h UTC, e apareceria às 9h no verão — sem erro
 *     nenhum, sem aviso nenhum, até alguém perder o autocarro;
 *   · o fuso do NAVEGADOR de quem escreve muda com quem escreve. O gestor a
 *     fazer o turno de fora do país punha o aviso na hora dele.
 *
 * Por isso é DECLARADO, como o subdomínio da região (`CLAUDE.md` §11.7): uma
 * variável de ambiente, com a hora de Portugal continental por omissão, que é
 * onde este produto se usa. Uma instalação noutro sítio muda-a; nenhuma tem
 * de a adivinhar.
 *
 * Sem biblioteca: o `Intl` do próprio motor sabe as regras de mudança de hora
 * de cada fuso, e sabe-as atualizadas. Uma tabela nossa envelhecia.
 */

export const FUSO = process.env.PARAGEM_FUSO || 'Europe/Lisbon';

const PARTES = {
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
} as const;

/** Quanto é que o fuso está à frente de UTC NESTE instante, em milissegundos. */
function desvio(instante: Date, fuso: string): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: fuso, ...PARTES })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const comoSeFosseUTC = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    // `hour12: false` dá 24 à meia-noite em alguns motores; 24 % 24 = 0.
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );
  return comoSeFosseUTC - instante.getTime();
}

const CAMPO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * O que um `datetime-local` deu → o instante, em ISO com fuso.
 *
 * Duas passagens, e a segunda não é supersticiosa: à primeira usa-se o desvio
 * do instante errado, e nas madrugadas em que o relógio muda isso dá uma hora
 * de diferença. A segunda corrige-a.
 */
export function doCampoLocal(valor: string, fuso: string = FUSO): string | null {
  const t = valor.trim();
  if (!t) return null;
  const m = CAMPO.exec(t);
  if (!m) throw new Error(`não se lê a data «${valor}»`);
  const [, Y, M, D, h, min] = m.map(Number) as unknown as number[];

  // A FORMA NÃO CHEGA. «2026-13-45T99:99» tem os dígitos todos no sítio, e o
  // `Date.UTC` não se queixa: rola para a frente e devolve uma data de 2027.
  // O campo do formulário nunca produz isto; uma ação de servidor recebe o
  // que lhe mandarem. Confirma-se que o que saiu é o que entrou — o que
  // apanha tanto o mês 13 como o 30 de fevereiro.
  const parede = Date.UTC(Y!, M! - 1, D!, h!, min!);
  const v = new Date(parede);
  if (
    v.getUTCFullYear() !== Y ||
    v.getUTCMonth() !== M! - 1 ||
    v.getUTCDate() !== D ||
    v.getUTCHours() !== h ||
    v.getUTCMinutes() !== min
  ) {
    throw new Error(`não se lê a data «${valor}»`);
  }
  let ms = parede;
  for (let i = 0; i < 2; i++) ms = parede - desvio(new Date(ms), fuso);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) throw new Error(`não se lê a data «${valor}»`);
  return d.toISOString();
}

/** O instante → o que um `datetime-local` precisa de receber. */
export function paraCampoLocal(iso: string | null | undefined, fuso: string = FUSO): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: fuso, ...PARTES })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}

/** Um instante por extenso, no fuso da casa: «23 de setembro de 2026, 08:00». */
export function porExtenso(iso: string | null | undefined, fuso: string = FUSO): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-PT', {
    timeZone: fuso,
    dateStyle: 'long',
    timeStyle: 'short',
  });
}
