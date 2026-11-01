/**
 * O PRAZO DA RESERVA DE UM TRANSPORTE A PEDIDO, para um dia concreto.
 *
 * O planeador dizia o prazo genérico tal e qual — «Só passa se for reservado:
 * até às 15h do dia útil anterior» — e punha «Ligar» como botão principal.
 * Num domingo à noite, para segunda-feira, o prazo tinha fechado na sexta às
 * 15h, e o ecrã convidava a ligar (auditoria de 1/11/2026, #121). Aqui faz-se
 * a conta para o dia escolhido.
 *
 * DE ONDE VEM A REGRA. A estrutura é a da regra de reserva do GTFS-Flex que o
 * pipeline escreve (`reservas.gtfs`, a de omissão): quantos dias antes, e até
 * que hora. Se esses dias são ÚTEIS não está lá — está na frase que a região
 * declara («do dia útil anterior»), e só nesse caso se faz a conta: contar dias
 * de calendário onde a regra é de dias úteis dava um prazo mais tarde do que o
 * verdadeiro, e era dizer a alguém que ainda pode reservar quando já não pode.
 *
 * E OS FERIADOS NÃO ESTÃO NOS DADOS DO SÍTIO. Um feriado só pode ANTECIPAR o
 * prazo, nunca atrasá-lo. Por isso «já fechou» é sempre verdade; «até sexta»
 * pode ser cedo de mais se sexta for feriado, e a frase diz isso.
 */
import { chaveDoDia, chaveMais, diaCurto, diaDaSemana, horaDoRelogio } from './dias.ts';

/** A regra de reserva como o pipeline a escreve, na parte que interessa aqui. */
export type RegraDeReserva = {
  por_omissao?: boolean;
  ultimo_dia?: number;
  ultima_hora?: string;
};

export type PrazoDaReserva = {
  /** O dia da viagem, `AAAAMMDD`. */
  dia: string;
  /** O último dia para reservar, `AAAAMMDD`. */
  fecho: string;
  /** A hora do fecho, `HH:MM`. */
  hora: string;
  fechou: boolean;
};

const ehDiaUtil = (chave: string) => {
  const d = new Date(Date.UTC(+chave.slice(0, 4), +chave.slice(4, 6) - 1, +chave.slice(6, 8)));
  const s = d.getUTCDay();
  return s >= 1 && s <= 5;
};

/**
 * O prazo para viajar em `dia` (`AAAA-MM-DD` ou `AAAAMMDD`), ou `null` quando
 * os dados não chegam para o calcular com verdade: sem regra estruturada, sem
 * hora, ou com uma frase de prazo que não fala em dias úteis.
 */
export function prazoDaReserva(
  dia: string,
  regras: readonly RegraDeReserva[] | undefined,
  frase: string | undefined,
  agora: Date,
): PrazoDaReserva | null {
  const regra = regras?.find((r) => r.por_omissao) ?? regras?.[0];
  const dias = regra?.ultimo_dia;
  const hora = regra?.ultima_hora;
  if (!regra || !dias || dias < 1 || !hora || !/^\d{2}:\d{2}$/.test(hora)) return null;
  if (!frase || !/dia útil|dias úteis/i.test(frase)) return null;
  const chave = dia.replace(/-/g, '');
  if (!/^\d{8}$/.test(chave)) return null;
  let fecho = chave;
  for (let contados = 0; contados < dias; ) {
    fecho = chaveMais(fecho, -1);
    if (ehDiaUtil(fecho)) contados++;
  }
  const hoje = chaveDoDia(agora);
  const fechou = hoje > fecho || (hoje === fecho && horaDoRelogio(agora) >= hora);
  return { dia: chave, fecho, hora, fechou };
}

/** «15h», «17h30». */
export const horaDoPrazo = (hora: string): string => {
  const [h, m] = hora.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
};

/**
 * A frase, à vista: «Para segunda-feira, 2/11, a reserva já fechou: o prazo
 * era sexta-feira, 30/10, às 15h.», ou «Para quinta-feira, 5/11, reserve até
 * quarta-feira, 4/11, às 15h — ou antes, se esse dia for feriado.»
 */
export function fraseDoPrazo(p: PrazoDaReserva, hoje: string): string {
  const quando = (c: string) => `${diaDaSemana(c)}, ${diaCurto(c, hoje)}`;
  return p.fechou
    ? `Para ${quando(p.dia)}, a reserva já fechou: o prazo era ${quando(p.fecho)}, às ${horaDoPrazo(p.hora)}.`
    : `Para ${quando(p.dia)}, reserve até ${quando(p.fecho)}, às ${horaDoPrazo(p.hora)} — ou antes, se esse dia for feriado.`;
}
