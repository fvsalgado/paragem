/**
 * O estado de uma licença, numa frase.
 *
 * Uma região é um contrato com a sua autoridade de transportes, com prazo
 * (migração 0004). O alarme acende a 30 dias do fim — tempo de renovar sem
 * correr — e fica aceso depois dele; expirar nunca desliga nada sozinho, o
 * corte é o interruptor da região. A frase aparece no painel de entrada e na
 * ficha, e é uma só para não divergir. Levantado do Coreto (`admin/fields.ts`).
 */

export interface LicencaResumo {
  starts_on: string;
  ends_on: string | null;
  kind: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** `2026-09-22` → `22/09/2026`. */
export function dataPorExtenso(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

/**
 * As licenças vêm por ordem decrescente de início — a mais recente manda no
 * estado. `hoje` é `AAAA-MM-DD`.
 */
export function estadoDaLicenca(
  licencas: readonly LicencaResumo[],
  hoje: string,
): { texto: string; alerta: boolean } {
  const atual = licencas[0];
  if (!atual) return { texto: 'Sem licença registada.', alerta: false };
  if (atual.ends_on === null) {
    return {
      texto: `Licença «${atual.kind}» sem prazo, desde ${dataPorExtenso(atual.starts_on)}.`,
      alerta: false,
    };
  }
  const dias = Math.round((Date.parse(atual.ends_on) - Date.parse(hoje)) / DIA_MS);
  if (dias < 0) {
    return {
      texto: `Licença «${atual.kind}» expirada desde ${dataPorExtenso(atual.ends_on)}.`,
      alerta: true,
    };
  }
  return {
    texto:
      `Licença «${atual.kind}» até ${dataPorExtenso(atual.ends_on)} — ` +
      (dias === 0 ? 'acaba hoje.' : dias === 1 ? 'falta um dia.' : `faltam ${dias} dias.`),
    alerta: dias <= 30,
  };
}
