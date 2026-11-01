import {
  diaDoFeriado,
  feriadoEmBreve,
  fraseDoFeriadoMunicipal,
  type FeriadoMunicipal,
} from '@/lib/formato';
import { diaNoFuso } from '@/lib/fuso';

/**
 * O feriado municipal do concelho, quando os horários desse dia podem não ser
 * os que a página mostra.
 *
 * Os horários de um feriado municipal saem como os de um dia normal enquanto
 * a região não souber o que muda (`feriados_municipais_nos_horarios`, no
 * calendário dela). Calar isso era o pior dos dois erros possíveis em silêncio:
 * quem abre a paragem na véspera lê um horário que ninguém confirmou para esse
 * dia.
 *
 * `emBreve` mostra-o só quando falta pouco — é o caso da paragem, onde a nota
 * todo o ano seria ruído. A página do concelho mostra-o sempre.
 */
export default function FeriadoMunicipalDoConcelho({
  feriado,
  emBreve = false,
  dias,
}: {
  feriado: FeriadoMunicipal | null | undefined;
  emBreve?: boolean;
  /** Com `emBreve`, quantos dias antes aparece (21 por omissão). */
  dias?: number;
}) {
  const hoje = diaNoFuso(new Date());
  if (emBreve && !feriadoEmBreve(feriado, hoje, dias)) return null;
  const frase = fraseDoFeriadoMunicipal(feriado, hoje);
  if (!frase) return null;
  return (
    <div className="faixa informacao" role="note">
      <p>
        <strong>{frase.titulo}</strong> {frase.texto}
      </p>
    </div>
  );
}

/**
 * O FERIADO NUMA LINHA, NO FIM DA PÁGINA DO CONCELHO, quando ainda falta muito
 * para ele. A página de um concelho abria com uma caixa de sete linhas sobre
 * um feriado a quatro meses, e empurrava o «Sair do concelho» para fora do
 * primeiro ecrã (auditoria de 1/11/2026). A caixa fica para quando ele está
 * perto (`emBreve`); fora disso, isto.
 */
export function FeriadoMunicipalNumaLinha({
  feriado,
  dias,
}: {
  feriado: FeriadoMunicipal | null | undefined;
  /** Os mesmos dias da caixa: dentro deles, é a caixa que o diz. */
  dias: number;
}) {
  const hoje = diaNoFuso(new Date());
  if (!feriado || feriadoEmBreve(feriado, hoje, dias)) return null;
  if (!fraseDoFeriadoMunicipal(feriado, hoje)) return null;
  return (
    <p className="secundario">
      Feriado municipal: {diaDoFeriado(feriado, hoje)}.
      {feriado.nos_horarios === 'por-confirmar'
        ? ' Os horários desse dia ainda não contam com ele.'
        : ''}
    </p>
  );
}
