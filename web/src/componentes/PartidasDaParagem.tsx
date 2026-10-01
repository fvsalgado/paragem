'use client';

import { useEffect, useMemo, useState } from 'react';
import ASeguir from '@/componentes/ASeguir';
import QuadrosPorDia, { type QuadroDoDia } from '@/componentes/QuadrosPorDia';
import { expandir, type PartidasCompactas } from '@/lib/formato';
import { calendarioDe, horaDoRelogio, proximas, type Calendario } from '@/lib/dias';

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
  const lista = useMemo(() => expandir(partidas), [partidas]);

  // A tabela dos dias: `undefined` enquanto se pergunta, `null` quando não se
  // conseguiu saber (`lib/dias.ts`) — e não é o mesmo que «hoje não há nada».
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);

  // O RELÓGIO DE QUEM LÊ, e a andar: «12 min» que fica parado deixa de ser
  // verdade ao fim de um minuto, e a página fica aberta na paragem.
  const [instante, setInstante] = useState<Date | null>(null);
  useEffect(() => {
    setInstante(new Date());
    const t = setInterval(() => setInstante(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const pronto = instante !== null && calendario !== undefined;
  const agora = instante ? horaDoRelogio(instante) : '';
  const resultado = pronto ? proximas(lista, instante, agora, calendario, 6) : null;

  return (
    <>
      <section aria-labelledby="a-seguir" className="a-seguir">
        {resultado && instante ? (
          <ASeguir
            resultado={resultado}
            instante={instante}
            agora={agora}
            cores={cores}
            Titulo="h2"
            id="a-seguir"
          />
        ) : (
          <>
            <h2 id="a-seguir">A seguir</h2>
            <p className="secundario" aria-live="polite">
              A ver o que passa a seguir…
            </p>
            <noscript>
              <p>
                O que passa a seguir calcula-se com a hora do teu aparelho, e isso precisa de
                JavaScript. O horário completo está abaixo.
              </p>
            </noscript>
          </>
        )}
      </section>

      <section aria-labelledby="horario">
        <h2 id="horario">Horário completo</h2>
        <QuadrosPorDia regiao={regiao} quadros={quadros} />
      </section>
    </>
  );
}
