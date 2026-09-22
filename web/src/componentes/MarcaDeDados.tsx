import { lacunas } from '@/lib/dados';

/**
 * A frase que impede alguém de confundir isto com tempo real.
 *
 * O §4.4 manda dizer o que não se sabe. Aqui o que não se sabe é grande: os
 * horários são os planeados, não os que estão a acontecer, e uma parte dos
 * serviços ainda não tem sequer os dias em que corre.
 */
export default async function MarcaDeDados({
  regiao,
  detalhe = false,
}: {
  regiao: string;
  detalhe?: boolean;
}) {
  const l = await lacunas(regiao);
  const semDatas = Number(l.contagens?.['calendario.servicos_sem_datas'] ?? 0);
  return (
    <p className="marca-dados" role="note">
      Horários planeados, não em tempo real.
      {detalhe && semDatas > 0
        ? ` ${semDatas} serviços ainda não têm os dias em que circulam.`
        : null}
    </p>
  );
}
