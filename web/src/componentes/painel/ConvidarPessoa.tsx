'use client';

import { useActionState } from 'react';
import LigacaoUmaVez from '@/componentes/painel/LigacaoUmaVez';
import { convidarPessoa, type EstadoDaLigacao } from '@/lib/painel/acoes-das-pessoas';
import { porExtenso } from '@/lib/fuso';

/**
 * «Convidar uma pessoa»: o nome, o email e o papel em cada região — e a
 * ligação de ativação, uma vez, quando corre bem.
 *
 * Um formulário de cliente por uma razão só: a ligação volta como ESTADO do
 * formulário (`useActionState`) e não na barra de endereços, onde ficava no
 * histórico do navegador. E quando a base recusa — um email repetido —, o que
 * se escreveu fica nas caixas.
 */
export default function ConvidarPessoa({ regioes }: { regioes: { id: string; nome: string }[] }) {
  const [estado, convidar, aEnviar] = useActionState<EstadoDaLigacao, FormData>(
    convidarPessoa,
    null,
  );
  const campos = estado && !estado.ok ? (estado.campos ?? {}) : {};
  // Depois de um convite feito, o formulário volta vazio para o seguinte.
  const chave = estado?.ok ? estado.ligacao : 'formulario';

  return (
    <>
      {estado?.ok ? (
        <LigacaoUmaVez
          id="ligacao-do-convite"
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
      <form key={chave} action={convidar} className="formulario formulario-largo">
        <label htmlFor="convite-nome">Nome</label>
        <input
          id="convite-nome"
          name="nome"
          type="text"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={campos.nome ?? ''}
          aria-describedby="convite-nome-ajuda"
        />
        <p id="convite-nome-ajuda" className="secundario-texto">
          É o que a auditoria escreve em tudo o que esta pessoa fizer.
        </p>
        <label htmlFor="convite-email">Email</label>
        <input
          id="convite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          spellCheck={false}
          defaultValue={campos.email ?? ''}
          aria-describedby="convite-email-ajuda"
        />
        <p id="convite-email-ajuda" className="secundario-texto">
          É com ele que a pessoa entra. Não sai correio nenhum daqui: a ligação para escolher a
          palavra-passe aparece nesta página, e és tu que a envias.
        </p>
        <fieldset>
          <legend>Papel em cada região</legend>
          <p className="secundario-texto">
            <strong>Editor</strong> escreve, publica e retira os avisos da região.{' '}
            <strong>Gestor</strong> faz isso e gere a ficha dela: os módulos, os contactos e o
            relatório da procura. A pessoa só vê as regiões onde tiver um papel.
          </p>
          <ul className="papeis-por-regiao">
            {regioes.map((r) => (
              <li key={r.id}>
                <label htmlFor={`convite-papel-${r.id}`}>{r.nome}</label>
                <select
                  id={`convite-papel-${r.id}`}
                  name={`papel:${r.id}`}
                  defaultValue={campos[`papel:${r.id}`] ?? ''}
                >
                  <option value="">Sem papel</option>
                  <option value="editor">Editor</option>
                  <option value="gestor">Gestor</option>
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
        <button type="submit" disabled={aEnviar}>
          {aEnviar ? 'A convidar…' : 'Convidar e gerar a ligação'}
        </button>
      </form>
    </>
  );
}
