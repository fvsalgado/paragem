'use client';

import ProximasPartidas from '@/componentes/ProximasPartidas';
import QuadrosPorDia, { type QuadroDoDia } from '@/componentes/QuadrosPorDia';
import type { PartidasCompactas } from '@/lib/formato';

/**
 * A PÁGINA DA PARAGEM COMEÇA PELO QUE PASSA A SEGUIR, e o horário vem depois.
 *
 * Abria com dez quadros e 122 linhas de tabela — 23 ecrãs na paragem mais
 * servida —, e quem queria saber o que passa agora tinha de descobrir que
 * quadro valia hoje (escolar? férias?) e descer até à hora. É a hierarquia ao
 * contrário: o pormenor antes da resposta.
 *
 * Agora há duas partes, pela ordem das perguntas:
 *
 * 1. **A seguir** — as próximas partidas de hoje, já filtradas pelos dias em
 *    que cada serviço anda, com «12 min» e a hora ao lado. É o MESMO cálculo
 *    do cartão do mapa (`ASeguir`, `proximas`) e a mesma tabela dos dias
 *    (`calendarioDe`): as duas respostas não se podem desencontrar.
 * 2. **Horário completo** — um quadro por tipo de dia, fechado, e os que
 *    valem HOJE abertos e marcados «hoje» (`QuadrosPorDia`, o mesmo da página
 *    da linha).
 *
 * **Porque é que isto corre no navegador.** É a única coisa na página que
 * depende da hora de quem lê, e a página é servida da cache: no servidor, a
 * «hora atual» seria a da última vez que a página se fez. Até o navegador
 * fazer as contas, a página tem o horário inteiro, com os quadros fechados —
 * que é o que fica a quem não tem JavaScript.
 */
export default function PartidasDaParagem({
  regiao,
  partidas,
  cores,
  quadros,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  quadros: QuadroDoDia[];
}) {
  return (
    <>
      <section aria-labelledby="a-seguir" className="a-seguir">
        <ProximasPartidas
          regiao={regiao}
          partidas={partidas}
          cores={cores}
          Titulo="h2"
          id="a-seguir"
        />
      </section>

      <section aria-labelledby="horario">
        <h2 id="horario">Horário completo</h2>
        <QuadrosPorDia regiao={regiao} quadros={quadros} />
      </section>
    </>
  );
}
