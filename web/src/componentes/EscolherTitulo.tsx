'use client';

import { useId, useState } from 'react';
import { compensaAPartirDe, porPeriodo, type EscolhaDeUmaRede } from '@/lib/tarifario';

/**
 * «QUE TÍTULO ME SERVE?», COMO UMA CONTA E NÃO COMO UMA LISTA.
 *
 * Era uma segunda lista de preços, ao lado das tabelas — cada preço aparecia
 * duas vezes, e a pergunta que traz alguém a esta página ficava por fazer:
 * com as viagens que faço, compensa o passe? Três perguntas — a rede, o
 * bilhete que se pagaria, quantas viagens por mês — e a resposta com a conta
 * à vista: quanto custa cada maneira, e a partir de quantas viagens o passe
 * sai mais barato.
 *
 * SÓ OS PREÇOS ENTRAM NA CONTA. Que linhas um passe cobre, ou quem tem
 * direito a um título sem pagar, não está nos dados, e diz-se em vez de se
 * adivinhar. As 40 viagens de partida são uma pergunta, não um dado: ir e
 * voltar nos dias úteis de um mês.
 */
export default function EscolherTitulo({
  escolhas,
  moeda,
}: {
  escolhas: EscolhaDeUmaRede[];
  moeda: string;
}) {
  const id = useId();
  const [rede, setRede] = useState(0);
  const [bilhete, setBilhete] = useState(0);
  const [viagens, setViagens] = useState(40);
  const e = escolhas[rede] ?? escolhas[0];
  const b = e.bilhetes[bilhete] ?? e.bilhetes[0];
  const euros = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: moeda });
  const n = Number.isFinite(viagens) && viagens > 0 ? Math.min(Math.round(viagens), 999) : 0;
  const aCadaViagem = n * b.valor;
  const maisBarato = e.periodos.reduce(
    (m, p) => (p.mensal < m.custo ? { nome: `o «${p.nome}»`, custo: p.mensal } : m),
    { nome: 'pagar cada viagem', custo: aCadaViagem },
  );

  return (
    <form className="escolher-titulo" onSubmit={(ev) => ev.preventDefault()}>
      {escolhas.length > 1 && (
        <fieldset>
          <legend>Em que rede viaja?</legend>
          {escolhas.map((x, i) => (
            <label key={x.rede}>
              <input
                type="radio"
                name={`${id}-rede`}
                checked={i === rede}
                onChange={() => {
                  setRede(i);
                  setBilhete(0);
                }}
              />{' '}
              {x.rede}
            </label>
          ))}
        </fieldset>
      )}
      {e.bilhetes.length > 1 && (
        <fieldset>
          <legend>Que bilhete pagaria de cada vez?</legend>
          {e.bilhetes.map((x, i) => (
            <label key={x.id}>
              <input
                type="radio"
                name={`${id}-bilhete`}
                checked={i === bilhete}
                onChange={() => setBilhete(i)}
              />{' '}
              {x.nome} <span className="preco-em-linha">({euros.format(x.valor)})</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="quantas-viagens">
        <label htmlFor={`${id}-viagens`}>Quantas viagens faz por mês?</label>
        <input
          id={`${id}-viagens`}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={Number.isFinite(viagens) ? viagens : ''}
          onChange={(ev) => setViagens(ev.target.valueAsNumber)}
          aria-describedby={`${id}-ajuda`}
        />
        <p id={`${id}-ajuda`} className="secundario">
          Ir e voltar nos dias úteis de um mês são cerca de 40.
        </p>
      </div>

      <div className="conta-do-titulo" aria-live="polite">
        {n > 0 ? (
          <>
            <p>
              <strong>
                Com {n} {n === 1 ? 'viagem' : 'viagens'}, sai mais barato {maisBarato.nome}
              </strong>{' '}
              ({euros.format(maisBarato.custo)} por mês).
            </p>
            <ul>
              <li>
                Pagar cada viagem com o «{b.nome}»:{' '}
                <span className="preco-em-linha">{euros.format(aCadaViagem)}</span>
              </li>
              {e.periodos.map((p) => {
                const a = compensaAPartirDe(p.mensal, b.valor);
                return (
                  <li key={p.id}>
                    {p.nome}:{' '}
                    <span className="preco-em-linha">
                      {euros.format(p.valor)} {porPeriodo(p.periodo)}
                    </span>
                    {p.periodo !== 'mes' && (
                      <span className="secundario"> (uns {euros.format(p.mensal)} por mês)</span>
                    )}
                    {a !== null && (
                      <span className="secundario">
                        {' '}
                        — compensa a partir de {a} {a === 1 ? 'viagem' : 'viagens'} por mês
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p>Escreva quantas viagens faz por mês.</p>
        )}
        <p className="secundario">
          A conta é só dos preços. Que linhas cada passe cobre, e quem tem direito a cada um, está
          nas condições da tabela e na operadora.
          {e.semPagar.length > 0 &&
            ` Sem pagar, para quem tem direito: ${e.semPagar.map((x) => x.nome).join(', ')}.`}
        </p>
      </div>
    </form>
  );
}
