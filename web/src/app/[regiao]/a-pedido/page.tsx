import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import { aPedido, dadosAbertos, exigirRegiao, url, urlRede, regiao } from '@/lib/dados';
import ProcurarTerra from '@/componentes/ProcurarTerra';
import AbrirPeloEndereco from '@/componentes/AbrirPeloEndereco';
import {
  aPedidoPorConcelho,
  caminhoDoHorario,
  horariosDaZona,
  idDoQuadro,
  indiceDasTerras,
  reservaOnlineDaZona,
} from '@/lib/a-pedido';
import { lista, nomeDoSistema, plural, semPrefixos } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  return metadadosDaRegiao(r, {
    titulo: 'Transporte a pedido',
    descricao: `O transporte a pedido ${r.em}: as zonas, os circuitos e como reservar.`,
    caminho: '/a-pedido/',
  });
}

/**
 * O transporte a pedido, por inteiro.
 *
 * É o modo que mais falta a quem vive fora das vilas — boa parte das
 * freguesias desta região não tem carreira regular nenhuma — e o que menos
 * aparece em qualquer lado. Até aqui era um parágrafo dentro da página da
 * rede.
 *
 * **A ORDEM DESTA PÁGINA É DELIBERADA**, e não é a ordem em que os dados
 * existem. Começa pela regra de reserva, porque um serviço a pedido não
 * circula se ninguém o chamar: quem não sabe que tem de ligar na véspera fica
 * na paragem à espera de um autocarro que nunca foi pedido. O horário — que
 * ainda não temos — viria depois disso mesmo se o tivéssemos.
 *
 * E diz o que não sabe, com a precisão que a fonte permite. São três coisas
 * diferentes e a página escreve-as como três, em vez de mostrar uma lista
 * curta como se fosse a lista toda: que zonas existem, que circuitos existem,
 * e a que horas passa cada um. A do meio — qual circuito serve qual zona — é a
 * que continua mais por levantar.
 */
export default async function APedido({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const d = await aPedido(rid);
  if (!d) notFound();

  const { reservas: v } = d;
  // O TÍTULO DE CADA GRUPO DE HORÁRIOS É O CONCELHO — e quando o concelho tem
  // mais do que um, o nome do grupo. Eram cinco linhas iguais com o nome do
  // mesmo concelho, uma por circuito, e nenhuma dizia qual era.
  const porConcelho = new Map<string, number>();
  for (const h of d.horarios) {
    if (h.concelho_nome)
      porConcelho.set(h.concelho_nome, (porConcelho.get(h.concelho_nome) ?? 0) + 1);
  }
  const tituloDoHorario = (h: (typeof d.horarios)[number]) =>
    !h.concelho_nome
      ? nomeDoSistema(h.nome)
      : h.circuito_de
        ? `${h.concelho_nome} — ${h.circuito_de}`
        : (porConcelho.get(h.concelho_nome) ?? 0) > 1
          ? nomeDoSistema(h.nome)
          : h.concelho_nome;
  const semCircuitos = d.zonas.filter((z) => !z.circuitos.length);
  const concelhos = aPedidoPorConcelho(d);
  // O QUE FALTA E O QUE HÁ, contados — e não escritos para uma região só. A
  // página dizia sempre que faltavam horários e que havia um feed GTFS-Flex,
  // e numa região com tudo publicado e sem esse feed eram duas frases falsas.
  const faltaAlgo = semCircuitos.length > 0 || d.circuitos.some((c) => !c.horario);
  const descargas = await dadosAbertos(rid);
  const temFlex = descargas.some((x) => x.modo === 'a-pedido' && x.caminho.endsWith('.zip'));
  // O que falta, circuito a circuito, está no relatório da construção, que se
  // descarrega dos dados abertos — a página deixou de o publicar em bruto.
  const comRelatorio = descargas.some((x) => x.grupo === 'relatorios');

  return (
    <>
      {/* As zonas abrem-se pelo endereço (`#z-<zona>`): é para lá que a
          página de cada concelho leva. */}
      <AbrirPeloEndereco />
      <h1>Transporte a pedido</h1>
      <p>
        Há circuitos {r.em} que só circulam se alguém os reservar, em{' '}
        {plural(d.zonas.length, 'zona', 'zonas')} — e em boa parte das freguesias são o único
        transporte público que há.
      </p>

      {/* PRIMEIRO A REGRA, e só depois tudo o resto. */}
      <section aria-labelledby="reservar">
        <h2 id="reservar">Como se reserva</h2>
        <div className="faixa a-pedido">
          {v.prazo && (
            <p>
              <strong>{v.prazo}.</strong> Depois disso o circuito não é chamado, e não passa.
            </p>
          )}
          <p className="cartao-accoes">
            {v.telefone && (
              <a className="botao" href={`tel:${v.telefone}`}>
                Ligar {v.telefone_apresentado ?? v.telefone}
              </a>
            )}
            {v.online && (
              <a href={v.online} rel="noreferrer">
                Reservar online
              </a>
            )}
          </p>
          {v.telefone_nota && <p className="secundario">{v.telefone_nota}</p>}
          {/* NUMA DEMONSTRAÇÃO NÃO HÁ CENTRAL DE RESERVAS — e um número
              inventado é o número de alguém, que receberia as chamadas de
              quem experimentasse. Diz-se o que estaria aqui, em vez de deixar
              a caixa a meio. */}
          {r.demonstracao && !v.telefone && !v.online && (
            <p className="secundario">
              Numa região a sério, aqui estão o telefone da central de reservas e a ligação para a
              reserva online. Isto é uma demonstração: não há central, e não se reserva nada.
            </p>
          )}
          {/* A reserva online NÃO cobre tudo, e dizer que cobre manda alguém
              a um sítio onde não encontra o que procura. Numa frase, com o
              «e» antes do último: separados só por vírgulas, um serviço «de A e
              B» lia-se como dois. */}
          {v.com_reserva_online?.length ? (
            <p>
              A reserva online só serve {lista(v.com_reserva_online)}. Os restantes circuitos
              reservam-se por telefone.
            </p>
          ) : null}
          {/* O CORREIO ELETRÓNICO COM A FRASE DA REGIÃO (#153). Estava uma frase
              sobre o cartão de um título, escrita aqui, sem dizer que cartão
              é nem para quê — e o nome do título é de uma região. A
              frase que o explica é dela (`email_nota`); sem frase, só o
              endereço. */}
          {v.email && (
            <p>
              {v.email_nota ?? 'Por correio eletrónico:'}{' '}
              <a href={`mailto:${v.email}`}>{v.email}</a>.
            </p>
          )}
        </div>
        {v.tolerancia && (
          <p className="marca-dados">{v.tolerancia}. É a própria operadora que o declara.</p>
        )}
      </section>

      {/* A PERGUNTA DE QUEM CHEGA AQUI, logo a seguir à regra: «há na minha
          terra?». Escreve-se o nome da aldeia e a resposta diz qual circuito
          lá passa — em vez de 24 ecrãs de zonas com nomes de contrato. */}
      <section aria-labelledby="procurar">
        <h2 id="procurar">Há na sua terra?</h2>
        <ProcurarTerra
          indice={indiceDasTerras(d, (c) => url(rid, c))}
          telefone={v.telefone}
          telefoneApresentado={v.telefone_apresentado}
        />
      </section>

      {/* UMA ESTRUTURA SÓ, POR CONCELHO (#55). Eram três listas para os mesmos
          circuitos — as zonas, os circuitos com horário e o catálogo por ordem
          alfabética —, e o mesmo circuito aparecia em duas ou três: oito
          ecrãs de labirinto. Agora é um concelho de cada vez, fechado, com as
          zonas dele e os circuitos de cada zona a levar ao horário; o que
          nenhuma fonte publica diz que a hora se dá na reserva. A lista
          alfabética passou a ser a procura de cima. */}
      <section aria-labelledby="zonas">
        <h2 id="zonas">Por concelho</h2>
        <p className="secundario">
          {plural(d.zonas.length, 'zona', 'zonas')}, em{' '}
          {plural(concelhos.filter((c) => c.id).length, 'concelho', 'concelhos')}
          {concelhos.some((c) => !c.id) ? ', e as ligações entre concelhos' : ''}. Abra um para ver
          os circuitos e o horário de cada um.
        </p>
        {concelhos.map((c) => (
          <details
            key={c.id || 'entre-concelhos'}
            className="concelho-a-pedido"
            id={c.id ? `c-${c.id}` : 'entre-concelhos'}
          >
            <summary>
              <span className="nome-da-zona">{c.id ? c.nome : 'Entre concelhos'}</span>
              <span className="circuitos-no-resumo">
                {[
                  plural(c.zonas.length, 'zona', 'zonas'),
                  c.circuitos ? plural(c.circuitos, 'circuito', 'circuitos') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </summary>
            {c.zonas.map((z) => {
              const horarios = z.circuitos.length ? [] : horariosDaZona(d, z);
              // O nome da zona sem o concelho, que o título do grupo já diz:
              // «Norte», e não «Pedra Alta — Norte».
              const nome = c.id ? semPrefixos(z.nome, [c.nome]) : z.nome;
              return (
                <div key={z.id} className="zona-a-pedido" id={`z-${z.id}`}>
                  <h3>
                    {nome === c.nome ? 'Zona' : nome}
                    {z.servico ? <span className="secundario"> · {z.servico}</span> : null}
                    <span className="so-para-leitores">, zona {z.nome}</span>
                  </h3>
                  {z.circuitos.length > 0 ? (
                    <ul className="circuitos-da-zona">
                      {z.circuitos.map((ci) => (
                        <li key={ci.nome}>
                          <span>{nomeDoSistema(ci.nome)}</span>
                          {/* O HORÁRIO PRIMEIRO, o folheto depois: quem olha
                              para a zona onde mora quer a hora, e o folheto
                              vale por ser a fonte. */}
                          {ci.horario ? (
                            <Link
                              href={url(
                                rid,
                                `${caminhoDoHorario(ci.horario.grupo)}#${idDoQuadro(ci.horario.quadro)}`,
                              )}
                            >
                              Ver horário
                              <span className="so-para-leitores"> de {nomeDoSistema(ci.nome)}</span>
                            </Link>
                          ) : ci.folheto ? (
                            <a href={ci.folheto} rel="noreferrer">
                              Ver folheto
                              <span className="so-para-leitores"> de {nomeDoSistema(ci.nome)}</span>
                            </a>
                          ) : (
                            <span className="secundario">horário dado na reserva</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    // AS ZONAS SEM CIRCUITOS ATRIBUÍDOS, cada uma com o que se
                    // pode fazer: o horário que se sabe dela, o telefone, e a
                    // reserva online onde ela serve. Diziam «ver o concelho»,
                    // e o concelho mandava de volta para aqui.
                    <>
                      <p className="secundario">
                        {horarios.length
                          ? 'Tem serviço, e reserva-se como as outras.'
                          : 'Tem serviço, e reserva-se como as outras; a hora dá-se na reserva.'}
                      </p>
                      <p className="cartao-accoes">
                        {horarios.map((h) => (
                          <Link key={h.id} href={url(rid, caminhoDoHorario(h.id))}>
                            {horarios.length === 1 ? 'Ver o horário' : tituloDoHorario(h)}
                            {horarios.length === 1 && (
                              <span className="so-para-leitores"> de {z.nome}</span>
                            )}
                          </Link>
                        ))}
                        {v.telefone && (
                          <a href={`tel:${v.telefone}`}>
                            Ligar {v.telefone_apresentado ?? v.telefone}
                            <span className="so-para-leitores"> para reservar em {z.nome}</span>
                          </a>
                        )}
                        {v.online && reservaOnlineDaZona(d, z) === true && (
                          <a href={v.online} rel="noreferrer">
                            Reservar online
                            <span className="so-para-leitores"> em {z.nome}</span>
                          </a>
                        )}
                      </p>
                    </>
                  )}
                  {z.mapa && (
                    <p className="cartao-accoes">
                      <a href={z.mapa} rel="noreferrer">
                        Mapa da zona<span className="so-para-leitores"> {z.nome}</span>
                      </a>
                      <span className="secundario">no sítio da autoridade de transportes</span>
                    </p>
                  )}
                </div>
              );
            })}
            {c.outros.length > 0 && (
              <div className="zona-a-pedido">
                <h3>{c.zonas.length ? 'Mais horários' : 'Os horários'}</h3>
                <ul className="circuitos-da-zona">
                  {c.outros.map((h) => (
                    <li key={h.id}>
                      <span>{tituloDoHorario(h)}</span>
                      <Link href={url(rid, caminhoDoHorario(h.id))}>
                        Ver horário
                        <span className="so-para-leitores"> de {tituloDoHorario(h)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        ))}

        {d.sem_zona.length > 0 && (
          <p>
            {d.sem_zona.length === 1
              ? `${d.sem_zona[0].nome} não tem zona de transporte a pedido.`
              : `Não têm zona de transporte a pedido: ${lista(d.sem_zona.map((c) => c.nome))}.`}
          </p>
        )}
        {/* As horas continuam a ser a pedido — a regra está em cima. */}
        {d.horarios.length > 0 && (
          <p className="secundario">
            Mesmo com horário, <strong>só passam se alguém reservar</strong>: as horas só se cumprem
            com reserva feita.
          </p>
        )}
      </section>

      {/* DE ONDE VEM ISTO, NO FIM E FECHADO, como nas páginas dos modos: é
          para quem quer saber, e não para quem quer apanhar o transporte.
          Abria a meio da página, com «introdução manual assistida» e
          «GTFS-Flex» (auditoria de 1/11/2026). */}
      <section aria-labelledby="donde" className="sobre-estes-dados">
        <h2 id="donde">Sobre estes dados</h2>
        <details className="lista-fechada">
          <summary>De onde vem isto, e o que falta</summary>
          <p>{d.fonte}</p>
          {faltaAlgo && (
            <p>
              O que falta — o horário dos circuitos que nenhuma brochura publica, e a zona de cada
              um — vai sendo acrescentado à mão, a partir das páginas públicas da autoridade de
              transportes.
              {comRelatorio && (
                <>
                  {' '}
                  O que ainda falta, circuito a circuito, está no relatório da última construção,
                  que se descarrega dos <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>
                  .
                </>
              )}
            </p>
          )}
          {/* O MESMO HORÁRIO, PARA MÁQUINAS. Não é um extra de quem gosta de
              dados: é o que faz este serviço poder aparecer numa aplicação de
              transportes em vez de viver só nesta página. */}
          {temFlex && (
            <p>
              Estes circuitos também se descarregam no formato que as aplicações de transportes leem
              (GTFS-Flex), com a regra de reserva dentro do próprio ficheiro: está nos{' '}
              <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>, com os termos à frente.
            </p>
          )}
        </details>
      </section>
    </>
  );
}
