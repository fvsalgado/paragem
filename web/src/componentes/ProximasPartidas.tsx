'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ASeguir from '@/componentes/ASeguir';
import { expandir, type PartidasCompactas } from '@/lib/formato';
import { calendarioDe, horaDoRelogio, proximas, type Calendario } from '@/lib/dias';

/**
 * O «A seguir» de um sítio qualquer — uma paragem, uma estação, a paragem à
 * porta de uma estação —, com o relógio de quem lê e a tabela dos dias.
 *
 * É o MESMO cálculo do cartão do mapa e da página da paragem (`proximas`), e a
 * mesma tabela (`calendarioDe`, pedida uma vez por página). Corre no
 * navegador porque é a única coisa que depende da hora de quem lê, e a página
 * é servida da cache.
 */
export default function ProximasPartidas({
  regiao,
  partidas,
  cores,
  Titulo = 'h2',
  id,
  titulo,
  quantas = 6,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  Titulo?: 'h2' | 'h3' | null;
  id?: string;
  titulo?: string;
  quantas?: number;
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
  // verdade ao fim de um minuto.
  const [instante, setInstante] = useState<Date | null>(null);
  useEffect(() => {
    setInstante(new Date());
    const t = setInterval(() => setInstante(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // O LUGAR DAS PARTIDAS FICA GUARDADO enquanto se fazem as contas (P3-010).
  //
  // A página vem da cache com uma frase no lugar das horas, e as horas chegam
  // depois — com a tabela dos dias. Medido na paragem mais servida da região
  // real, em 4G lenta: a caixa crescia de 128 para 378 px quando chegavam, e o
  // horário inteiro descia por baixo do dedo (CLS 0,13; 0,40 no Lighthouse).
  // Agora o HTML já traz as linhas, fantasmas, quantas vão ser — e a caixa
  // não encolhe quando chegam menos: fica com a altura que tinha.
  const aEspera = instante === null || calendario === undefined;
  const caixa = useRef<HTMLDivElement>(null);
  const reservado = useRef(0);
  useLayoutEffect(() => {
    if (aEspera && caixa.current) reservado.current = caixa.current.offsetHeight;
  });
  const linhas = Math.min(quantas, lista.length);

  if (aEspera) {
    return (
      <div ref={caixa}>
        {Titulo && <Titulo id={id}>{titulo ?? 'A seguir'}</Titulo>}
        <p className="so-para-leitores" aria-live="polite">
          A ver o que passa a seguir…
        </p>
        <ul className="fantasma-das-partidas" aria-hidden="true">
          {Array.from({ length: linhas }, (_, i) => (
            <li key={i}>
              <span className="distintivo medio">&nbsp;</span>
              <span className="destino">&nbsp;</span>
              <span className="quando-passa">
                <strong>&nbsp;</strong>
                <span className="relogio">&nbsp;</span>
              </span>
            </li>
          ))}
        </ul>
        <noscript>
          {/* Sem JavaScript as linhas fantasma nunca se preenchem: saem, e fica
              a frase que diz porquê. */}
          <style>{'.fantasma-das-partidas{display:none}'}</style>
          <p>
            O que passa a seguir calcula-se com a hora do teu aparelho, e isso precisa de
            JavaScript.
          </p>
        </noscript>
      </div>
    );
  }
  const agora = horaDoRelogio(instante);
  return (
    <div ref={caixa} style={reservado.current ? { minHeight: reservado.current } : undefined}>
      <ASeguir
        resultado={proximas(lista, instante, agora, calendario, quantas)}
        instante={instante}
        agora={agora}
        cores={cores}
        Titulo={Titulo}
        id={id}
        titulo={titulo}
      />
    </div>
  );
}
