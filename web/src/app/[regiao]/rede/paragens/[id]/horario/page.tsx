import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from '@/componentes/Ligacao';
import AssinaturaDaRegiao from '@/componentes/AssinaturaDaRegiao';
import BotaoDeImprimir from '@/componentes/BotaoDeImprimir';
import Distintivo, { comContrasteSuficiente, textoSobre } from '@/componentes/Distintivo';
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
import { chamadasDaFolha, chaveDaChamada, quadrosDaFolha } from '@/lib/horario-afixavel';
import { assinaturaDaRegiao, estiloDaRegiao, marcaDaRegiao } from '@/lib/marca';
import { metadadosDaRegiao } from '@/lib/metadados';
import { normalizar } from '@/lib/cor';
import { lista } from '@/lib/prosa';
import { codigoQr } from '@/lib/qr';
import './horario.css';

/**
 * A FOLHA PARA AFIXAR NA PARAGEM, em A4 ao alto.
 *
 * O horário que se cola no abrigo, desenhado como um horário de paragem a
 * sério e não como uma página impressa:
 *
 * - **em cada folha**, por cima, a marca da região, a régua e o nome da
 *   paragem; por baixo, a legenda e o código QR. Uma paragem muito servida
 *   sai em várias folhas, e cada uma tem de se ler sozinha, colada ao lado
 *   das outras — e de levar ao telemóvel o que passa a seguir;
 * - **os minutos na cor da sua linha**, com a letra da linha e do destino por
 *   cima: a cor ajuda a encontrar, a letra diz (a cor sozinha não chega, e há
 *   linhas de cores vizinhas). Numa paragem de uma linha só, para um sítio só,
 *   os minutos ficam limpos;
 * - **os tipos de dia lado a lado**, em duas colunas, para caber mais em cada
 *   folha.
 *
 * As folhas repetem-se pelo motor de impressão do navegador, sem cópias no
 * HTML: o cabeçalho é o `thead` de uma tabela de paginação (repete-se em cada
 * folha), e o rodapé é `position: fixed` na impressão (sai no fundo de cada
 * folha), com o espaço dele guardado pelo `tfoot` para não tapar a grelha.
 * Ver `horario.css`.
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

/** A altura do rodapé de cada folha, em mm: cresce com a legenda, até um teto. */
function alturaDoRodape(entradas: number): number {
  const filas = Math.ceil(entradas / 2);
  return Math.min(92, Math.max(46, 30 + filas * 7));
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
  const chamadas = chamadasDaFolha(partidas);
  const estimadas = partidas.filter((d) => d.estimada).length;
  const todasEstimadas = partidas.length > 0 && estimadas === partidas.length;
  const haDiaSeguinte = quadros.some((q) => q.horas.some((h) => h.diaSeguinte));
  const semDatas = partidas.some((d) => !d.tem_datas);

  // A COR DE CADA MINUTO É A DA SUA LINHA, com o contraste que o distintivo
  // já garante (`comContrasteSuficiente`): a mesma pastilha, mais pequena.
  const pastilha = (linhaId: string): CSSProperties | undefined => {
    const cor = normalizar(cores[linhaId]);
    if (!cor) return undefined;
    const fundo = comContrasteSuficiente(cor);
    return { background: fundo, color: textoSobre(fundo), borderColor: fundo };
  };

  // As linhas que param aqui, cada uma com os destinos dela — pelo
  // identificador, que há números repetidos entre concessões.
  const porLinha = new Map<string, { codigo: string; destinos: Set<string> }>();
  for (const d of partidas) {
    const l = porLinha.get(d.linha_id) ?? { codigo: d.linha, destinos: new Set<string>() };
    l.destinos.add(d.circular ? 'circular, volta aqui' : d.destino);
    porLinha.set(d.linha_id, l);
  }
  const linhasAqui = [...porLinha.entries()].sort(([, a], [, b]) =>
    a.codigo.localeCompare(b.codigo, 'pt', { numeric: true }),
  );

  // O ENDEREÇO DA PÁGINA DA PARAGEM, por extenso e em QR. Sem domínio no mapa
  // (uma região que ainda não o tem), não há endereço a imprimir.
  const caminho = urlDaParagem(rid, p.id);
  const enderecoDaPagina = origem ? `${origem}${caminho}` : null;
  const qr = enderecoDaPagina ? codigoQr(enderecoDaPagina) : null;

  const notas = [
    todasEstimadas ? 'Horas estimadas' : estimadas > 0 ? '≈ hora estimada' : null,
    haDiaSeguinte ? '* depois da meia-noite' : null,
    semDatas ? 'Há serviços sem os dias em que circulam: confirme com a operadora' : null,
  ].filter((n): n is string => !!n);
  const estilo = {
    ...estiloDaRegiao(marca),
    '--folha-rodape': `${alturaDoRodape(chamadas.size + (notas.length ? 1 : 0))}mm`,
  } as CSSProperties;

  // UMA GRELHA: as horas de um quadro (ou de metade dele), com os minutos à
  // frente de cada hora.
  const grelha = (horas: (typeof quadros)[number]['horas'], legenda: string, chave: number) => (
    <table className="folha-grelha" key={chave}>
      <caption className="so-para-leitores">{legenda}</caption>
      <thead className="so-para-leitores">
        <tr>
          <th scope="col">Hora</th>
          <th scope="col">Minutos</th>
        </tr>
      </thead>
      <tbody>
        {horas.map((h) => (
          <tr key={`${h.hora}-${h.diaSeguinte}`}>
            <th scope="row">
              {h.hora}
              {h.diaSeguinte && <span className="folha-asterisco">*</span>}
            </th>
            <td>
              <div className="folha-minutos">
                {h.minutos.map((m, i) => {
                  const chamada = chamadas.get(chaveDaChamada(m.linha_id, m.destino));
                  return (
                    <span
                      className={chamada ? 'folha-minuto colorido' : 'folha-minuto'}
                      style={chamada ? pastilha(m.linha_id) : undefined}
                      key={`${m.minuto}-${m.linha_id}-${i}`}
                    >
                      {m.estimada && !todasEstimadas && (
                        <span className="folha-sinal" aria-hidden="true">
                          ≈
                        </span>
                      )}
                      {m.minuto}
                      {chamada && (
                        <span className="folha-letra" aria-hidden="true">
                          {chamada.letra}
                        </span>
                      )}
                      <span className="so-para-leitores">
                        {`, ${h.hora}:${m.minuto}, linha ${m.linha}, para ${m.destino}`}
                        {m.estimada ? ', estimada' : ''}
                      </span>
                    </span>
                  );
                })}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="horario-para-afixar">
      <div className="accoes-da-folha">
        <BotaoDeImprimir />
        <Link href={caminho}>Voltar à paragem</Link>
        <p className="secundario">
          Uma folha A4 ao alto, para imprimir e afixar na paragem. Numa paragem muito servida sai em
          mais do que uma, e cada folha leva o nome da paragem, a legenda e o código QR.
        </p>
      </div>

      <article className="folha-a4" style={estilo} aria-labelledby="titulo-da-folha">
        <table className="folha-paginas" role="presentation">
          <thead>
            <tr>
              <td>
                <header className="folha-cabecalho">
                  <div className="folha-topo">
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
                  </div>
                  <span className="folha-regua" aria-hidden="true" />
                  <h1 id="titulo-da-folha">{p.nome}</h1>
                  {concelho && <p className="folha-concelho">{concelho.nome}</p>}
                </header>
              </td>
            </tr>
          </thead>
          <tfoot className="folha-espaco-do-rodape" aria-hidden="true">
            <tr>
              <td />
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td>
                {linhasAqui.length > 0 && (
                  <ul className="folha-linhas" aria-label="As linhas que param aqui">
                    {linhasAqui.map(([lid, l]) => (
                      <li key={lid}>
                        <Distintivo codigo={l.codigo} cor={cores[lid]} tamanho="medio" />
                        <span>{lista([...l.destinos])}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {quadros.length === 0 ? (
                  <p className="folha-vazia">
                    Sem partidas registadas nesta paragem. Pode ser uma paragem só de chegada.
                  </p>
                ) : (
                  <div className="folha-quadros">
                    {quadros.map((q) => {
                      // AS HORAS DO DIA EM DUAS COLUNAS, a manhã e a tarde lado a
                      // lado: um quadro de dezasseis horas cabe em metade da
                      // folha, e não se parte entre folhas.
                      const metade = Math.ceil(q.horas.length / 2);
                      const partes =
                        q.horas.length > 6
                          ? [q.horas.slice(0, metade), q.horas.slice(metade)]
                          : [q.horas];
                      return (
                        <section className="folha-quadro" key={q.nome} aria-label={q.nome}>
                          <h2>
                            <span>{q.nome}</span>
                            <span className="folha-contagem">
                              {q.partidas === 1 ? '1 partida' : `${q.partidas} partidas`}
                            </span>
                          </h2>
                          <div
                            className={partes.length > 1 ? 'folha-grelhas duas' : 'folha-grelhas'}
                          >
                            {partes.map((horas, k) =>
                              grelha(
                                horas,
                                `${p.nome}: ${q.nome}${partes.length > 1 ? (k === 0 ? ', primeira metade do dia' : ', segunda metade do dia') : ''}`,
                                k,
                              ),
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <footer className="folha-rodape">
          <div className="folha-legenda-e-notas">
            {chamadas.size > 0 && (
              <ul className="folha-legenda" aria-label="Legenda">
                {[...chamadas.values()].map((c) => (
                  <li key={c.letra}>
                    <span
                      className="folha-minuto colorido folha-amostra"
                      style={pastilha(c.linha_id)}
                      aria-hidden="true"
                    >
                      <span className="folha-letra">{c.letra}</span>
                    </span>
                    <Distintivo codigo={c.linha} cor={cores[c.linha_id]} />
                    <span>para {c.destino}</span>
                  </li>
                ))}
              </ul>
            )}
            {notas.length > 0 && <p className="folha-notas">{notas.join(' · ')}</p>}
            <MarcaDeDados
              regiao={rid}
              modos={['autocarro']}
              feeds={feedsDosServicos(partidas.map((d) => d.servico_id))}
            />
          </div>
          {qr && enderecoDaPagina && (
            <div className="folha-qr-bloco">
              <svg
                className="folha-qr"
                viewBox={`0 0 ${qr.lado} ${qr.lado}`}
                role="img"
                aria-label="Código QR para a página desta paragem"
                shapeRendering="crispEdges"
              >
                <rect width={qr.lado} height={qr.lado} fill="#fff" />
                <path d={qr.caminho} fill="#102c3f" />
              </svg>
              <p>
                <strong>O que passa a seguir</strong>
                <span>Aponte a câmara do telemóvel</span>
                <span className="folha-url">{enderecoDaPagina.replace(/^https?:\/\//, '')}</span>
              </p>
            </div>
          )}
          <span className="folha-regua" aria-hidden="true" />
        </footer>
      </article>
    </div>
  );
}
