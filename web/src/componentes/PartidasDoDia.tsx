'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from '@/componentes/Ligacao';
import Distintivo from '@/componentes/Distintivo';
import {
  expandir,
  horaLegivel,
  operadorCurto,
  type PartidaLeve,
  type PartidasCompactas,
} from '@/lib/formato';
import {
  calendarioDe,
  chaveDoDia,
  chaveMais,
  dataCompleta,
  diaCurto,
  diaDaSemana,
  horaDoRelogio,
  periodoDe,
  type Calendario,
} from '@/lib/dias';
import { notasDosPeriodos, partidasComServicos, partidasDoDia } from '@/lib/partidas-do-dia';
import { plural } from '@/lib/prosa';

type Escolha = 'hoje' | 'amanha' | 'outro';

const comoCampo = (chave: string) =>
  `${chave.slice(0, 4)}-${chave.slice(4, 6)}-${chave.slice(6, 8)}`;

/**
 * AS PARTIDAS DE UM DIA, NUMA LISTA SÓ — hoje, amanhã ou outro dia.
 *
 * Para saber o que passa numa segunda-feira era preciso abrir três quadros e
 * juntá-los de cabeça (auditoria de 1/11/2026, #14). Aqui juntam-se os que
 * valem no dia escolhido, pela hora, com a mesma tabela dos dias do «A seguir»
 * e dos quadros (`lib/partidas-do-dia.ts`). Os quadros continuam por baixo,
 * fechados, para quem quer o horário como a operadora o imprime.
 *
 * O DIA DE HOJE VEM DO SERVIDOR, para a lista estar no HTML e não aparecer
 * depois a empurrar a página: o servidor manda os serviços que andam no dia
 * em que a página se fez (`noServidor`). O navegador refaz a conta com o seu
 * relógio — a página fica em cache uma hora — e só mexe se o dia for outro.
 * Amanhã e os outros dias esperam pela tabela dos dias do navegador.
 */
export default function PartidasDoDia({
  regiao,
  partidas,
  cores,
  nomesDosServicos,
  noServidor = null,
  caminhoDasLinhas,
}: {
  regiao: string;
  partidas: PartidasCompactas;
  cores: Record<string, string | null>;
  /** O nome de cada serviço (`<feed>:<serviço>` → «Em tempo de aulas · Dias úteis»). */
  nomesDosServicos: Record<string, string>;
  /** O dia em que a página se fez, e os serviços desta paragem que andavam nele. */
  noServidor?: { hoje: string; servicos: string[] } | null;
  /** O princípio do endereço da página de uma linha: `/rede/linhas/`. */
  caminhoDasLinhas: string;
}) {
  const lista = useMemo(() => expandir(partidas), [partidas]);
  const campo = useId();

  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);

  // O relógio de quem lê: o dia de hoje, e a hora para marcar o que já passou.
  const [agora, setAgora] = useState<{ chave: string; hora: string } | null>(null);
  useEffect(() => {
    const ver = () => {
      const d = new Date();
      setAgora({ chave: chaveDoDia(d), hora: horaDoRelogio(d) });
    };
    ver();
    const t = setInterval(ver, 60_000);
    return () => clearInterval(t);
  }, []);

  const [escolha, setEscolha] = useState<Escolha>('hoje');
  const [outro, setOutro] = useState('');

  const hoje = agora?.chave ?? noServidor?.hoje ?? null;
  const chave = !hoje
    ? null
    : escolha === 'hoje'
      ? hoje
      : escolha === 'amanha'
        ? chaveMais(hoje, 1)
        : outro;

  // As do dia: da tabela do navegador, quando já chegou; antes dela, as do
  // servidor — só para o dia dele. `undefined` é «à espera».
  const doDia = useMemo((): PartidaLeve[] | null | undefined => {
    if (chave && calendario) return partidasDoDia(lista, calendario, chave);
    if (chave && noServidor && chave === noServidor.hoje)
      return partidasComServicos(lista, new Set(noServidor.servicos));
    if (calendario === null) return null;
    return undefined;
  }, [lista, calendario, chave, noServidor]);
  const notas = useMemo(
    () => notasDosPeriodos(doDia ?? [], nomesDosServicos),
    [doDia, nomesDosServicos],
  );

  const periodo = calendario ? periodoDe(calendario) : null;
  const nomeDoDia = chave
    ? `${chave === hoje ? 'Hoje, ' : chave === (hoje && chaveMais(hoje, 1)) ? 'Amanhã, ' : ''}${diaDaSemana(chave)}, ${diaCurto(chave, hoje ?? '')}`
    : '';
  const passou = (p: PartidaLeve) => chave === agora?.chave && p.hora < agora.hora;

  return (
    <div className="partidas-do-dia">
      <fieldset className="escolha-do-dia">
        <legend>Que dia</legend>
        <div className="opcoes-do-dia">
          {(
            [
              ['hoje', 'Hoje'],
              ['amanha', 'Amanhã'],
              ['outro', 'Outro dia'],
            ] as const
          ).map(([valor, texto]) => (
            <label key={valor}>
              <input
                type="radio"
                name={`${campo}-dia`}
                value={valor}
                checked={escolha === valor}
                onChange={() => {
                  setEscolha(valor);
                  if (valor === 'outro' && !outro && hoje) setOutro(chaveMais(hoje, 2));
                }}
              />
              {texto}
            </label>
          ))}
        </div>
        {escolha === 'outro' && (
          <p className="outro-dia">
            <label htmlFor={`${campo}-data`}>Data</label>
            <input
              id={`${campo}-data`}
              type="date"
              value={outro ? comoCampo(outro) : ''}
              min={periodo ? comoCampo(periodo.inicio) : undefined}
              max={periodo ? comoCampo(periodo.fim) : undefined}
              onChange={(e) => setOutro(e.target.value.replace(/-/g, ''))}
            />
          </p>
        )}
      </fieldset>

      <div aria-live="polite">
        {doDia === undefined ? (
          <p className="secundario">A juntar as partidas do dia…</p>
        ) : doDia === null ? (
          <p>
            {calendario === null
              ? 'Não foi possível saber em que dias anda cada serviço. Os quadros por baixo têm todas as horas.'
              : periodo && chave
                ? `Os horários carregados vão de ${dataCompleta(periodo.inicio)} a ${dataCompleta(periodo.fim)}, e não dizem o que passa a ${dataCompleta(chave)}.`
                : 'Os horários carregados não dizem o que passa nesse dia.'}
          </p>
        ) : doDia.length === 0 ? (
          <p className="hoje-nao">{nomeDoDia}: não há partidas desta paragem.</p>
        ) : (
          <p className="dia-escolhido">
            <strong>{nomeDoDia}</strong> · {plural(doDia.length, 'partida', 'partidas')}
          </p>
        )}
      </div>

      {doDia && doDia.length > 0 && (
        <table className="horario quadro-fixo partidas-do-dia-tabela">
          <caption className="so-para-leitores">Partidas desta paragem: {nomeDoDia}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: '4.75rem' }}>
                Hora
              </th>
              <th scope="col" style={{ width: '5.5rem' }}>
                Linha
              </th>
              <th scope="col">Destino</th>
            </tr>
          </thead>
          <tbody>
            {doDia.map((d, i) => {
              const h = horaLegivel(d.hora);
              const nota = d.servico_id ? notas.get(d.servico_id) : undefined;
              const jaPassou = passou(d);
              return (
                <tr
                  key={`${d.linha_id}-${d.hora}-${i}`}
                  className={jaPassou ? 'passou' : undefined}
                >
                  <td>
                    <span className="hora">{h.texto}</span>
                    {jaPassou && <span className="so-para-leitores">, já passou</span>}
                    {d.estimada && <span className="nota-da-hora">estimada</span>}
                    {h.diaSeguinte && <span className="nota-da-hora">dia seguinte</span>}
                  </td>
                  <td>
                    <Link className="ligacao-da-linha" href={`${caminhoDasLinhas}${d.linha_id}/`}>
                      <span className="so-para-leitores">Linha </span>
                      <Distintivo codigo={d.linha} cor={cores[d.linha_id]} tamanho="medio" />
                    </Link>
                  </td>
                  <td>
                    {d.circular ? 'circular · volta aqui' : d.destino}
                    {nota && (
                      <>
                        <br />
                        <span className="secundario">{nota}</span>
                      </>
                    )}
                    {d.operador && (
                      <>
                        <br />
                        <span className="secundario">Gerido por {operadorCurto(d.operador)}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
