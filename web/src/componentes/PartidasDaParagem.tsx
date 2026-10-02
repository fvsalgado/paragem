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
 * **Porque é que o «A seguir» corre no navegador.** É a única coisa na
 * página que depende da hora de quem lê, e a página é servida da cache: no
 * servidor, a «hora atual» seria a da última vez que a página se fez. Até o
 * navegador fazer as contas, o lugar das partidas está guardado, e o horário
 * inteiro já lá está, com os quadros de hoje abertos pelo servidor — que é o
 * que fica a quem não tem JavaScript.
 *
 * **Num ecrã largo, lado a lado** (P1-014): o horário à esquerda, e o «A
 * seguir» à direita, preso ao alto enquanto se desce pelos quadros. No
 * telemóvel, um a seguir ao outro, pela ordem das perguntas.
 */
export default function PartidasDaParagem({
  regiao,
  partidas,
  cores,
  quadros,
  quadrosDeHoje = null,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  quadros: QuadroDoDia[];
  /** Os quadros que valiam hoje quando a página se fez — ver `QuadrosPorDia`. */
  quadrosDeHoje?: { hoje: string; abertos: string[] } | null;
}) {
  return (
    <div className="em-colunas partidas-e-horario">
      <section aria-labelledby="a-seguir" className="a-seguir coluna-lateral">
        <ProximasPartidas
          regiao={regiao}
          partidas={partidas}
          cores={cores}
          Titulo="h2"
          id="a-seguir"
        />
      </section>

      <section aria-labelledby="horario" className="coluna-principal">
        <h2 id="horario">Horário completo</h2>
        <QuadrosPorDia regiao={regiao} quadros={quadros} noServidor={quadrosDeHoje} />
      </section>
    </div>
  );
}
