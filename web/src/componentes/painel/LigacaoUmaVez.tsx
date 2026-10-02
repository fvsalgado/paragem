'use client';

import { useState } from 'react';

/**
 * A ligação de ativação, mostrada UMA VEZ, com um botão de copiar.
 *
 * Não volta a aparecer: a base só guarda o sha256 dela, e a página não a tem
 * em lado nenhum depois de se sair daqui. Por isso diz-se, junto dela, o que
 * fazer com ela — e para quem é —, e não numa ajuda noutro sítio.
 *
 * O campo é de leitura e seleciona-se ao receber o foco: num navegador sem
 * acesso à área de transferência, o «Copiar» falha e quem está ao teclado
 * ainda consegue copiá-la à mão.
 */
export default function LigacaoUmaVez({
  ligacao,
  nome,
  email,
  ate,
  id,
}: {
  ligacao: string;
  nome: string;
  email: string;
  /** Até quando vale, já por extenso. */
  ate: string;
  id: string;
}) {
  const [copiada, setCopiada] = useState<'sim' | 'nao' | null>(null);
  return (
    <div className="faixa ligacao-uma-vez" role="status">
      <p>
        <strong>A ligação para {nome} está pronta.</strong> Envia-a para {email} pelo meio que
        costumas usar com esta pessoa: serve uma vez, até {ate}. Depois de saíres desta página, não
        a voltas a ver — se se perder, gera-se outra.
      </p>
      <label htmlFor={id}>A ligação</label>
      <div className="linha-de-campos">
        <input
          id={id}
          type="text"
          readOnly
          value={ligacao}
          onFocus={(e) => e.currentTarget.select()}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ligacao);
              setCopiada('sim');
            } catch {
              setCopiada('nao');
            }
          }}
        >
          Copiar a ligação
        </button>
      </div>
      <p aria-live="polite" className="secundario-texto">
        {copiada === 'sim'
          ? 'Copiada.'
          : copiada === 'nao'
            ? 'Este navegador não deixou copiar: seleciona a ligação na caixa e copia-a à mão.'
            : ''}
      </p>
    </div>
  );
}
