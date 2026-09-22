'use client';

/**
 * «Quanto custa daqui até lá, hoje?» — a pergunta que um horário não responde.
 *
 * O horário que o sítio publica é planeado: diz a que horas o autocarro devia
 * partir. Para um expresso isso não chega. Quem vai daqui a Lisboa quer saber
 * o preço e se ainda há lugar, e nenhuma das duas coisas está num GTFS.
 *
 * ## É A PEDIDO, E ISSO É UMA DECISÃO E NÃO UMA LIMITAÇÃO
 *
 * O feed conhece dezenas de destinos por paragem. Perguntar todos ao abrir a
 * página era martelar o operador para mostrar números que quase ninguém ia
 * ler. Aqui escolhe-se o destino e pergunta-se por esse — um pedido, quando
 * alguém o quer.
 *
 * ## E DEGRADA PARA O QUE JÁ LÁ ESTAVA
 *
 * Sem serviço configurado, isto não desenha nada: a página fica com as linhas
 * que o feed declara, como está hoje. Se a consulta falhar, diz que não
 * conseguiu — e não apaga nada do que já estava escrito.
 */

import { useId, useState } from 'react';
import {
  consultarExpressos,
  duracaoDe,
  horaDe,
  precoDe,
  type RespostaDeExpressos,
} from '@/lib/expressos';

export type Destino = { id: string; nome: string };

export default function PrecosDeExpresso({
  base,
  de,
  nomeDaParagem,
  destinos,
}: {
  base: string;
  de: string;
  nomeDaParagem: string;
  destinos: Destino[];
}) {
  const id = useId();
  const [para, setPara] = useState('');
  const [aPerguntar, setAPerguntar] = useState(false);
  const [r, setR] = useState<RespostaDeExpressos | null>(null);

  // Sem serviço ou sem destinos não há nada a perguntar, e um formulário que
  // não leva a lado nenhum é pior do que formulário nenhum.
  if (!base || destinos.length === 0) return null;

  async function perguntar(e: React.FormEvent) {
    e.preventDefault();
    if (!para) return;
    setAPerguntar(true);
    setR(await consultarExpressos(base, de, para));
    setAPerguntar(false);
  }

  const nomeDoDestino = destinos.find((d) => d.id === para)?.nome ?? '';

  return (
    <form className="precos-de-expresso" onSubmit={perguntar}>
      <label htmlFor={`${id}-destino`}>Ver preços de hoje a partir de {nomeDaParagem}</label>
      <div className="linha-de-campos">
        <select
          id={`${id}-destino`}
          value={para}
          onChange={(e) => {
            setPara(e.target.value);
            setR(null);
          }}
        >
          <option value="">Escolher destino…</option>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!para || aPerguntar}>
          {aPerguntar ? 'A perguntar…' : 'Procurar'}
        </button>
      </div>

      {/* O resultado é anunciado a quem usa leitor de ecrã: sem isto, a lista
          aparece em silêncio e quem não a vê não sabe que a resposta chegou. */}
      <div aria-live="polite">
        {r?.falhou && (
          <p className="faixa alerta">
            Não foi possível saber os preços agora. O horário aqui ao lado é o planeado e continua a
            valer; para comprar, o sítio do operador está no fim desta página.
          </p>
        )}

        {r && !r.falhou && r.viagens.length === 0 && (
          <p className="secundario">
            O operador não mostra viagens de hoje entre {nomeDaParagem} e {nomeDoDestino}. Pode
            haver noutro dia.
          </p>
        )}

        {r && !r.falhou && r.viagens.length > 0 && (
          <>
            <table>
              <caption className="so-para-leitores">
                Viagens de hoje entre {nomeDaParagem} e {nomeDoDestino}, com preço e lugares
              </caption>
              <thead>
                <tr>
                  <th scope="col">Parte</th>
                  <th scope="col">Chega</th>
                  <th scope="col">Demora</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Lugares</th>
                </tr>
              </thead>
              <tbody>
                {r.viagens.map((v, i) => (
                  <tr key={i}>
                    <td>
                      {horaDe(v.partida)}
                      {/* A paragem exacta não é pormenor: «Lisboa (Oriente)» e
                          «Lisboa (Sete Rios)» não são o mesmo sítio. */}
                      {v.paragemPartida && (
                        <span className="secundario"> · {v.paragemPartida}</span>
                      )}
                    </td>
                    <td>
                      {horaDe(v.chegada)}
                      {v.paragemChegada && (
                        <span className="secundario"> · {v.paragemChegada}</span>
                      )}
                    </td>
                    <td>{duracaoDe(v.duracaoMin) ?? '—'}</td>
                    {/* Sem preço escreve-se «esgotado» quando é isso que a
                        resposta diz, e «—» quando é por saber. Um zero dizia
                        «é grátis», que é outra coisa. */}
                    <td>{precoDe(v.preco) ?? (v.estado === 'sold_out' ? 'Esgotado' : '—')}</td>
                    <td>{v.lugares == null ? '—' : v.lugares}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="secundario">
              Preços e lugares consultados ao operador em{' '}
              {new Date(r.lido).toLocaleTimeString('pt-PT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Mudam ao longo do dia; a compra é no sítio dele.
            </p>
          </>
        )}
      </div>
    </form>
  );
}
