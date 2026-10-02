'use client';

import { useEffect, useRef, useState } from 'react';
import Direccoes from './Direccoes';
import type { Ponto } from '@/lib/formato';
import {
  avisoDe,
  comoProcura,
  escreverViagem,
  lerViagem,
  type Caixa,
} from '@/lib/endereco-da-viagem';

/**
 * As direções em `/viagem/`, com a viagem no endereço.
 *
 * Existe porque as páginas de cada paragem e de cada estação ligam para cá
 * com o destino no endereço — e é o endereço que se partilha, e o que a
 * agenda cultural da mesma casa usa para ligar o «Como chegar» de um evento
 * (`docs/ENDERECOS.md`). Lê `?de=`, `?para=`, `?nome=`, `?dia=` e `?hora=`
 * (`lib/endereco-da-viagem.ts`), e ESCREVE-OS de volta à medida que a
 * pergunta muda: o endereço que se copia da barra é sempre o da viagem que
 * está à frente (P2-027).
 *
 * **O FORMULÁRIO VEM NO HTML, e o endereço lê-se a seguir.** Esperava-se pelo
 * endereço para desenhar alguma coisa, com «A preparar…» no lugar — e a página
 * saltava quando o formulário substituía a frase e outra vez quando chegavam
 * os resultados (CLS de 0,38, P3-009). Agora o formulário e o lugar dos
 * resultados estão lá desde o primeiro instante, com a mesma altura; ler o
 * endereço só preenche os campos, e preencher um campo não mexe em nada à
 * volta dele.
 *
 * O endereço lê-se do `window` e não do `useSearchParams`: a página é servida
 * da cache, igual para toda a gente, e a pergunta só existe no navegador.
 */
export default function DireccoesDaPagina({
  pontos,
  regiao,
  caixa = null,
  emDaRegiao = '',
  modosDesligados = [],
  motorDaRegiao = '',
  servicosSemDatas = 0,
  temAPedido = false,
}: {
  pontos: Ponto[];
  regiao: string;
  /** A caixa da região: uma ponta pedida por coordenadas tem de cair perto dela. */
  caixa?: Caixa | null;
  /** «na Serra da Pedra Alta» — para dizer que uma ponta fica longe de mais. */
  emDaRegiao?: string;
  modosDesligados?: string[];
  motorDaRegiao?: string;
  servicosSemDatas?: number;
  temAPedido?: boolean;
}) {
  const [inicial, setInicial] = useState<{
    de: Ponto | null;
    para: Ponto | null;
    dia: string | null;
    hora: string | null;
    aviso: string | null;
    vez: number;
  }>({ de: null, para: null, dia: null, hora: null, aviso: null, vez: 0 });

  // O ENDEREÇO LÊ-SE ANTES DE SE ESCREVER. Os efeitos dos filhos correm antes
  // dos do pai: sem esta marca, as direções escreviam o endereço vazio da
  // primeira montagem por cima do que se ia ler a seguir.
  const lido = useRef(false);
  useEffect(() => {
    lido.current = true;
    const v = lerViagem(new URLSearchParams(window.location.search), pontos, caixa);
    const ponto = (l: typeof v.de) => (l?.tipo === 'ponto' ? l.ponto : null);
    // Sem nada no endereço não há nada a ler: os campos ficam como estão, e
    // não se volta a montar o formulário por baixo de quem já está a escrever.
    if (!v.de && !v.para && !v.dia) return;
    setInicial({
      de: ponto(v.de),
      para: ponto(v.para),
      dia: v.dia,
      hora: v.hora,
      aviso: avisoDe(v.de, v.para, emDaRegiao),
      vez: 1,
    });
    // Só à entrada: o endereço é o de chegada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Direccoes
      // Montado outra vez com o que o endereço trouxe — antes de alguém
      // poder escrever, e com a mesma altura: não se vê nada a mexer.
      key={inicial.vez}
      regiao={regiao}
      pontos={pontos}
      deInicial={inicial.de}
      paraInicial={inicial.para}
      diaInicial={inicial.dia}
      horaInicial={inicial.hora}
      aviso={inicial.aviso}
      modosDesligados={modosDesligados}
      motorDaRegiao={motorDaRegiao}
      servicosSemDatas={servicosSemDatas}
      temAPedido={temAPedido}
      aoMudar={(v) => {
        if (!lido.current) return;
        // SUBSTITUI, NÃO EMPILHA: cada hora escolhida não é uma página a que
        // o «voltar» tenha de regressar. O caminho fica o da página — numa
        // região sem mapa isto vive no início, e não em `/viagem/`.
        const q = escreverViagem(v);
        const endereco = `${window.location.pathname}${comoProcura(q)}`;
        if (endereco !== `${window.location.pathname}${window.location.search}`) {
          window.history.replaceState(window.history.state, '', endereco);
        }
      }}
    />
  );
}
