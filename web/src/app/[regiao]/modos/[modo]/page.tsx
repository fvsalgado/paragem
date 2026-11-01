import Link from '@/componentes/Ligacao';
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
  tarifas as lerTarifas,
  url,
  urlRede,
  NOME_DOS_MODOS,
  regiao,
  NAO_ENCONTRADA,
  temMosaicos,
} from '@/lib/dados';
import { metadadosDaRegiao } from '@/lib/metadados';
import AbrirPeloEndereco from '@/componentes/AbrirPeloEndereco';
import { paragemMaisPerto } from '@/lib/onde';
import { emPortugues, percursoEmPortugues, pontoTecnico } from '@/lib/expressos';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao, { DataDoDocumento } from '@/componentes/Transcricao';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
  ResumoDoSistema,
} from '@/componentes/DisponibilidadeBicicletas';
import type {
  HorarioDeModo,
  ModoDetalhe,
  PontoDeModo,
  SistemaDeBicicletas,
  Titulo,
} from '@/lib/formato';
import PrecosDeExpresso from '@/componentes/PrecosDeExpresso';
import { disponibilidadeDaRegiao, expressosDaRegiao } from '@/lib/enderecos';
import Distintivo from '@/componentes/Distintivo';
import { aRede, lista, nomeDaRede, plural, regraLegivel, semPrefixos } from '@/lib/prosa';
import { percursosSemHorario, regrasENotas } from '@/lib/pagina-do-modo';

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

/**
 * O que cada página de modo tem, numa frase para a pré-visualização. Os modos
 * que não estão aqui dizem só o nome e onde — e a frase não promete o que a
 * página de um modo novo ainda não sabe mostrar.
 */
const O_QUE_O_MODO_TEM: Record<string, (em: string) => string> = {
  bicicleta: (em) =>
    `As bicicletas partilhadas ${em}: onde estão as estações, e quem gere cada sistema.`,
  taxi: (em) => `As praças de táxi ${em}, concelho a concelho.`,
  'urbano-municipal': (em) => `Os autocarros urbanos ${em}: as linhas, os horários e quem os gere.`,
  expresso: (em) => `Os expressos que param ${em}: onde param, para onde vão e quem os opera.`,
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { regiao: rid, modo } = await params;
  const [m, r] = await Promise.all([lerModo(rid, modo), regiao(rid)]);
  if (!m || !r) return { title: NAO_ENCONTRADA };
  const nome = NOME_DOS_MODOS[modo] ?? modo;
  return metadadosDaRegiao(r, {
    titulo: nome,
    descricao: O_QUE_O_MODO_TEM[modo]?.(r.em) ?? `${nome} ${r.em}.`,
    caminho: url(rid, `modos/${modo}/`),
  });
}

/**
 * As coisas de um modo, agrupadas pelo concelho onde estão.
 *
 * O QUE NÃO TEM CONCELHO NÃO ESTÁ FORA DA REGIÃO, a menos que a carta
 * administrativa o diga. Sem carta, o concelho de um ponto é o da paragem da
 * rede mais perto, e o que não tem paragem perto fica por atribuir — e a
 * página das bicicletas da demonstração punha a estação ao lado do terminal
 * «Fora da região» (P2-032). Dados de antes da bandeira continuam a dizer o
 * que diziam.
 */
function porConcelho<T extends { concelho: string | null }>(
  itens: T[],
  nomes: Map<string, string>,
  semConcelho: string,
): { id: string; nome: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const i of itens) {
    const k = i.concelho ?? 'sem-concelho';
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  return [...grupos.entries()]
    .map(([id, itens]) => ({ id, nome: nomes.get(id) ?? semConcelho, itens }))
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
    m.urbanos_da_rede?.length
      ? plural(
          m.urbanos_da_rede.reduce((n, u) => n + u.linhas.length, 0),
          'linha urbana da rede',
          'linhas urbanas da rede',
        )
      : '',
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

  const semConcelho = r.concelhos_pela_carta === false ? 'Concelho por atribuir' : 'Fora da região';
  const pontos = porConcelho(m.pontos, nomes, semConcelho);
  const semNada = cs.filter((c) => !m.pontos.some((p) => p.concelho === c.id));

  // ONDE FICA CADA PONTO: a paragem da rede mais perto, e o mapa do sítio já
  // nele quando o ponto está no mapa (`/?ponto=<id>`).
  const ps = await lerParagens(rid);
  // Só onde há mapa: numa região sem mosaicos o início não tem mapa onde abrir.
  const noMapa = new Set((await temMosaicos(rid)) ? (await procura(rid)).map((x) => x.id) : []);
  const ondeFica = (p: Pick<PontoDeModo, 'id' | 'lat' | 'lon'>) => ({
    perto: paragemMaisPerto(p, ps),
    noMapa: p.id && noMapa.has(p.id) ? url(rid, `/?ponto=${encodeURIComponent(p.id)}`) : null,
  });

  // DE ONDE VEM ISTO, PELO NOME. A página acabava em «De onde vem isto:
  // osm-portugal.» — o identificador interno da fonte. O nome legível é o
  // que a página de dados abertos já mostra ao lado de cada ficheiro deste
  // modo; um modo sem ficheiros publicados fica só com a ligação para lá.
  const descargas = await dadosAbertos(rid);
  const fontes = [...new Set(descargas.filter((x) => x.modo === mid).map((x) => x.fonte))].filter(
    Boolean,
  );
  // O QUE FALTA ESTÁ NO RELATÓRIO DA CONSTRUÇÃO, que se descarrega dos dados
  // abertos — a página deixou de publicar a lista em bruto (1/11/2026).
  const comRelatorio = descargas.some((x) => x.grupo === 'relatorios');

  // QUANTO CUSTA CADA SISTEMA DE BICICLETAS, do tarifário: os títulos cuja
  // rede tem o nome do sistema. A página não dizia o preço, e ele estava no
  // tarifário sem ligação daqui (auditoria de 1/11/2026).
  const titulos = m.sistemas.length ? (await lerTarifas(rid)).titulos : [];
  const moeda = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  // Os percursos que já têm horário na página não se repetem em baixo.
  const percursos = percursosSemHorario(m.percursos, m.horarios ?? []);

  return (
    <>
      <h1>{nome}</h1>
      {/* «Quem gere:» e não «Gerido por»: os nomes vêm dos dados de quem opera
          — «Câmara Municipal de Pedra Alta», a marca de um operador de
          expressos — e nenhum traz o artigo. «Gerido por Câmara Municipal» é o
          que se lia. */}
      {(m.gerido_por.length > 0 || oQueHa({ ...m, percursos }, r.em)) && (
        <p>
          {m.gerido_por.length > 0 && <>Quem gere: {lista(m.gerido_por)}. </>}
          {oQueHa({ ...m, percursos }, r.em)}
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

      {/* --- OS URBANOS QUE A REDE OPERA, no topo ---

          O urbano de uma cidade pode ser da concessão e não da câmara — com
          número de linha no caderno, como as outras. Quem vem aqui à procura
          do urbano da sua cidade não o encontrava, porque as linhas dele estão
          no catálogo da rede. Diz-se quais são, de que concelho, e leva-se
          para as linhas, que é onde têm as paragens e os horários. São os que
          a região declara (`rede.urbanos`), e não adivinhados pelo nome. */}
      {m.urbanos_da_rede?.length ? (
        <section aria-labelledby="urbanos-da-rede">
          <h2 id="urbanos-da-rede">Urbanos da {nomeDaRede(r)}</h2>
          <p>
            Fazem parte d{aRede(r)}, como as outras linhas: cada uma tem página própria, com as
            paragens e os horários.
          </p>
          {m.urbanos_da_rede.map((u, i) => (
            <section key={u.nome} aria-labelledby={`urbano-da-rede-${i}`}>
              <h3 id={`urbano-da-rede-${i}`}>
                {u.nome}
                {nomes.has(u.concelho) && (
                  <span className="secundario"> · {nomes.get(u.concelho)}</span>
                )}
              </h3>
              <ul className="linhas-do-concelho">
                {u.linhas.map((l) => (
                  <li key={l.id}>
                    <Link href={urlRede(rid, `linhas/${l.id}/`)}>
                      <Distintivo codigo={l.codigo} cor={l.cor} tamanho="medio" />
                      <span>{l.nome}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      ) : null}

      {/* --- os sistemas, com as estações por concelho ---

          Envolto no provedor de disponibilidade: quando há um serviço
          configurado, cada estação ganha a contagem ao vivo ao lado do nome, e
          cada sistema um retrato do momento. Sem serviço, isto não faz nada — a
          lista fica igual à de hoje, como a página funciona com o OTP em baixo.
          Só se monta quando há sistemas, para as páginas de táxi e urbanos não
          irem à rede à toa. */}
      {m.sistemas.length > 0 && (
        <DisponibilidadeBicicletas endereco={disponibilidadeDaRegiao(rid, r.demonstracao)}>
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
              <ComoSeUsa
                s={s}
                precos={titulos.filter((t) => t.rede === s.nome && typeof t.valor === 'number')}
                formatar={(v) => (v === 0 ? 'grátis' : moeda.format(v))}
                tarifario={urlRede(rid, 'tarifario/')}
              />
              {porConcelho(s.estacoes, nomes, semConcelho).map((g) => (
                <section key={g.id} aria-labelledby={`s-${s.id}-${g.id}`}>
                  <h3 id={`s-${s.id}-${g.id}`}>
                    {g.nome}{' '}
                    <span className="secundario">
                      · {plural(g.itens.length, 'estação', 'estações')}
                    </span>
                  </h3>
                  {/* CADA ESTAÇÃO COMO AS PRAÇAS DE TÁXIS: o nome, onde fica,
                      a contagem numa linha sua e o mapa já nela. Eram texto
                      solto — não abriam nada nem diziam onde ficavam —, e a
                      contagem partia a linha aos bocados («· 8» numa linha,
                      «docas» na seguinte). O nome sem o concelho e o sistema,
                      que o título já diz (auditoria de 1/11/2026). */}
                  <ul className="pontos-de-modo">
                    {g.itens.map((e) => {
                      const { perto, noMapa } = ondeFica(e);
                      return (
                        <li key={`${e.lat},${e.lon}`}>
                          <span className="nome">
                            {e.nome
                              ? semPrefixos(e.nome, [g.nome, s.nome])
                              : perto
                                ? `Estação junto à paragem ${perto.nome}`
                                : 'Estação sem nome no mapa'}
                          </span>
                          {e.nome && perto && (
                            <span className="onde">
                              Junto à paragem {perto.nome}, a {perto.metros} m.
                            </span>
                          )}
                          <ContagemDaEstacao id={e.id} emLinhaPropria />
                          {noMapa && (
                            <span className="accoes">
                              <a href={noMapa}>
                                Ver no mapa
                                <span className="so-para-leitores">
                                  : {e.nome ? semPrefixos(e.nome, [g.nome, s.nome]) : 'a estação'}
                                </span>
                              </a>
                            </span>
                          )}
                        </li>
                      );
                    })}
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
          <RegrasDoCartaz regras={h.regras} />
          {h.quadros.map((q, iq) => (
            <QuadroDeHorario key={iq} quadro={q} titulo={h.nome} />
          ))}
          {/* O HORÁRIO PRIMEIRO, e o que falta no mapa depois, em segundo
              plano: entre as regras e o horário, «As que faltam» tinha o
              mesmo peso do horário, e quem procurava as horas abria o errado
              (auditoria de 1/11/2026). */}
          <ParagensNoMapa h={h} />
          <DataDoDocumento conteudo={h.conteudo_de} documento="o cartaz" />
          <Transcricao por={h.transcrito_por} em={h.transcrito_em} de="do cartaz" />
        </section>
      ))}

      {/* --- os percursos, sem horário --- */}
      {/* SÓ OS QUE NÃO TÊM HORÁRIO MAIS ACIMA (`percursosSemHorario`): os
          outros repetiam a secção inteira de cima, com o nome colado à rede
          (os dois `span` sem espaço). Cada linha com o desenho das listas com ligação:
          o nome à esquerda, a rede à direita. */}
      {percursos.length > 0 && (
        <section aria-labelledby="percursos">
          <h2 id="percursos">
            {m.horarios?.length ? 'Outras linhas que se conhecem' : 'As linhas que se conhecem'}
          </h2>
          <ul className="lista">
            {percursos.map((p) => (
              <li key={p.nome}>
                <span className="sem-ligacao">
                  <span>{p.nome}</span>
                  <span className="secundario">
                    {[p.rede, p.operador].filter(Boolean).join(' · ')}
                  </span>
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
                {/* A TERRA EM PORTUGUÊS, com os acentos que o feed lhe tira
                    («Fatima»); o resto do nome fica como o operador o escreve. */}
                {emPortugues(p.nome)}
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
                  base={expressosDaRegiao(rid, r.demonstracao)}
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

      {/* OS QUE CIRCULAM AQUI E NÃO PUBLICAM DADOS ABERTOS: não há horário
          que se mostre, e não se inventa — mas quem procura o expresso que
          conhece e não o vê conclui que o sítio está incompleto. Num cartão
          neutro, como os serviços privados (§6). */}
      {m.sem_dados?.length ? (
        <section aria-labelledby="sem-dados">
          <h2 id="sem-dados">Também {r.em}</h2>
          {m.sem_dados.map((x) => (
            <div key={x.nome} className="cartao-neutro">
              <p>
                <strong>{x.nome}</strong> também tem serviço {r.em}, e não publica dados abertos:
                por isso não aparece nas listas desta página nem no planeador. Os horários e os
                bilhetes estão no sítio do operador:{' '}
                <a href={x.url} rel="noreferrer">
                  {new URL(x.url).hostname.replace(/^www\./, '')}
                </a>
                .
              </p>
            </div>
          ))}
        </section>
      ) : null}

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
            <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>
            {comRelatorio
              ? ', e o que falta, no relatório da última construção, que se descarrega de lá'
              : ''}
            .
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
  const total = postas + faltam.length;

  // EM SEGUNDO PLANO, depois do horário: uma frase secundária e a lista
  // fechada num resumo discreto — e não um acordeão a negrito igual ao do
  // horário (auditoria de 1/11/2026).
  return (
    <>
      <p className="secundario">
        {postas === 0
          ? 'Nenhuma paragem desta linha está no mapa.'
          : faltam.length === 0
            ? `${plural(postas, 'paragem está', 'paragens estão')} no mapa, e é a linha toda.`
            : `${postas} de ${plural(total, 'paragem está', 'paragens estão')} no mapa.`}
      </p>
      {faltam.length > 0 && (
        <details className="lista-fechada discreta">
          <summary>
            {faltam.length === 1
              ? '1 paragem ainda sem localização no mapa'
              : `${faltam.length} paragens ainda sem localização no mapa`}
          </summary>
          <p className="secundario">
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

/**
 * As regras do cartaz, escritas como o resto do sítio (`regraLegivel`), e as
 * NOTAS NUMERADAS à parte (`regrasENotas`): «(1) Realiza-se apenas no período
 * escolar» é a legenda de uma marca que o cartaz põe em algumas viagens, e a
 * marca não passou para a tabela. Solta no meio das regras, lia-se como se
 * valesse para a linha toda.
 */
function RegrasDoCartaz({ regras }: { regras: string[] }) {
  const { regras: daLinha, notas } = regrasENotas(regras);
  return (
    <>
      {daLinha.map((regra) => (
        <p key={regra}>{regraLegivel(regra)}</p>
      ))}
      {notas.length > 0 && (
        <>
          <p className="secundario">
            O cartaz marca algumas viagens com estas notas; a que viagens se aplica cada uma está no
            cartaz, e ainda não nesta tabela:
          </p>
          <ul className="notas-do-cartaz">
            {notas.map((n) => (
              <li key={n}>{regraLegivel(n)}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/**
 * COMO SE USA UM SISTEMA DE BICICLETAS, no topo dele: onde se desbloqueia, o
 * que custa e para onde ir saber mais. A página listava as estações e não
 * dizia nada disto — o preço estava no tarifário, sem ligação daqui
 * (auditoria de 1/11/2026). Só o que a região declara: a frase da receita, o
 * sítio do sistema e os títulos do tarifário com o nome dele.
 */
function ComoSeUsa({
  s,
  precos,
  formatar,
  tarifario,
}: {
  s: SistemaDeBicicletas;
  precos: Titulo[];
  formatar: (v: number) => string;
  tarifario: string;
}) {
  if (!s.como_usar && !s.sitio && precos.length === 0) return null;
  return (
    <div className="como-se-usa">
      <h3>Como se usa</h3>
      {s.como_usar && <p>{s.como_usar}</p>}
      {precos.length > 0 && (
        <ul>
          {precos.map((t) => (
            <li key={t.id}>
              {t.nome}: <span className="preco-em-linha">{formatar(t.valor!)}</span>
              {!t.confirmado && (
                <>
                  {' '}
                  <span className="por-confirmar">por confirmar</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="cartao-accoes">
        {precos.length > 0 && <Link href={tarifario}>Ver o tarifário</Link>}
        {s.sitio && (
          <a href={s.sitio} rel="noreferrer">
            Sítio do {s.nome}
          </a>
        )}
      </p>
    </div>
  );
}
