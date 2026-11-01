import { lacunas, regiao as lerRegiao, servicosSemDatas } from '@/lib/dados';
import { dataDosHorarios, fraseDosHorarios, frasesDosFeeds } from '@/lib/formato';

/**
 * A frase que impede alguém de confundir isto com tempo real.
 *
 * O §4.4 manda dizer o que não se sabe. Aqui o que não se sabe é grande: os
 * horários são os planeados, não os que estão a acontecer, e uma parte dos
 * serviços ainda não tem sequer os dias em que corre.
 *
 * E DIZ DE QUANDO SÃO, quando as fontes o dizem: «Horários planeados · dados
 * de 3/9/2026». A data é a dos modos desta página (`modos`) — a de uma
 * paragem de autocarro não é a dos comboios —, e falta quando alguma fonte
 * deles não a tem (`dataDosHorarios`). Sem `modos`, os da região.
 */
export default async function MarcaDeDados({
  regiao,
  modos,
  feeds = [],
  detalhe = false,
}: {
  regiao: string;
  modos?: readonly string[];
  /**
   * Os feeds das partidas desta página (`feedsDosServicos`). De cada um diz-se
   * desde quando valem os horários, e até quando vão quando acabam antes dos
   * outros (`frasesDosFeeds`).
   */
  feeds?: readonly string[];
  detalhe?: boolean;
}) {
  const [l, r] = await Promise.all([lacunas(regiao), lerRegiao(regiao)]);
  const semDatas = servicosSemDatas(l);
  const dosFeeds = frasesDosFeeds(r, feeds);
  return (
    <p className="marca-dados" role="note">
      {fraseDosHorarios(dataDosHorarios(r, modos))}
      {dosFeeds.length > 0 ? ` ${dosFeeds.join(' ')}` : null}
      {detalhe && semDatas > 0
        ? ` ${semDatas} serviços ainda não têm os dias em que circulam.`
        : null}
    </p>
  );
}
