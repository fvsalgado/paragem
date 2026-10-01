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
