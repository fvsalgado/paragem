'use client';

import { useId, useState } from 'react';
import { procurarTerra, type IndiceDasTerras } from '@/lib/a-pedido';

/**
 * «HÁ TRANSPORTE A PEDIDO NA MINHA TERRA?» — escreve-se o nome e responde-se.
 *
 * A pergunta é sempre a mesma, e quem a faz é sobretudo gente mais velha, ao
 * telemóvel. A página respondia a tudo menos a ela: o nome da aldeia
 * aparecia, quando aparecia, dentro do nome de um circuito, algures em 24
 * ecrãs de zonas com nomes de contrato (números de lote).
 *
 * Procura nos nomes dos circuitos, das paragens de cada circuito e das zonas
 * (`indiceDasTerras`), sem acentos. Quando não encontra, diz que não
 * encontrou — e dá o telefone, que serve todas as zonas: não ter o nome nos
 * dados não quer dizer que o serviço lá não passe.
 */
export default function ProcurarTerra({
  indice,
  telefone,
  telefoneApresentado,
}: {
  indice: IndiceDasTerras;
  telefone?: string;
  telefoneApresentado?: string;
}) {
  const [pergunta, setPergunta] = useState('');
  const campo = useId();
  const achadas = procurarTerra(indice, pergunta);
  const escrita = pergunta.trim();

  return (
    <div className="procurar-terra">
      <label htmlFor={campo}>Escreve o nome da tua terra</label>
      <input
        id={campo}
        type="search"
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        autoComplete="off"
        placeholder="Por exemplo, o nome da aldeia"
      />
      <div aria-live="polite">
        {escrita.length >= 2 && achadas.length === 0 && (
          <p className="sem-resposta">
            Não encontrámos «{escrita}» nos circuitos que conhecemos.{' '}
            {telefone ? (
              <>
                Liga para o <a href={`tel:${telefone}`}>{telefoneApresentado ?? telefone}</a>, que
                serve todas as zonas: pode haver serviço e ainda não estar aqui.
              </>
            ) : (
              'Pode haver serviço e ainda não estar aqui.'
            )}
          </p>
        )}
        {achadas.length > 0 && (
          <>
            <p className="so-para-leitores">
              {achadas.length === 1
                ? 'Uma terra encontrada.'
                : `${achadas.length} terras encontradas.`}
            </p>
            <ul className="terras-encontradas">
              {achadas.map(({ terra, circuitos }) => (
                <li key={terra}>
                  <p className="terra">
                    <strong>{terra}</strong>
                  </p>
                  <ul>
                    {circuitos.map((c, i) => (
                      <li key={`${c.nome}-${i}`}>
                        <span>
                          {c.nome === terra ? 'Circuito próprio' : `No circuito ${c.nome}`}
                          {c.onde ? <span className="secundario"> · {c.onde}</span> : null}
                        </span>
                        {c.horario ? (
                          <a href={c.horario}>Ver horário</a>
                        ) : c.folheto ? (
                          <a href={c.folheto} rel="noreferrer">
                            Ver folheto
                          </a>
                        ) : (
                          <span className="secundario">horário por publicar</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
