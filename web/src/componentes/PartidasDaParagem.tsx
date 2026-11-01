'use client';

import type { ReactNode } from 'react';
import ProximasPartidas from '@/componentes/ProximasPartidas';
import PartidasDoDia from '@/componentes/PartidasDoDia';
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
 * Agora há três partes, pela ordem das perguntas:
 *
 * 1. **A seguir** — as próximas partidas de hoje, já filtradas pelos dias em
 *    que cada serviço anda, com «12 min» e a hora ao lado. É o MESMO cálculo
 *    do cartão do mapa (`ASeguir`, `proximas`) e a mesma tabela dos dias
 *    (`calendarioDe`): as duas respostas não se podem desencontrar.
 * 2. **Partidas do dia** — todas as de hoje, de amanhã ou de outro dia, numa
 *    lista só, pela hora (`PartidasDoDia`). Era preciso somar três quadros
 *    para saber o que passa numa segunda-feira (auditoria de 1/11/2026, #14).
 * 3. **Todos os quadros da operadora**, fechados — um por tipo de dia, como o
 *    horário impresso, e os que valem HOJE marcados «hoje» (`QuadrosPorDia`,
 *    o mesmo da página da linha).
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
  nomesDosServicos,
  doDiaNoServidor = null,
  caminhoDasLinhas,
  aoLado = null,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  quadros: QuadroDoDia[];
  /** Os quadros que valiam hoje quando a página se fez — ver `QuadrosPorDia`. */
  quadrosDeHoje?: { hoje: string; abertos: string[]; sabido?: boolean } | null;
  /** O nome de cada serviço, para a nota do período na lista do dia. */
  nomesDosServicos: Record<string, string>;
  /** O dia em que a página se fez e os serviços dele — ver `PartidasDoDia`. */
  doDiaNoServidor?: { hoje: string; servicos: string[] } | null;
  /** O princípio do endereço da página de uma linha. */
  caminhoDasLinhas: string;
  /** O que vai por baixo do «A seguir», na mesma coluna: as linhas que param aqui. */
  aoLado?: ReactNode;
}) {
  return (
    <div className="em-colunas partidas-e-horario">
      <div className="coluna-lateral">
        <section aria-labelledby="a-seguir" className="a-seguir">
          <ProximasPartidas
            regiao={regiao}
            partidas={partidas}
            cores={cores}
            Titulo="h2"
            id="a-seguir"
          />
        </section>
        {aoLado}
      </div>

      <section aria-labelledby="horario" className="coluna-principal">
        {/* AS PARTIDAS DE UM DIA, NUMA LISTA SÓ, e os quadros por baixo
            (auditoria de 1/11/2026, #14). Para saber o que passa numa
            segunda-feira era preciso abrir três quadros e juntá-los de
            cabeça. */}
        <h2 id="horario">Partidas do dia</h2>
        <PartidasDoDia
          regiao={regiao}
          partidas={partidas}
          cores={cores}
          nomesDosServicos={nomesDosServicos}
          noServidor={doDiaNoServidor}
          caminhoDasLinhas={caminhoDasLinhas}
        />
        <details className="lista-fechada todos-os-quadros">
          <summary>
            Todos os quadros da operadora <span className="secundario">({quadros.length})</span>
          </summary>
          <QuadrosPorDia
            regiao={regiao}
            quadros={quadros}
            noServidor={quadrosDeHoje}
            semHoje="não há partidas desta paragem"
          />
        </details>
      </section>
    </div>
  );
}
