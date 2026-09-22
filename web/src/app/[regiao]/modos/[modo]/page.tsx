import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  concelhos,
  modo as lerModo,
  modos as lerModos,
  exigirRegiao,
  url,
  urlRede,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao from '@/componentes/Transcricao';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
  ResumoDoSistema,
} from '@/componentes/DisponibilidadeBicicletas';
import type { HorarioDeModo, ModoDetalhe, PontoDeModo } from '@/lib/formato';
import PrecosDeExpresso from '@/componentes/PrecosDeExpresso';
import { disponibilidadeDaRegiao, expressosDaRegiao } from '@/lib/enderecos';

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

function Ponto({ p }: { p: PontoDeModo }) {
  return (
    <li>
      <span>{p.nome ?? 'Sem nome no mapa'}</span>
      {p.telefone ? (
        <a href={`tel:${p.telefone}`}>{p.telefone}</a>
      ) : (
        <span className="secundario">{p.operador ?? ''}</span>
      )}
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
 * **E a página diz o que não sabe, primeiro.** O que há de cada um destes
 * modos é desigual: 82 estações de bicicletas com coordenadas, e dos urbanos
 * municipais só o traçado de duas linhas — sem paragens e sem horas. Pôr a
 * falta no fim, depois de uma lista bonita, é deixar quem a lê supor que a
 * lista está completa. Vai antes.
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

  return (
    <>
      <h1>{nome}</h1>
      {m.gerido_por.length > 0 && (
        <p>
          Gerido por {m.gerido_por.join(', ')}. {r.nome_com_artigo} tem {m.quantos}{' '}
          {m.sistemas.length
            ? 'estações'
            : m.horarios?.length
              ? 'linhas levantadas'
              : m.percursos.length
                ? 'percursos levantados'
                : 'sítios levantados'}
          .
        </p>
      )}

      {/* O QUE FALTA VEM ANTES DO QUE HÁ. */}
      {(m.incompleto || m.notas.length > 0) && (
        <section aria-labelledby="falta">
          <h2 id="falta" className="so-para-leitores">
            O que falta saber
          </h2>
          <div className={`faixa${m.incompleto ? ' alerta' : ''}`}>
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
          </div>
        </section>
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
                {s.operador && <>Gerido por {s.operador}. </>}
                {s.estacoes.length} estações.
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
                        <span>{e.nome ?? 'Sem nome no mapa'}</span>
                        <ContagemDaEstacao id={e.id} />
                      </li>
                    ))}
                  </ul>
                  {nomes.has(g.id) && (
                    <p>
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
            {[h.operador, `${h.paragens.length} paragens`, `${h.viagens} viagens por dia`]
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
                {g.nome} <span className="secundario">{g.itens.length}</span>
              </h3>
              <ul className="lista">
                {g.itens.map((p) => (
                  <Ponto key={`${p.lat},${p.lon}`} p={p} />
                ))}
              </ul>
            </section>
          ))}
          {semNada.length > 0 && (
            <p>
              Sem nenhuma levantada: {semNada.map((c) => c.nome).join(', ')}. Quer dizer que não
              está no mapa de onde isto vem — não que não exista.
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
                {p.linhas.map((l) => (
                  <li key={l.nome}>
                    <span>{l.nome}</span>
                    <span className="secundario">{l.destino}</span>
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
                  destinos={p.destinos ?? []}
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

      <section aria-labelledby="donde">
        <h2 id="donde">De onde vem isto</h2>
        <p>
          {m.fontes.join(', ')}. As licenças e os ficheiros estão em{' '}
          <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>, e o que falta está no
          relatório de lacunas da mesma página.
        </p>
        <p>
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
        <details>
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
