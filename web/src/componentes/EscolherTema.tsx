'use client';

import { useId, useSyncExternalStore } from 'react';
import { escolherTema, lerEscolha, ouvirTema, temaEfetivo, type Escolha } from '@/lib/tema';

/**
 * ESCOLHER O TEMA — claro, escuro, ou o do aparelho (`lib/tema.ts`).
 *
 * Duas formas, para dois sítios:
 *
 * - **O interruptor do cabeçalho** (`BotaoDoTema.tsx`, que lhe dá a lua):
 *   «Tema escuro», ligado ou desligado. A lua não muda com o tema; o que muda
 *   é o botão estar aceso (cheio) ou apagado (só o contorno) — e, para quem
 *   ouve, `aria-pressed`. O aceso pinta-se no CSS a partir do tema, e não do
 *   estado do React: na primeira pintura o React ainda não sabe o tema, e o
 *   CSS já sabe.
 * - **As três escolhas**, no rodapé e no menu do mapa: é aí que se volta ao
 *   tema do aparelho, que o interruptor não oferece.
 *
 * Antes de o React acordar não se sabe nada (`null`): o interruptor fica sem
 * `aria-pressed` e nenhuma escolha marcada, em vez de mostrar uma errada.
 */

const nadaNoServidor = () => null;

export function InterruptorDoTema({ children }: { children: React.ReactNode }) {
  const tema = useSyncExternalStore(ouvirTema, temaEfetivo, nadaNoServidor);
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      className="botao-do-tema"
      aria-label="Tema escuro"
      aria-pressed={tema === null ? undefined : escuro}
      title={escuro ? 'Voltar ao tema claro' : 'Passar ao tema escuro'}
      onClick={() => escolherTema(escuro ? 'claro' : 'escuro')}
    >
      {children}
    </button>
  );
}

const ESCOLHAS: [Escolha, string][] = [
  ['aparelho', 'Como o aparelho'],
  ['claro', 'Claro'],
  ['escuro', 'Escuro'],
];

export function EscolhaDoTema() {
  const nome = useId();
  const escolha = useSyncExternalStore(ouvirTema, lerEscolha, nadaNoServidor);
  return (
    <fieldset className="escolha-do-tema">
      <legend>Tema</legend>
      <div className="opcoes-do-tema">
        {ESCOLHAS.map(([valor, rotulo]) => (
          <label key={valor}>
            <input
              type="radio"
              name={nome}
              value={valor}
              checked={escolha === valor}
              onChange={() => escolherTema(valor)}
            />
            <span>{rotulo}</span>
          </label>
        ))}
      </div>
      <p className="nota-do-tema">Claro ou escuro, a escolha fica só neste navegador.</p>
    </fieldset>
  );
}
