'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ASeguir from '@/componentes/ASeguir';
import { expandir, type PartidasCompactas } from '@/lib/formato';
import {
  calendarioDe,
  chaveDoDia,
  horaDoRelogio,
  proximas,
  servicosNoDia,
  type Calendario,
} from '@/lib/dias';

/** Um quadro do horário completo: um tipo de dia, e a tabela dele já desenhada. */
export type QuadroDoDia = {
  chave: string;
  nome: string;
  /** Os serviços deste quadro, pela chave da tabela dos dias. */
  servicos: string[];
  quantas: number;
  /** A tabela, desenhada no servidor: aqui só se decide se está aberta. */
  conteudo: ReactNode;
};

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
 *    valem HOJE abertos e marcados «hoje».
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
  const deHoje = pronto && calendario ? servicosNoDia(calendario, chaveDoDia(instante)) : null;
  const valeHoje = (q: QuadroDoDia) => !!deHoje && q.servicos.some((s) => deHoje.has(s));

  // OS QUADROS DE HOJE ABREM-SE UMA VEZ, quando se sabe que dia é. Depois
  // disso mandam as mãos de quem lê: fechar um não o volta a abrir daqui a
  // trinta segundos, quando o relógio anda.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [jaAbriu, setJaAbriu] = useState(false);
  useEffect(() => {
    if (!pronto || jaAbriu) return;
    setAbertos(new Set(quadros.filter(valeHoje).map((q) => q.chave)));
    setJaAbriu(true);
    // `valeHoje` muda com o relógio; o que interessa é a primeira vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, jaAbriu, quadros]);

  const algumHoje = quadros.some(valeHoje);

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
        <p className="secundario">
          {quadros.length === 1
            ? 'Um quadro, com todas as partidas desta paragem.'
            : `Um quadro por tipo de dia${algumHoje ? '; os que valem hoje estão abertos e marcados' : ''}. Toca num para o abrir.`}
        </p>
        {quadros.map((q) => {
          const hoje = valeHoje(q);
          return (
            <details
              key={q.chave}
              className={`quadro-do-dia${hoje ? ' de-hoje' : ''}`}
              open={abertos.has(q.chave)}
              onToggle={(e) => {
                const aberto = e.currentTarget.open;
                setAbertos((antes) => {
                  if (antes.has(q.chave) === aberto) return antes;
                  const depois = new Set(antes);
                  if (aberto) depois.add(q.chave);
                  else depois.delete(q.chave);
                  return depois;
                });
              }}
            >
              <summary>
                <span className="nome-do-quadro">{q.nome}</span>
                {hoje && (
                  <span className="hoje">
                    <span className="so-para-leitores">, vale </span>hoje
                  </span>
                )}
                <span className="quantas">
                  <span className="so-para-leitores">, </span>
                  {q.quantas} {q.quantas === 1 ? 'partida' : 'partidas'}
                </span>
              </summary>
              {q.conteudo}
            </details>
          );
        })}
      </section>
    </>
  );
}
