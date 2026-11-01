/**
 * «QUE TÍTULO ME SERVE?» — com o que o tarifário da região declara, e mais nada.
 *
 * O tarifário era uma tabela de preços, e a pergunta que mais chega aos
 * balcões ficava sem resposta. Mas a resposta não se inventa: não se sabe,
 * dos dados, que linhas cobre uma assinatura, nem quem tem direito a um passe
 * jovem. O que se sabe é o que cada título É — paga-se a cada uso, vale por
 * um período, ou não se paga — e o que custa. Com isso arruma-se a escolha, e
 * faz-se a única conta que os preços permitem: quantos títulos de cada uso se
 * compram pelo preço de um título de período. A conclusão fica para quem lê.
 */
import type { Titulo } from './formato';

export type TituloComConta = Titulo & {
  /** Pelo preço deste título compram-se `vezes` títulos `de` — só nos de período. */
  equivale?: { vezes: number; de: Titulo };
};

export type AjudaDeUmaRede = {
  rede: string;
  /** Paga-se a cada uso: bilhetes, tarifas de acesso. */
  aCadaUso: Titulo[];
  /** Vale por um período: passes, assinaturas. */
  porPeriodo: TituloComConta[];
  /** Não se paga — com as condições que a fonte escreve. */
  semPagar: Titulo[];
};

const POR_PERIODO: Record<string, string> = {
  dia: 'por dia',
  semana: 'por semana',
  mes: 'por mês',
  ano: 'por ano',
};

/** «por mês», «por ano» — ou nada, para um período que a página não conhece. */
export const porPeriodo = (periodo?: string): string =>
  periodo ? (POR_PERIODO[periodo] ?? '') : '';

export function ajudaParaEscolher(titulos: Titulo[]): AjudaDeUmaRede[] {
  const redes: string[] = [];
  for (const t of titulos) if (!redes.includes(t.rede)) redes.push(t.rede);
  return redes
    .map((rede) => {
      const daRede = titulos.filter((t) => t.rede === rede && typeof t.valor === 'number');
      const aCadaUso = daRede.filter((t) => t.valor! > 0 && !t.periodo);
      // A referência é o título de cada uso MAIS CARO da rede: é o preço
      // inteiro, e não um desconto que nem toda a gente tem.
      const referencia = aCadaUso.reduce<Titulo | null>(
        (m, t) => (!m || t.valor! > m.valor! ? t : m),
        null,
      );
      const porPeriodo = daRede
        .filter((t) => t.valor! > 0 && !!t.periodo)
        .map((t): TituloComConta => {
          const vezes = referencia ? Math.floor(t.valor! / referencia.valor!) : 0;
          return vezes >= 2 ? { ...t, equivale: { vezes, de: referencia! } } : t;
        });
      const semPagar = daRede.filter((t) => t.valor === 0);
      return { rede, aCadaUso, porPeriodo, semPagar };
    })
    .filter((r) => r.aCadaUso.length + r.porPeriodo.length + r.semPagar.length > 0);
}

// --- quando é que um passe compensa -----------------------------------------
//
// O tarifário punha cada preço duas vezes — na ajuda e na tabela — e não
// respondia à pergunta que faz alguém abrir esta página: «com as viagens que
// faço, compensa o passe?». A conta é só dos preços: um título de período
// custa X por mês; cada viagem, Y com o bilhete que se pagaria. Passa a
// compensar à viagem em que X fica abaixo de N × Y. Que linhas o passe cobre,
// ou quem tem direito a ele, não está nos dados, e a página di-lo.

/** Quanto custa por mês um título de período; `null` num período que não se converte. */
export function porMes(t: Pick<Titulo, 'valor' | 'periodo'>): number | null {
  if (typeof t.valor !== 'number') return null;
  if (t.periodo === 'mes') return t.valor;
  if (t.periodo === 'ano') return t.valor / 12;
  if (t.periodo === 'semana') return (t.valor * 52) / 12;
  return null;
}

/** A partir de quantas viagens por mês o título de período sai mais barato do que pagar cada uma. */
export function compensaAPartirDe(mensal: number, porViagem: number): number | null {
  if (!(porViagem > 0) || !(mensal >= 0)) return null;
  return Math.floor(mensal / porViagem) + 1;
}

/** Uma rede, com o que o escolhedor precisa — só números e nomes, para ir para o navegador. */
export type EscolhaDeUmaRede = {
  rede: string;
  /** Os títulos de cada uso, do mais caro (o preço inteiro) ao mais barato. */
  bilhetes: { id: string; nome: string; valor: number }[];
  /** Os de período que se convertem num preço por mês. */
  periodos: { id: string; nome: string; valor: number; periodo: string; mensal: number }[];
  /** Os que não se pagam, com a condição que a fonte escreve. */
  semPagar: { id: string; nome: string; nota?: string }[];
};

/**
 * As redes em que há conta a fazer: as que têm um título de cada uso e um de
 * período. As outras ficam só na tabela — sem bilhete não há com que
 * comparar.
 */
export function escolhasDoTarifario(titulos: Titulo[]): EscolhaDeUmaRede[] {
  return ajudaParaEscolher(titulos)
    .map((a) => ({
      rede: a.rede,
      bilhetes: [...a.aCadaUso]
        .sort((x, y) => y.valor! - x.valor!)
        .map((t) => ({ id: t.id, nome: t.nome, valor: t.valor! })),
      periodos: a.porPeriodo.flatMap((t) => {
        const mensal = porMes(t);
        return mensal === null
          ? []
          : [{ id: t.id, nome: t.nome, valor: t.valor!, periodo: t.periodo!, mensal }];
      }),
      semPagar: a.semPagar.map((t) => ({ id: t.id, nome: t.nome, nota: t.nota })),
    }))
    .filter((e) => e.bilhetes.length > 0 && e.periodos.length > 0);
}

// --- os dois preços da página inicial ----------------------------------------

/**
 * OS DOIS PREÇOS QUE SE PERGUNTAM PRIMEIRO, para a página inicial (auditoria
 * de 1/11/2026, #90): o bilhete de cada viagem e o passe mais largo, da rede
 * da região — «Bilhete simples 1,50 € · Passe de rede 40,00 € por mês». A
 * folha do mapa não dizia quanto custa andar de autocarro, que é a primeira
 * pergunta de quem decide.
 *
 * As mesmas regras da ajuda do tarifário (`ajudaParaEscolher`): o de cada uso
 * é o mais caro, que é o preço inteiro e não um desconto; o de período é o
 * mais caro, que é o que cobre mais. SÓ OS CONFIRMADOS: um preço por
 * confirmar fica no tarifário, que o marca, e não na primeira página. Vazio
 * quando a rede não tem nenhum dos dois.
 *
 * `rede` é o nome da rede da região (`regiao.rede.nome`); sem ela, ou sem
 * títulos dela, a primeira rede do tarifário.
 */
export function precosDaAbertura(
  titulos: Titulo[],
  rede: string | null | undefined,
): { nome: string; valor: number; periodo?: string }[] {
  const confirmados = titulos.filter((t) => t.confirmado);
  const ajuda = ajudaParaEscolher(confirmados);
  const daRede = ajuda.find((a) => a.rede === rede) ?? ajuda[0];
  if (!daRede) return [];
  const maisCaro = <T extends Titulo>(ts: T[]): T | null =>
    ts.reduce<T | null>((m, t) => (!m || t.valor! > m.valor! ? t : m), null);
  return [maisCaro(daRede.aCadaUso), maisCaro(daRede.porPeriodo)]
    .filter((t): t is Titulo => !!t)
    .map((t) => ({ nome: t.nome, valor: t.valor!, ...(t.periodo ? { periodo: t.periodo } : {}) }));
}
