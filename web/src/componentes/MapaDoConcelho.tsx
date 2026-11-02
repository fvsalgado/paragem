'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { corDaRede } from '@/lib/estilo-mapa';
import type { Ponto } from '@/lib/formato';
import type { Sede } from '@/lib/sedes';
import { pedirPontos } from '@/lib/pontos-do-navegador';
import type { Limites } from '@/componentes/Mapa';

/**
 * O MAPA DE UM CONCELHO, na página dele (auditoria de 1/11/2026, #75): a rede
 * que o atravessa, as paragens e as estações dele, e a sede nomeada. É a
 * página que cada câmara quer mostrar, e não tinha mapa nenhum — o «Ver no
 * mapa» levava ao mapa da região, aberto numa paragem.
 *
 * SÓ SE CARREGA QUANDO SE APROXIMA DO ECRÃ. O código do mapa, o MapLibre e os
 * mosaicos são o grosso do peso de uma página com mapa, e quem abre o concelho
 * para ver a tabela das saídas não paga um mapa que não vê. Até lá, a caixa
 * tem o tamanho e a cor do mapa, e nada salta quando ele chega.
 *
 * O MAPA É UMA VISTA, NUNCA A ÚNICA PORTA (§4.5): as paragens e as estações
 * estão em lista na mesma página. Tocar numa abre a página dela.
 */
const Mapa = dynamic(() => import('@/componentes/Mapa'), { ssr: false });

export default function MapaDoConcelho({
  regiao,
  concelho,
  nome,
  mosaicos,
  atribuicao,
  limites,
  rede,
  tipos,
  sedes,
  modosDesligados = [],
}: {
  regiao: string;
  /** O identificador do concelho, para escolher os pontos dele. */
  concelho: string;
  /** O nome, para a legenda. */
  nome: string;
  mosaicos: string;
  atribuicao?: string;
  /** A caixa das paragens e das estações do concelho. */
  limites: Limites;
  rede: string;
  tipos: string[];
  sedes: Sede[];
  modosDesligados?: string[];
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [perto, setPerto] = useState(false);
  const [pontos, setPontos] = useState<Ponto[] | null>(null);

  // Quando a caixa está a menos de um ecrã de se ver.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setPerto(true);
      return;
    }
    const o = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setPerto(true);
          o.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);

  // OS PONTOS DO CONCELHO, do índice que o mapa da região já usa — e que
  // quem lá passou já tem em cache. Só as paragens e as estações deste.
  useEffect(() => {
    if (!perto) return;
    let vivo = true;
    pedirPontos(regiao, modosDesligados)
      .then(
        (todos) =>
          vivo &&
          setPontos(
            todos.filter(
              (p) => p.concelho === concelho && (p.tipo === 'paragem' || p.tipo === 'estacao'),
            ),
          ),
      )
      // Sem pontos, o mapa desenha-se na mesma: a rede e a sede.
      .catch(() => vivo && setPontos([]));
    return () => {
      vivo = false;
    };
    // A região e o concelho não mudam na mesma página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perto]);

  const centro: [number, number] = [
    (limites[0][1] + limites[1][1]) / 2,
    (limites[0][0] + limites[1][0]) / 2,
  ];
  const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');
  const acesas = useMemo(
    () =>
      pontos && pontos.length
        ? {
            tracos: [],
            aproximado: false,
            paragens: pontos
              .filter((p) => p.tipo === 'paragem')
              .map((p) => [p.lat, p.lon] as [number, number]),
            cor: {
              claro: corDaRede('claro', 'autocarro'),
              escuro: corDaRede('escuro', 'autocarro'),
            },
          }
        : null,
    [pontos],
  );

  return (
    <figure className="mapa-do-concelho">
      <div ref={caixa} className="caixa-do-mapa-do-concelho">
        {perto && pontos && (
          <Mapa
            centro={centro}
            tipos={tipos}
            pontos={pontos}
            mosaicos={mosaicos}
            atribuicao={atribuicao}
            limites={limites}
            rede={rede}
            modosDesligados={modosDesligados}
            margemInferior={0}
            sedes={sedes}
            // AS PARAGENS DELE ACESAS A TODOS OS ZOOMS, como as de uma linha
            // escolhida: no zoom do concelho inteiro o mapa só mostra as mais
            // servidas, e quem o abre quer ver onde há paragens no concelho
            // dele. A rede fica como está.
            linha={acesas}
            aoEscolher={(p) =>
              router.push(
                `/rede/${p.tipo === 'estacao' ? 'estacoes' : 'paragens'}/${seguro(p.id)}/`,
              )
            }
          />
        )}
      </div>
      <figcaption className="secundario">
        {nome} no mapa: a rede que o atravessa, e as paragens e as estações dele. Tocar numa abre o
        horário; a lista está mais abaixo.
      </figcaption>
    </figure>
  );
}
