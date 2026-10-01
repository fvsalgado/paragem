import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  concelhos,
  dadosAbertos,
  modo as lerModo,
  modos as lerModos,
  paragens as lerParagens,
  procura,
  exigirRegiao,
  url,
  urlRede,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import AbrirPeloEndereco from '@/componentes/AbrirPeloEndereco';
import { paragemMaisPerto } from '@/lib/onde';
import { emPortugues, percursoEmPortugues, pontoTecnico } from '@/lib/expressos';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao from '@/componentes/Transcricao';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
  ResumoDoSistema,
} from '@/componentes/DisponibilidadeBicicletas';
import type { HorarioDeModo, ModoDetalhe, PontoDeModo } from '@/lib/formato';
import PrecosDeExpresso from '@/componentes/PrecosDeExpresso';
import { disponibilidadeDaRegiao, expressosDaRegiao } from '@/lib/enderecos';
import { lista, plural } from '@/lib/prosa';

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

type Params = { regiao: string; modo: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { modo } = await params;
  return { title: NOME_DOS_MODOS[modo] ?? modo };
}

/** As coisas de um modo, agrupadas pelo concelho onde estão. */
function porConcelho<T extends { concelho: string | null }>(
  itens: T[],
  nomes: Map<string, string>,
): { id: string; nome: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    const k = i.concelho ?? 'fora-da-regiao';
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  return [...grupos.entries()]
    .map(([id, itens]) => ({ id, nome: nomes.get(id) ?? 'Fora da região', itens }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

/**
 * O que um modo tem, numa frase: «Há 3 estações na Serra da Pedra Alta.»
 *
 * Era «a Serra da Pedra Alta tem 3 estações», com o nome da região a abrir a
 * frase em minúscula — e «4 sítios levantados», que é a palavra de quem levanta os
 * dados e não a de quem os lê. E conta cada forma pelo seu nome: nos urbanos
 * municipais há linhas com horário E percursos só com traçado, e somá-los
 * como «7 linhas com horário» dizia que havia horário onde não há.
 */
function oQueHa(m: ModoDetalhe, em: string): string {
  const partes = [
    m.sistemas.length
      ? plural(
          m.sistemas.reduce((n, s) => n + s.estacoes.length, 0),
          'estação',
          'estações',
        )
      : '',
    m.horarios?.length ? plural(m.horarios.length, 'linha com horário', 'linhas com horário') : '',
    m.percursos.length
      ? plural(m.percursos.length, 'percurso conhecido', 'percursos conhecidos')
      : '',
    m.paragens.length ? plural(m.paragens.length, 'paragem', 'paragens') : '',
    m.pontos.length
      ? m.modo === 'taxi'
        ? plural(m.pontos.length, 'praça de táxis conhecida', 'praças de táxis conhecidas')
        : plural(m.pontos.length, 'local conhecido', 'locais conhecidos')
      : '',
  ].filter(Boolean);
  return partes.length ? `Há ${lista(partes)} ${em}.` : '';
}

/**
 * UM PONTO — uma praça de táxis, uma estação — e ONDE FICA.
 *
 * A lista das praças era oito vezes «Sem nome no mapa»: uma lista em que
 * todos os itens dizem o mesmo não ajuda ninguém a encontrar um táxi. Sem
 * nome, diz-se o que é; e diz-se onde está com o que os dados têm — a paragem
 * da rede mais perto, à distância medida (`lib/onde.ts`) — e com o mapa do
 * próprio sítio já nele. Não se inventa nome nenhum (§4.4).
 */
function Ponto({
  p,
  oQue,
  perto,
  noMapa,
}: {
  p: PontoDeModo;
  /** O que o ponto é, para quando não tem nome: «Praça de táxis». */
  oQue: string;
  perto: { nome: string; metros: number } | null;
  noMapa: string | null;
}) {
  return (
    <li className="ponto-de-modo">
      <span className="nome">{p.nome ?? oQue}</span>
      <span className="onde">
        {perto
          ? `Junto à paragem ${perto.nome}, a ${perto.metros} m.`
          : 'Sem paragem da rede por perto para servir de referência.'}
        {p.operador ? ` ${p.operador}.` : ''}
      </span>
      <span className="accoes">
        {noMapa && <a href={noMapa}>Ver no mapa</a>}
        {/* O telefone é uma ligação, e numa lista as ligações desenham-se
            numa linha sua. */}
        {p.telefone && <a href={`tel:${p.telefone}`}>Ligar {p.telefone}</a>}
      </span>
    </li>
  );
}

/**
 * Um modo de transporte que não tem catálogo próprio.
 *
 * **Porque é que esta página existe.** A grelha «Por modo» mostrava sete
 * cartões e quatro deles não levavam a lado nenhum: bicicletas, táxis,
 * urbanos municipais e expressos eram rótulos. Quem toca em «Bicicleta
 * partilhada» quer a estação mais perto, não a palavra.
 *
 * **E a página diz o que não sabe — numa frase, antes da lista, e por
 * inteiro no fim.** O que há de cada um destes modos é desigual: 82 estações
 * de bicicletas com coordenadas, e dos urbanos municipais só o traçado de
 * duas linhas. Pôr a falta só no fim, depois de uma lista bonita, era deixar
 * quem a lê supor que a lista está completa; pô-la toda à frente, em
 * vermelho, era abrir a porta pela cozinha — fontes e levantamentos antes das
 * praças e das linhas. A frase curta avisa; «Sobre estes dados» explica.
 */
export default async function Modo({ params }: { params: Promise<Params> }) {
  const { regiao: rid, modo: mid } = await params;
  const r = await exigirRegiao(rid);
  const m: ModoDetalhe | null = await lerModo(rid, mid);
  if (!m) notFound();

  const cs = await concelhos(rid);
  const nomes = new Map(cs.map((c) => [c.id, c.nome]));
  const nome = NOME_DOS_MODOS[mid] ?? mid;

  const pontos = porConcelho(m.pontos, nomes);
  const semNada = cs.filter((c) => !m.pontos.some((p) => p.concelho === c.id));

  // ONDE FICA CADA PONTO: a paragem da rede mais perto, e o mapa do sítio já
  // nele quando o ponto está no mapa (`/?ponto=<id>`).
  const ps = await lerParagens(rid);
  const noMapa = new Set((await procura(rid)).map((x) => x.id));
  const ondeFica = (p: PontoDeModo) => ({
    perto: paragemMaisPerto(p, ps),
    noMapa: p.id && noMapa.has(p.id) ? url(rid, `/?ponto=${encodeURIComponent(p.id)}`) : null,
  });

  // DE ONDE VEM ISTO, PELO NOME. A página acabava em «De onde vem isto:
  // osm-portugal.» — o identificador interno da fonte. O nome legível é o
  // que a página de dados abertos já mostra ao lado de cada ficheiro deste
  // modo; um modo sem ficheiros publicados fica só com a ligação para lá.
  const fontes = [
    ...new Set((await dadosAbertos(rid)).filter((x) => x.modo === mid).map((x) => x.fonte)),
  ].filter(Boolean);

  return (
    <>
      <h1>{nome}</h1>
      {/* «Quem gere:» e não «Gerido por»: os nomes vêm dos dados de quem opera
          — «Câmara Municipal de Pedra Alta», a marca de um operador de
          expressos — e nenhum traz o artigo. «Gerido por Câmara Municipal» é o
          que se lia. */}
      {m.gerido_por.length > 0 && (
        <p>
          Quem gere: {lista(m.gerido_por)}. {oQueHa(m, r.em)}
        </p>
      )}

      {/* O CONTEÚDO PRIMEIRO, A RESSALVA DEPOIS. A página abria com blocos
          de metodologia — dois deles no vermelho dos alertas —, e o que o
          modo tem (as praças, as linhas, as estações) só começava no segundo
          ecrã. A honestidade fica: numa frase aqui, por inteiro no fim, em
          «Sobre estes dados». O vermelho fica para o que mudou hoje. */}
      {m.operadores?.length ? (
        <p>
          <strong>Serviço de um operador privado:</strong> os títulos desta região não servem aqui,
          e os bilhetes compram-se ao operador.
        </p>
      ) : null}
      {(m.incompleto || m.notas.length > 0) && (
        <p className="secundario">
          {m.incompleto ? 'Esta lista está incompleta. ' : ''}
          <a href="#sobre-estes-dados">{m.incompleto ? 'Saber porquê' : 'Sobre estes dados'}</a>.
        </p>
      )}

      {/* --- os sistemas, com as estações por concelho ---

          Envolto no provedor de disponibilidade: quando há um serviço
          configurado, cada estação ganha a contagem ao vivo ao lado do nome, e
          cada sistema um retrato do momento. Sem serviço, isto não faz nada — a
          lista fica igual à de hoje, como a página funciona com o OTP em baixo.
          Só se monta quando há sistemas, para as páginas de táxi e urbanos não
          irem à rede à toa. */}
      {m.sistemas.length > 0 && (
        <DisponibilidadeBicicletas endereco={disponibilidadeDaRegiao(rid)}>
          {m.sistemas.map((s) => (
            <section key={s.id} aria-labelledby={`s-${s.id}`}>
              <h2 id={`s-${s.id}`}>{s.nome}</h2>
              <p>
                {s.operador && <>Quem gere: {s.operador}. </>}
                {plural(s.estacoes.length, 'estação', 'estações')}.
              </p>
              <ResumoDoSistema ids={s.estacoes.map((e) => e.id)} />
              {s.estado === 'por-confirmar' && (
                <p className="marca-dados">Estado do serviço por confirmar.</p>
              )}
              {porConcelho(s.estacoes, nomes).map((g) => (
                <section key={g.id} aria-labelledby={`s-${s.id}-${g.id}`}>
                  <h3 id={`s-${s.id}-${g.id}`}>
                    {g.nome} <span className="secundario">{g.itens.length}</span>
                  </h3>
                  <ul className="lista">
                    {g.itens.map((e) => (
                      <li key={`${e.lat},${e.lon}`}>
                        <span>
                          {e.nome ??
                            (() => {
                              const perto = paragemMaisPerto(e, ps);
                              return perto
                                ? `Estação junto à paragem ${perto.nome}`
                                : 'Estação sem nome no mapa';
                            })()}
                        </span>
                        <ContagemDaEstacao id={e.id} />
                      </li>
                    ))}
                  </ul>
                  {nomes.has(g.id) && (
                    <p className="cartao-accoes">
                      <Link href={urlRede(rid, `concelhos/${g.id}/`)}>Tudo em {g.nome}</Link>
                    </p>
                  )}
                </section>
              ))}
            </section>
          ))}
        </DisponibilidadeBicicletas>
      )}

      {/* --- OS HORÁRIOS, que são o que se procura numa paragem ---

          Vêm antes dos percursos e antes de tudo o resto que não seja o que
          falta: quem abre a página de um urbano municipal quer saber a que
          horas passa, e até aqui a resposta era «pergunte à câmara». */}
      {(m.horarios ?? []).map((h) => (
        <section key={h.id} aria-labelledby={`h-${h.id}`}>
          <h2 id={`h-${h.id}`}>{h.nome}</h2>
          <p className="secundario">
            {[
              h.operador,
              plural(h.paragens.length, 'paragem', 'paragens'),
              `${plural(h.viagens, 'viagem', 'viagens')} por dia`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {h.regras.map((regra) => (
            <p key={regra}>{regra}</p>
          ))}
          <ParagensNoMapa h={h} />
          {h.quadros.map((q, iq) => (
            <QuadroDeHorario key={iq} quadro={q} titulo={h.nome} />
          ))}
          <Transcricao por={h.transcrito_por} em={h.transcrito_em} de="do cartaz" />
        </section>
      ))}

      {/* --- os percursos, sem horário --- */}
      {m.percursos.length > 0 && (
        <section aria-labelledby="percursos">
          <h2 id="percursos">As linhas que se conhecem</h2>
          <ul className="lista">
            {m.percursos.map((p) => (
              <li key={p.nome}>
                <span>{p.nome}</span>
                <span className="secundario">
                  {[p.rede, p.operador].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- os pontos, por concelho, com os que não têm nenhum --- */}
      {m.pontos.length > 0 && (
        <section aria-labelledby="pontos">
          <h2 id="pontos">Onde estão</h2>
          {pontos.map((g) => (
            <section key={g.id} aria-labelledby={`p-${g.id}`}>
              <h3 id={`p-${g.id}`}>
                {g.nome}{' '}
                <span className="secundario">
                  ·{' '}
                  {mid === 'taxi'
                    ? plural(g.itens.length, 'praça', 'praças')
                    : plural(g.itens.length, 'local', 'locais')}
                </span>
              </h3>
              <ul className="pontos-de-modo">
                {g.itens.map((p) => (
                  <Ponto
                    key={`${p.lat},${p.lon}`}
                    p={p}
                    oQue={mid === 'taxi' ? 'Praça de táxis' : nome}
                    {...ondeFica(p)}
                  />
                ))}
              </ul>
            </section>
          ))}
          {semNada.length > 0 && (
            <p className="secundario">
              Ainda sem nenhuma registada: {semNada.map((c) => c.nome).join(', ')}. Não quer dizer
              que não haja — quer dizer que ainda não está no mapa de onde isto vem.
            </p>
          )}
        </section>
      )}

      {/* --- as paragens de um serviço de terceiro --- */}
      {m.paragens.length > 0 && (
        <section aria-labelledby="paragens">
          <h2 id="paragens">Onde param, e para onde vão</h2>
          {m.paragens.map((p) => (
            <section key={`${p.lat},${p.lon}`} aria-labelledby={`e-${p.lat}-${p.lon}`}>
              <h3 id={`e-${p.lat}-${p.lon}`}>
                {p.nome}
                {p.concelho && nomes.has(p.concelho) && (
                  <span className="secundario"> · {nomes.get(p.concelho)}</span>
                )}
              </h3>
              <ul className="lista">
                {/* A linha e o destino SEPARADOS: colados, o número da linha e
                    a primeira terra do destino liam-se como uma palavra só. */}
                {p.linhas.map((l) => (
                  <li key={l.nome}>
                    <span>{l.nome}</span>
                    {/* EM PORTUGUÊS, e sem os pontos técnicos do operador: o
                        feed escreve «Lisbon - Hub - Paris». */}
                    {l.destino && (
                      <span className="secundario"> · {percursoEmPortugues(l.destino)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {/* O QUE O HORÁRIO NÃO DIZ: o preço de hoje e se ainda há
                  lugar. Só aparece quando há serviço configurado e quando o
                  feed sabe para onde se vai daqui; sem isso, a lista acima
                  fica como está. */}
              {p.id && (
                <PrecosDeExpresso
                  base={expressosDaRegiao(rid)}
                  de={p.id}
                  nomeDaParagem={p.nome}
                  destinos={(p.destinos ?? [])
                    .filter((d) => !pontoTecnico(d.nome))
                    .map((d) => ({ ...d, nome: emPortugues(d.nome) }))
                    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))}
                />
              )}
            </section>
          ))}
        </section>
      )}

      {m.operadores?.length ? (
        <section aria-labelledby="bilhetes">
          <h2 id="bilhetes">Bilhetes</h2>
          <p>
            Os títulos desta região não servem aqui. Os bilhetes compram-se ao operador.
            {m.operadores.map((o) =>
              o.bilhetes ? (
                <span key={o.nome}>
                  {' '}
                  <a href={o.bilhetes} rel="noreferrer">
                    {o.nome}
                  </a>
                </span>
              ) : null,
            )}
          </p>
        </section>
      ) : null}

      {/* SOBRE ESTES DADOS: o que antes abria a página. Fechado, no fim, e
          aberto por quem carregar em «Saber porquê» lá em cima. */}
      <section aria-labelledby="sobre" className="sobre-estes-dados">
        <AbrirPeloEndereco />
        <h2 id="sobre">Sobre estes dados</h2>
        <details id="sobre-estes-dados" className="lista-fechada">
          <summary>De onde vem isto, e o que falta</summary>
          {m.notas.map((n) => (
            <p key={n}>{n}</p>
          ))}
          {m.sistemas.some((s) => !s.disponibilidade_publica) && (
            <p>
              As bicicletas e as docas livres, quando aparecem, são lidas da página que o operador
              publica e vêm com a hora da leitura — o operador pode contá-las mal, e por isso
              mostra-se quando foram vistas e não se promete mais do que isso. Falta um feed de
              dados próprio do sistema; até lá, se a leitura envelhecer ou o serviço estiver em
              baixo, a página mostra só onde estão as estações.
            </p>
          )}
          <p>
            {fontes.length > 0 ? <>Fontes: {lista(fontes)}. </> : null}
            As licenças e os ficheiros estão em{' '}
            <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>, e o que falta está no
            relatório de lacunas da mesma página.
          </p>
        </details>
        <p className="cartao-accoes">
          <Link href={urlRede(rid)}>Voltar à rede</Link>
        </p>
      </section>
    </>
  );
}

/**
 * Quantas paragens desta linha se sabe ONDE ficam — e quais é que não.
 *
 * O cartaz da câmara dá o nome da paragem e a hora, nunca a coordenada. O
 * pipeline vai procurá-la ao OpenStreetMap e ao feed da rede, e o que não
 * encontra FICA POR ENCONTRAR: não se estima, não se aproxima, não se põe no
 * centro da vila (CLAUDE.md §4.4). Uma paragem no sítio errado manda alguém
 * esperar na berma errada, e isso é pior do que não a mostrar.
 *
 * Nomear as que faltam não é confessar uma falha — é o pedido concreto. Quem
 * mapeia no OpenStreetMap, ou quem na câmara tem a lista, abre isto e sabe
 * exatamente o que falta. Um número sozinho não se conserta.
 */
function ParagensNoMapa({ h }: { h: HorarioDeModo }) {
  const postas = Object.keys(h.coordenadas ?? {}).length;
  const faltam = h.sem_coordenada ?? [];
  if (postas === 0 && faltam.length === 0) return null;

  const onde =
    postas === 0
      ? 'Nenhuma paragem desta linha está no mapa'
      : `${postas} ${postas === 1 ? 'paragem está' : 'paragens estão'} no mapa`;
  const resto =
    faltam.length === 0
      ? ', e é a linha toda'
      : `; ${faltam.length === 1 ? 'a outra tem hora e não tem sítio' : `as outras ${faltam.length} têm hora e não têm sítio`}`;

  return (
    <>
      <p className="secundario">
        {onde}
        {resto}.
      </p>
      {faltam.length > 0 && (
        <details className="lista-fechada">
          <summary>{faltam.length === 1 ? 'A que falta' : 'As que faltam'}</summary>
          <p>
            O cartaz dá o nome e a hora, nunca a coordenada. Estas ainda não estão no OpenStreetMap
            nem no feed da rede, e não se inventou nenhuma: uma paragem no sítio errado manda alguém
            esperar na berma errada.
          </p>
          <ul className="lista">
            {faltam.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
