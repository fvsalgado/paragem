'use client';

import { useActionState } from 'react';
import LigacaoUmaVez from '@/componentes/painel/LigacaoUmaVez';
import { gerarLigacao, type EstadoDaLigacao } from '@/lib/painel/acoes-das-pessoas';
import { porExtenso } from '@/lib/fuso';

/**
 * «Gerar uma ligação nova» para quem já existe: a primeira perdeu-se, ou a
 * pessoa esqueceu-se da palavra-passe. A antiga continua a valer até a pessoa
 * escolher a nova — gerar uma ligação não tranca ninguém fora.
 */
export default function NovaLigacao({
  pessoa,
}: {
  pessoa: { id: string; nome: string; email: string; ativada: boolean };
}) {
  const [estado, gerar, aEnviar] = useActionState<EstadoDaLigacao, FormData>(gerarLigacao, null);
  return (
    <>
      {estado?.ok ? (
        <LigacaoUmaVez
          id={`ligacao-${pessoa.id}`}
          ligacao={estado.ligacao}
          nome={estado.nome}
          email={estado.email}
          ate={porExtenso(estado.ate)}
        />
      ) : null}
      {estado && !estado.ok ? (
        <p role="alert" className="faixa alerta">
          {estado.erro}
        </p>
      ) : null}
      <form action={gerar} className="em-linha">
        <input type="hidden" name="pessoa" value={pessoa.id} />
        <input type="hidden" name="nome" value={pessoa.nome} />
        <input type="hidden" name="email" value={pessoa.email} />
        <button type="submit" className="secundario" disabled={aEnviar}>
          {pessoa.ativada
            ? 'Gerar uma ligação para uma palavra-passe nova'
            : 'Gerar uma ligação nova'}
        </button>
      </form>
      <p className="secundario-texto">
        {pessoa.ativada
          ? 'A palavra-passe que tem continua a valer até escolher a nova.'
          : 'A ligação anterior deixa de servir.'}
      </p>
    </>
  );
}
