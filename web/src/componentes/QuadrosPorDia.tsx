'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { calendarioDe, chaveDoDia, diaDaSemana, servicosNoDia, type Calendario } from '@/lib/dias';

/** Um quadro de horário de um tipo de dia, com o conteúdo já desenhado. */
export type QuadroDoDia = {
  chave: string;
  nome: string;
  /** Os serviços deste quadro, pela chave da tabela dos dias (`<feed>:<serviço>`). */
  servicos: string[];
  /** O que o resumo conta: «38 partidas», «11 viagens». */
  contagem: string;
  /** A tabela, desenhada no servidor: aqui só se decide se está aberta. */
  conteudo: ReactNode;
};

/**
 * UM QUADRO POR TIPO DE DIA, FECHADO — e os que valem HOJE abertos e marcados.
 *
 * É a forma do horário da paragem e do horário da linha, e está num sítio só
 * para os dois se lerem da mesma maneira. Desenrolados, os dez quadros de um
 * terminal eram 23 ecrãs, e nenhum dizia qual valia hoje (escolar? férias?):
 * quem lia tinha de o saber de cor.
 *
 * Que quadro vale hoje pergunta-se à MESMA tabela dos dias do «A seguir» e do
 * cartão do mapa (`calendarioDe`). Responde primeiro o servidor, com a dele, e
 * os de hoje já vêm abertos no HTML — também para quem não tem JavaScript.
 * Mas a página é servida da cache, e o «hoje» do servidor é o da última vez
 * que ela se fez: o navegador refaz a conta com o seu relógio, e só mexe se o
 * dia for outro. Sem a tabela no servidor, os quadros vêm fechados e abrem-se
 * quando o navegador souber.
 */
export default function QuadrosPorDia({
  regiao,
  quadros,
  noServidor = null,
  semHoje = 'nenhum destes quadros vale',
}: {
  regiao: string;
  quadros: QuadroDoDia[];
  /**
   * Os quadros que valiam hoje quando a página se fez (`quadrosDeHoje`), para
   * virem abertos e marcados JÁ NO HTML. Abriam-se quando o navegador acabava
   * as contas, e o horário saltava por baixo do dedo (P3-010). O navegador
   * refaz a conta com o seu relógio, e só mexe se o dia for outro.
   */
  noServidor?: { hoje: string; abertos: string[]; sabido?: boolean } | null;
  /**
   * O que se diz quando, HOJE, nenhum quadro vale: «esta linha não tem
   * viagens neste sentido», «não há partidas desta paragem». Só quando se
   * sabe — fora do período dos horários, não se diz nada.
   */
  semHoje?: string;
}) {
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);

  // O dia de hoje NA REGIÃO — e o dia vira à meia-noite de lá com a página aberta.
  const [hoje, setHoje] = useState<string | null>(null);
  useEffect(() => {
    const ver = () => setHoje(chaveDoDia(new Date()));
    ver();
    const t = setInterval(ver, 60_000);
    return () => clearInterval(t);
  }, []);

  const deHoje = calendario && hoje ? servicosNoDia(calendario, hoje) : null;
  // Antes de o navegador saber, vale o que o servidor sabia.
  const valeHoje = (q: QuadroDoDia) =>
    deHoje
      ? q.servicos.some((s) => deHoje.has(s))
      : !calendario && !!noServidor?.abertos.includes(q.chave);

  // OS DE HOJE ABREM-SE UMA VEZ, quando se sabe que dia é. Depois disso
  // mandam as mãos de quem lê: fechar um não o volta a abrir.
  //
  // E JÁ VÊM ABERTOS DO SERVIDOR, quando ele tem a tabela: abriam-se aqui,
  // quando o navegador acabava as contas, e o horário saltava por baixo do
  // dedo (P3-010). O mesmo dia dá a mesma resposta, e nada se mexe; só uma
  // página feita ontem — a cache dura uma hora — se refaz aqui.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(noServidor?.abertos ?? []));
  const [jaAbriu, setJaAbriu] = useState(false);
  const pronto = calendario !== undefined && hoje !== null;
  useEffect(() => {
    if (!pronto || jaAbriu) return;
    if (!noServidor || noServidor.hoje !== hoje) {
      setAbertos(new Set(quadros.filter(valeHoje).map((q) => q.chave)));
    }
    setJaAbriu(true);
    // `valeHoje` muda com o dia; o que interessa é a primeira vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, jaAbriu, quadros]);

  const algumHoje = quadros.some(valeHoje);
  // «HOJE NÃO CIRCULA», DITO, e não deixado a quem lê. Os quadros vinham
  // todos fechados e nenhum marcado — e um domingo sem autocarros lia-se como
  // uma página que não sabia que dia era. Antes de o navegador saber, vale o
  // que o servidor sabia; depois, o relógio de quem lê.
  const diaDeHoje = hoje ?? noServidor?.hoje ?? null;
  const nenhumHoje = deHoje
    ? !algumHoje
    : !calendario && !!noServidor?.sabido && noServidor.abertos.length === 0;

  return (
    <>
      {nenhumHoje && diaDeHoje && (
        <p className="hoje-nao">
          Hoje, {diaDaSemana(diaDeHoje)}, {semHoje}.
        </p>
      )}
      <p className="secundario">
        {quadros.length === 1
          ? 'Toque no quadro para o abrir.'
          : `Um quadro por tipo de dia${algumHoje ? '; os que valem hoje estão abertos e marcados' : ''}. Toque num para o abrir.`}
      </p>
      {quadros.map((q) => {
        const vale = valeHoje(q);
        return (
          <details
            key={q.chave}
            className={`quadro-do-dia${vale ? ' de-hoje' : ''}`}
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
              {vale && (
                <span className="hoje">
                  <span className="so-para-leitores">, vale </span>hoje
                </span>
              )}
              <span className="quantas">
                <span className="so-para-leitores">, </span>
                {q.contagem}
              </span>
            </summary>
            {q.conteudo}
          </details>
        );
      })}
    </>
  );
}
