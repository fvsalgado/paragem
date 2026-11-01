import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import {
  exigirModo,
  horaLegivel,
  linhaDetalhe,
  linhas as linhasDaRegiao,
  paragens as paragensDaRegiao,
  temMosaicos,
  quadrosDeHoje,
  urlDaParagem,
  url,
  NAO_ENCONTRADA,
  type PontaDoSentido,
  type Sentido,
  type ViagemDoQuadro,
  regiao,
  urlRede,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import { AvisosDaPagina } from '@/componentes/Avisos';
import { avisosDaLinha, catalogoDosAvisos } from '@/lib/avisos-do-sitio';
import { lista, numero, plural } from '@/lib/prosa';
import Distintivo, { corDoTraco } from '@/componentes/Distintivo';
import EsquemaDaLinha from '@/componentes/EsquemaDaLinha';
import { traco } from '@/lib/cor';
import QuadrosPorDia, { type QuadroDoDia } from '@/componentes/QuadrosPorDia';
import { metadadosDaRegiao } from '@/lib/metadados';
import { cartaoDaLinha } from '@/lib/partilha';
import { feedsDosServicos } from '@/lib/formato';
import { pontas, pontasDaLinha, soPontosDeHorario, tituloDoSentido } from '@/lib/sentidos';

/**
 * VAZIO DE PROPÓSITO, E NÃO SE APAGA. Sem `generateStaticParams`, o Next trata
 * uma rota com segmento dinâmico como DINÂMICA: rende-a a cada pedido e manda
 * `no-store`. Com a função a devolver uma lista vazia, a rota é «estática com
 * caminhos a pedido»: a primeira visita rende e guarda, as seguintes servem a
 * cópia, até ao `revalidate` ou ao sinal do pipeline. Medido antes de escrever
 * isto — com a função apagada, `Cache-Control: private, no-cache, no-store`
 * em todas as páginas de região.
 */
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
  const [l, r] = await Promise.all([linhaDetalhe(rid, id), regiao(rid)]);
  if (!l || !r) return { title: NAO_ENCONTRADA };
  return metadadosDaRegiao(r, {
    titulo: `${l.codigo} — ${l.nome}`,
    descricao: `Linha ${l.codigo}, ${l.nome}: ${plural(l.viagens, 'viagem', 'viagens')} no horário, o percurso e as paragens.`,
    caminho: urlRede(rid, `linhas/${id}/`),
    imagem: { url: cartaoDaLinha(id), alt: `Linha ${l.codigo}, ${l.nome}` },
  });
}

/** Até quantas paragens o percurso se mostra inteiro; num maior, quantas de cada ponta. */
const PERCURSO_INTEIRO = 14;
const PERCURSO_PONTAS = 5;

/**
 * «Terminal A (5 viagens), Terminal B (4) e Terminal C (2)». As
 * contas só quando há mais do que uma ponta; as que passam de três juntam-se
 * numa — uma urbana com cinco pontas de uma viagem cada era uma frase de
 * quatro linhas.
 */
function pontasEmTexto(ps: PontaDoSentido[]): string {
  if (ps.length === 1) return ps[0].nome;
  const nomeadas = ps
    .slice(0, 3)
    .map((p, i) => `${p.nome} (${i === 0 ? plural(p.viagens, 'viagem', 'viagens') : p.viagens})`);
  const resto = ps.slice(3);
  if (resto.length) {
    const viagens = resto.reduce((n, p) => n + p.viagens, 0);
    nomeadas.push(`mais ${plural(resto.length, 'paragem', 'paragens')} (${viagens})`);
  }
  return lista(nomeadas);
}

/**
 * O horário de um sentido, um quadro por tipo de dia — paragens nas linhas,
 * viagens nas colunas, como o horário de papel.
 *
 * Só as paragens com HORA MARCADA (`quadros.py`): as outras têm a hora
 * estimada por nós e estão no percurso, por baixo. Nas viagens em que a hora
 * de uma destas paragens é estimada, sai em itálico e diz-se ao leitor de
 * ecrã — o §4.4 não deixa que uma estimativa passe por hora publicada.
 */
function quadrosDoSentido(s: Sentido, titulo: string): QuadroDoDia[] {
  const q = s.quadro;
  if (!q || !q.paragens.length || !q.viagens.length) return [];
  const porDia = new Map<string, ViagemDoQuadro[]>();
  for (const v of q.viagens) {
    porDia.set(v.servico_nome, [...(porDia.get(v.servico_nome) ?? []), v]);
  }
  return [...porDia.entries()].map(([dia, viagens]) => {
    // A linha de uma paragem por onde nenhuma viagem deste dia passa não diz
    // nada neste quadro: sai.
    const linhas = q.paragens
      .map((p, i) => ({ ...p, i }))
      .filter(({ i }) => viagens.some((v) => v.horas[i]));
    const comEstimadas = viagens.some((v) => v.estimadas.length > 0);
    return {
      chave: dia,
      nome: dia,
      servicos: [...new Set(viagens.map((v) => v.servico_id))],
      contagem: viagens.length === 1 ? '1 viagem' : `${viagens.length} viagens`,
      conteudo: (
        <>
          <div
            className="rolar-na-horizontal quadro-da-linha"
            tabIndex={0}
            role="group"
            aria-label={`${titulo}, ${dia}`}
          >
            <table>
              <caption className="so-para-leitores">
                {titulo}, {dia}: as horas de cada viagem, paragem a paragem
              </caption>
              <thead>
                <tr>
                  <th scope="col">Paragem</th>
                  {viagens.map((v, j) => (
                    <th key={j} scope="col">
                      <span className="so-para-leitores">Viagem das </span>
                      {horaLegivel(v.horas.find(Boolean) ?? '').texto}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ id, nome, i }) => (
                  <tr key={`${id}-${i}`}>
                    <th scope="row">{nome}</th>
                    {viagens.map((v, j) => {
                      const hora = v.horas[i];
                      if (!hora) {
                        return (
                          <td key={j} className="nao-passa">
                            <span aria-hidden="true">—</span>
                            <span className="so-para-leitores">não passa</span>
                          </td>
                        );
                      }
                      const { texto, diaSeguinte } = horaLegivel(hora);
                      const estimada = v.estimadas.includes(i);
                      return (
                        <td key={j} className={estimada ? 'estimada' : undefined}>
                          {estimada && <span className="so-para-leitores">cerca das </span>}
                          {texto}
                          {diaSeguinte && (
                            <span className="so-para-leitores"> do dia seguinte</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {comEstimadas && (
            <p className="nota-do-quadro">
              <em>Em itálico</em>: hora estimada por nós entre duas horas do horário publicado.
            </p>
          )}
        </>
      ),
    };
  });
}

export default async function Linha({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const l = await linhaDetalhe(rid, id);
  if (!l) notFound();

  // A COR DA LINHA NO PERCURSO, com o contraste garantido: um fio amarelo-claro
  // num fundo claro não se via (`corDoTraco`).
  const cor = { '--cor-da-linha': corDoTraco(l.cor) } as CSSProperties;
  // OS AVISOS DESTA LINHA, antes do horário (P4-019): os que a nomeiam, os de
  // uma paragem do percurso, e os do modo dela. Quem abria a linha desviada
  // para ver a hora não sabia que ela estava desviada.
  const [avisos, catalogo, todasAsParagens, todasAsLinhas, comMapa] = await Promise.all([
    avisosDaLinha(rid, {
      id: l.id,
      modo: l.modo,
      paragens: l.sentidos.flatMap((s) => s.paragens.map((p) => p.id)),
    }),
    catalogoDosAvisos(rid),
    paragensDaRegiao(rid),
    linhasDaRegiao(rid),
    temMosaicos(rid),
  ]);
  const daParagem = new Map(todasAsParagens.map((p) => [p.id, p]));
  const onde = new Map(
    todasAsParagens
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => [p.id, [p.lat, p.lon] as [number, number]]),
  );
  // AS LIGAÇÕES DE CADA PARAGEM: as outras linhas que lá param, com o número
  // e a cor delas. É o que um esquema de rede diz em cada estação — e quem
  // está a meio do percurso quer saber onde pode mudar, sem abrir paragem a
  // paragem.
  const corDoCodigo = new Map<string, string | null>();
  for (const x of todasAsLinhas) if (!corDoCodigo.has(x.codigo)) corDoCodigo.set(x.codigo, x.cor);
  const ligacoesDe = (id: string) =>
    (daParagem.get(id)?.linhas ?? []).filter((c) => c !== l.codigo);
  // AS PARAGENS QUE UM AVISO NOMEIA, RISCADAS NO PERCURSO, e a levar ao aviso.
  // O aviso estava em cima e o percurso em baixo, e quem procurava a sua
  // paragem não sabia que era ela a afetada.
  const avisoDaParagem = new Map<string, string>();
  for (const a of avisos) for (const p of a.paragens) avisoDaParagem.set(p, a.id);
  const sentidos = await Promise.all(
    l.sentidos.map(async (s, i) => {
      const titulo = tituloDoSentido(s);
      const quadros = quadrosDoSentido(s, titulo);
      return {
        s,
        ancora: `sentido-${i + 1}`,
        titulo,
        quadros,
        hoje: await quadrosDeHoje(rid, quadros),
      };
    }),
  );

  const daLinha = pontasDaLinha(l.sentidos);

  return (
    <>
      <h1 className="titulo-da-linha">
        <Distintivo codigo={l.codigo} cor={l.cor} tamanho="grande" />{' '}
        <span className="nome-da-linha">{l.nome}</span>
      </h1>
      <p>
        {plural(l.viagens, 'viagem', 'viagens')} no horário.
        {/* «GERIDO POR …», que é o §1 por extenso: quem viaja não precisa de
          saber quem gere cada serviço para o encontrar, mas precisa de o saber
          para comprar o título certo. Só aparece nas linhas que NÃO são da
          rede da região — pô-lo em todas fazia da entidade o assunto, que é o
          contrário do que o briefing pede. */}
        {l.operador && (
          <>
            {' '}
            <span className="secundario">Quem gere: {l.operador}.</span>
          </>
        )}
      </p>
      {daLinha && (
        <p className="pontas-da-linha">
          {daLinha.pontas.join(' – ')}.
          {daLinha.maisComum && (
            <>
              {' '}
              <span className="secundario">
                {numero(daLinha.maisComum.viagens)} das {numero(daLinha.maisComum.de_total)} viagens
                fazem só {daLinha.maisComum.de} – {daLinha.maisComum.a}.
              </span>
            </>
          )}
        </p>
      )}
      <MarcaDeDados
        regiao={rid}
        modos={[l.modo]}
        feeds={feedsDosServicos(
          l.sentidos.flatMap((s) => (s.quadro?.viagens ?? []).map((v) => v.servico_id)),
        )}
      />
      <AvisosDaPagina avisos={avisos} catalogo={catalogo} titulo="Avisos nesta linha" />

      {/* Com dois sentidos, a página é comprida: o segundo começa depois do
          horário e do percurso do primeiro. Os dois à mão, logo em cima. */}
      {sentidos.length > 1 && (
        <nav aria-label="Sentidos desta linha" className="sentidos">
          <ul>
            {sentidos.map(({ ancora, titulo }) => (
              <li key={ancora}>
                <a href={`#${ancora}`}>{titulo}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {sentidos.map(({ s, ancora, titulo, quadros, hoje }, i) => {
        const ultima = s.paragens.length - 1;
        return (
          <section key={s.sentido} aria-labelledby={ancora}>
            <h2 id={ancora}>{titulo}</h2>
            {/* DE ONDE PARTEM E ATÉ ONDE VÃO, DE VERDADE, com as contas: há
                sentidos em que as viagens não começam todas no mesmo sítio, e
                o título só diz o destino mais comum. */}
            <dl className="pontas-do-sentido">
              <dt>De</dt>
              <dd>{pontasEmTexto(pontas(s).origens)}</dd>
              <dt>Até</dt>
              <dd>{pontasEmTexto(pontas(s).destinos)}</dd>
            </dl>
            <p className="secundario">{plural(s.viagens, 'viagem', 'viagens')} neste sentido.</p>
            <EsquemaDaLinha
              sentidos={l.sentidos.map((x) => x.paragens)}
              qual={i}
              onde={onde}
              cor={traco(l.cor) ?? '#0a5c7a'}
              codigo={l.codigo}
              noMapa={
                comMapa ? (paragemId) => url(rid, `/?ponto=${encodeURIComponent(paragemId)}`) : null
              }
            />

            {/* NUM ECRÃ LARGO, O HORÁRIO E O PERCURSO LADO A LADO (P1-014). Era
                uma coluna de 608 px num ecrã de 1440, com 400 px vazios de
                cada lado e o percurso a começar depois do último quadro. */}
            <div className="em-colunas horario-e-percurso">
              <div className="coluna-principal">
                <h3 className="parte-do-sentido">Horário</h3>
                {quadros.length > 0 ? (
                  <QuadrosPorDia
                    regiao={rid}
                    quadros={quadros}
                    noServidor={hoje}
                    semHoje="esta linha não tem viagens neste sentido"
                  />
                ) : (
                  // DADOS DE ANTES DO HORÁRIO DA LINHA: diz-se onde estão as
                  // horas, em vez de deixar a secção vazia a parecer que não há.
                  <p>
                    As horas desta linha estão nas páginas de cada paragem do percurso, aqui em
                    baixo.
                  </p>
                )}
              </div>

              <div className="coluna-lateral">
                <h3 className="parte-do-sentido">Percurso</h3>
                {soPontosDeHorario(s, l.sentidos) && (
                  <p className="faixa informacao so-pontos">
                    Neste sentido só se conhecem as paragens com hora marcada no horário da
                    operadora. As do caminho entre elas não estão nos dados — no sentido contrário
                    estão — e não se inventam.
                  </p>
                )}
                {s.variantes > 1 && (
                  <p className="secundario">
                    {s.variantes} percursos diferentes neste sentido. Mostra-se o mais servido (
                    {plural(s.viagens_deste_percurso, 'viagem', 'viagens')}) — há viagens que não
                    param em todas estas paragens.
                  </p>
                )}
                {/* O PERCURSO DESENHADO NA COR DA LINHA, como nos mapas de rede:
                um fio com um nó por paragem, cheio nas pontas. Era uma lista
                numerada, com o número de ordem à direita a fazer de ruído, e
                a cor da linha não aparecia em lado nenhum além do distintivo. */}
                {/* O PERCURSO COMPRIDO ENCOLHE PELO MEIO (#95): as primeiras e as
                    últimas paragens à vista, e as do meio num botão. Num ecrã
                    largo, o horário acabava aos 1 180 px e o percurso descia
                    mais 2 500, ao lado de uma coluna vazia. */}
                {(() => {
                  const item = (p: { id: string; nome: string }, i: number) => {
                    const ligacoes = ligacoesDe(p.id);
                    const aviso = avisoDaParagem.get(p.id);
                    const classes = [
                      i === 0 ? 'ponta primeira' : i === ultima ? 'ponta ultima' : '',
                      aviso ? 'afetada' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <li key={`${p.id}-${i}`} className={classes || undefined}>
                        <Link href={urlDaParagem(rid, p.id)}>
                          <span className="nome-no-percurso">{p.nome}</span>
                          {ligacoes.length > 0 && (
                            <span className="ligacoes-da-paragem">
                              <span className="so-para-leitores">
                                ,{' '}
                                {ligacoes.length === 1 ? 'também a linha' : 'também as linhas'}{' '}
                              </span>
                              {ligacoes.slice(0, 5).map((c) => (
                                <Distintivo key={c} codigo={c} cor={corDoCodigo.get(c)} />
                              ))}
                              {ligacoes.length > 5 && (
                                <span className="secundario">+{ligacoes.length - 5}</span>
                              )}
                            </span>
                          )}
                        </Link>
                        {aviso && (
                          <a className="aviso-no-percurso" href={`#aviso-${aviso}`}>
                            Aviso<span className="so-para-leitores"> sobre esta paragem</span>
                          </a>
                        )}
                      </li>
                    );
                  };
                  const todas = s.paragens.map((p, i) => ({ p, i }));
                  if (todas.length <= PERCURSO_INTEIRO) {
                    return (
                      <ol className="percurso-da-linha" style={cor}>
                        {todas.map(({ p, i }) => item(p, i))}
                      </ol>
                    );
                  }
                  const inicio = todas.slice(0, PERCURSO_PONTAS);
                  const meio = todas.slice(PERCURSO_PONTAS, -PERCURSO_PONTAS);
                  const fim = todas.slice(-PERCURSO_PONTAS);
                  return (
                    <>
                      <ol className="percurso-da-linha" style={cor}>
                        {inicio.map(({ p, i }) => item(p, i))}
                      </ol>
                      <details className="meio-do-percurso" style={cor}>
                        <summary>
                          Mais {plural(meio.length, 'paragem', 'paragens')} pelo meio
                        </summary>
                        <ol className="percurso-da-linha" start={PERCURSO_PONTAS + 1}>
                          {meio.map(({ p, i }) => item(p, i))}
                        </ol>
                      </details>
                      <ol
                        className="percurso-da-linha"
                        style={cor}
                        start={todas.length - PERCURSO_PONTAS + 1}
                      >
                        {fim.map(({ p, i }) => item(p, i))}
                      </ol>
                    </>
                  );
                })()}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
