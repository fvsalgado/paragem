import { feriadoEmBreve, fraseDoFeriadoMunicipal, type FeriadoMunicipal } from '@/lib/formato';
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
}: {
  feriado: FeriadoMunicipal | null | undefined;
  emBreve?: boolean;
}) {
  if (emBreve && !feriadoEmBreve(feriado, diaNoFuso(new Date()))) return null;
  const frase = fraseDoFeriadoMunicipal(feriado);
  if (!frase) return null;
  return (
    <div className="faixa informacao" role="note">
      <p>
        <strong>{frase.titulo}</strong> {frase.texto}
      </p>
    </div>
  );
}
