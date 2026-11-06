import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from '@/componentes/Ligacao';
import AssinaturaDaRegiao from '@/componentes/AssinaturaDaRegiao';
import BotaoDeImprimir from '@/componentes/BotaoDeImprimir';
import Distintivo from '@/componentes/Distintivo';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import {
  concelhos,
  exigirModo,
  exigirRegiao,
  linhas,
  NAO_ENCONTRADA,
  origemDaRegiao,
  paragem as lerParagem,
  regiao,
  urlDaParagem,
} from '@/lib/dados';
import { feedsDosServicos } from '@/lib/formato';
import { destinosDaFolha, quadrosDaFolha } from '@/lib/horario-afixavel';
import { assinaturaDaRegiao, marcaDaRegiao } from '@/lib/marca';
import { metadadosDaRegiao } from '@/lib/metadados';
import { lista } from '@/lib/prosa';
import { codigoQr } from '@/lib/qr';
import './horario.css';

/**
 * A FOLHA PARA AFIXAR NA PARAGEM, em A4 ao alto.
 *
 * O horário que se cola no abrigo: o nome da paragem em grande, as linhas que
 * lá param, e as partidas em grelha — uma fila por hora, os minutos à frente —
 * por tipo de dia, como qualquer horário impresso. Por baixo, a data dos
 * horários, o que quer dizer cada sinal, e um código QR para a página da
 * paragem, onde está o que passa a seguir.
 *
 * No ecrã mostra-se a folha com «Imprimir» por cima; na impressão sai só a
 * folha (`horario.css`). Não se indexa: repete a página da paragem.
 */

/** Ver a nota em `../page.tsx`: vazio de propósito, para a rota ficar em cache. */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}): Promise<Metadata> {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const [ficha, r] = await Promise.all([lerParagem(rid, id), regiao(rid)]);
  if (!ficha || !r) return { title: NAO_ENCONTRADA };
  return {
    ...metadadosDaRegiao(r, {
      titulo: `Horário para afixar · ${ficha.paragem.nome}`,
      descricao: `O horário planeado da paragem ${ficha.paragem.nome}, numa folha A4 para imprimir.`,
      caminho: `${urlDaParagem(rid, ficha.paragem.id)}horario/`,
    }),
    robots: { index: false, follow: true },
  };
}

export default async function HorarioParaAfixar({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const ficha = await lerParagem(rid, id);
  if (!ficha) notFound();
  const p = ficha.paragem;
  const partidas = ficha.partidas;

  const [r, cs, catalogo, origem] = await Promise.all([
    exigirRegiao(rid),
    concelhos(rid),
    linhas(rid),
    origemDaRegiao(rid),
  ]);
  const concelho = cs.find((c) => c.id === p.concelho);
  const marca = marcaDaRegiao(r);
  const { principal, secundario, endereco } = assinaturaDaRegiao(r);
  const cores = Object.fromEntries(catalogo.map((l) => [l.id, l.cor]));

  const quadros = quadrosDaFolha(partidas);
  const letras = destinosDaFolha(partidas);
  const variasLinhas = new Set(partidas.map((d) => d.linha_id)).size > 1;
  const estimadas = partidas.filter((d) => d.estimada).length;
  const todasEstimadas = partidas.length > 0 && estimadas === partidas.length;
  const haDiaSeguinte = quadros.some((q) => q.horas.some((h) => h.diaSeguinte));
  const semDatas = partidas.some((d) => !d.tem_datas);

  // As linhas que param aqui, cada uma com os destinos dela — pelo
  // identificador, que há números repetidos entre concessões.
  const porLinha = new Map<string, { codigo: string; destinos: Set<string> }>();
  for (const d of partidas) {
    const l = porLinha.get(d.linha_id) ?? { codigo: d.linha, destinos: new Set<string>() };
    l.destinos.add(d.circular ? 'circular' : d.destino);
    porLinha.set(d.linha_id, l);
  }
  const linhasAqui = [...porLinha.entries()].sort(([, a], [, b]) =>
    a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }),
  );

  // O ENDEREÇO DA PÁGINA DA PARAGEM, por extenso e em QR. Sem domínio no mapa
  // (uma região que ainda não o tem), não há endereço a imprimir, e a folha
  // diz só o nome do sítio.
  const caminho = urlDaParagem(rid, p.id);
  const endereco_ = origem ? `${origem}${caminho}` : null;
  const qr = endereco_ ? codigoQr(endereco_) : null;

  return (
    <div className="horario-para-afixar">
      <div className="accoes-da-folha">
        <BotaoDeImprimir />
        <Link href={caminho}>Voltar à paragem</Link>
        <p className="secundario">
          Uma folha A4 ao alto, para imprimir e afixar na paragem.
          {quadros.length > 2 ? ' Numa paragem muito servida, pode sair em mais do que uma.' : ''}
        </p>
      </div>

      <article className="folha-a4" aria-labelledby="titulo-da-folha">
        <header className="folha-cabecalho">
          <div className="folha-marca" aria-hidden="true">
            <AssinaturaDaRegiao
              regiao={rid}
              marca={marca}
              principal={principal}
              secundario={secundario}
              endereco={endereco}
            />
          </div>
          <p className="folha-tipo">Horário da paragem</p>
          <h1 id="titulo-da-folha">{p.nome}</h1>
          {concelho && <p className="folha-concelho">{concelho.nome}</p>}
        </header>

        {linhasAqui.length > 0 && (
          <ul className="folha-linhas" aria-label="As linhas que param aqui">
            {linhasAqui.map(([lid, l]) => (
              <li key={lid}>
                <Distintivo codigo={l.codigo} cor={cores[lid]} tamanho="medio" />
                <span>para {lista([...l.destinos])}</span>
              </li>
            ))}
          </ul>
        )}

        {quadros.length === 0 ? (
          <p className="folha-vazia">
            Sem partidas registadas nesta paragem. Pode ser uma paragem só de chegada.
          </p>
        ) : (
          quadros.map((q) => (
            <section className="folha-quadro" key={q.nome} aria-label={q.nome}>
              <h2>
                {q.nome}{' '}
                <span className="folha-contagem">
                  · {q.partidas === 1 ? '1 partida' : `${q.partidas} partidas`}
                </span>
              </h2>
              <table className="folha-grelha">
                <caption className="so-para-leitores">
                  {p.nome}: {q.nome}
                </caption>
                <thead className="so-para-leitores">
                  <tr>
                    <th scope="col">Hora</th>
                    <th scope="col">Minutos</th>
                  </tr>
                </thead>
                <tbody>
                  {q.horas.map((h) => (
                    <tr key={`${h.hora}-${h.diaSeguinte}`}>
                      <th scope="row">
                        {h.hora}
                        {h.diaSeguinte && <span className="folha-sinal">*</span>}
                      </th>
                      <td>
                        {h.minutos.map((m, i) => (
                          <span className="folha-minuto" key={`${m.minuto}-${m.linha_id}-${i}`}>
                            {m.estimada && !todasEstimadas && (
                              <span className="folha-sinal" aria-hidden="true">
                                ≈
                              </span>
                            )}
                            {m.minuto}
                            {letras.size > 0 && (
                              <sup className="folha-letra">{letras.get(m.destino)}</sup>
                            )}
                            {variasLinhas && (
                              <Distintivo codigo={m.linha} cor={cores[m.linha_id]} />
                            )}
                            <span className="so-para-leitores">
                              {`, ${h.hora}:${m.minuto}, linha ${m.linha}, para ${m.destino}`}
                              {m.estimada ? ', estimada' : ''}
                            </span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}

        <footer className="folha-rodape">
          <div className="folha-notas">
            {(letras.size > 0 || estimadas > 0 || haDiaSeguinte || semDatas) && (
              <ul className="folha-legenda">
                {[...letras.entries()].map(([destino, letra]) => (
                  <li key={letra}>
                    <strong>{letra}</strong> para {destino}
                  </li>
                ))}
                {todasEstimadas ? (
                  <li>As horas desta folha são estimadas.</li>
                ) : (
                  estimadas > 0 && (
                    <li>
                      <strong>≈</strong> hora estimada
                    </li>
                  )
                )}
                {haDiaSeguinte && (
                  <li>
                    <strong>*</strong> já depois da meia-noite, no fim do dia de serviço
                  </li>
                )}
                {semDatas && (
                  <li>Há serviços sem os dias em que circulam: confirme com a operadora.</li>
                )}
              </ul>
            )}
            <MarcaDeDados
              regiao={rid}
              modos={['autocarro']}
              feeds={feedsDosServicos(partidas.map((d) => d.servico_id))}
            />
            <p className="folha-endereco">
              {endereco_ ? (
                <>
                  O que passa a seguir, os avisos e as outras paragens:{' '}
                  <span className="folha-url">{endereco_.replace(/^https?:\/\//, '')}</span>
                </>
              ) : (
                <>O que passa a seguir e os avisos, na página desta paragem.</>
              )}
            </p>
          </div>
          {qr && (
            <svg
              className="folha-qr"
              viewBox={`0 0 ${qr.lado} ${qr.lado}`}
              role="img"
              aria-label="Código QR para a página desta paragem"
              shapeRendering="crispEdges"
            >
              <rect width={qr.lado} height={qr.lado} fill="#fff" />
              <path d={qr.caminho} fill="#000" />
            </svg>
          )}
        </footer>
      </article>
    </div>
  );
}
