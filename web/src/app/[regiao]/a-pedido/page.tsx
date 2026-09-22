import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { aPedido, exigirRegiao, url, urlRede } from '@/lib/dados';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao from '@/componentes/Transcricao';

export const metadata: Metadata = { title: 'Transporte a pedido' };

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
  const comCircuitos = d.zonas.filter((z) => z.circuitos.length);
  const semCircuitos = d.zonas.filter((z) => !z.circuitos.length);

  return (
    <>
      <h1>Transporte a pedido</h1>
      <p>
        Há circuitos {r.em} que só circulam se alguém os reservar. São {d.zonas.length} zonas — e em
        boa parte das freguesias são o único transporte público que há.
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
          {/* A reserva online NÃO cobre tudo, e dizer que cobre manda alguém
              a um sítio onde não encontra o que procura. */}
          {v.com_reserva_online?.length ? (
            <p>
              A reserva online só serve {v.com_reserva_online.join(', ')}. Os restantes circuitos
              reservam-se por telefone.
            </p>
          ) : null}
          {v.email && (
            <p>
              Para o cartão de carregamento do multiviagens:{' '}
              <a href={`mailto:${v.email}`}>{v.email}</a>.
            </p>
          )}
        </div>
        {v.tolerancia && (
          <p className="marca-dados">{v.tolerancia}. É a própria operadora que o declara.</p>
        )}
      </section>

      <section aria-labelledby="zonas">
        <h2 id="zonas">As zonas</h2>

        {comCircuitos.map((z) => (
          <section key={z.id} aria-labelledby={`z-${z.id}`}>
            <h3 id={`z-${z.id}`}>
              {z.nome}
              {z.servico ? <span className="secundario"> · {z.servico}</span> : null}
            </h3>
            <ul className="lista">
              {z.circuitos.map((c) => (
                <li key={c.nome}>
                  <span>{c.nome}</span>
                  {/* O HORÁRIO PRIMEIRO, o folheto depois. Quem está a olhar
                      para a zona onde mora quer a hora, e o folheto é o PDF
                      da autoridade — vale por ser a fonte, não por ser o
                      caminho mais curto até às horas. */}
                  {c.horario ? (
                    <a href={`#tap-${c.horario.grupo}`}>Horário</a>
                  ) : c.folheto ? (
                    <a href={c.folheto} rel="noreferrer">
                      Folheto
                    </a>
                  ) : (
                    <span className="secundario">horário por levantar</span>
                  )}
                </li>
              ))}
            </ul>
            {z.mapa && (
              <p>
                <a href={z.mapa} rel="noreferrer">
                  Mapa da zona {z.nome}
                </a>{' '}
                <span className="secundario">(no sítio da autoridade de transportes)</span>
              </p>
            )}
          </section>
        ))}

        {/* O QUE FALTA, ESCRITO — e não uma lista curta a fingir-se de
            completa. A página de horários da autoridade carrega cada
            separador só quando alguém lhe toca, por isso o instantâneo
            guardado à mão só apanhou um. */}
        {semCircuitos.length > 0 && (
          <div className="faixa">
            <h3>{semCircuitos.length} zonas sem os circuitos atribuídos</h3>
            <p>
              Existem e têm serviço. Os circuitos também se conhecem — estão todos na lista abaixo
              —, o que não se sabe é qual deles serve qual zona, nem a que horas passa. Reservam-se
              pelo telefone acima, que serve todas.
            </p>
            <ul className="lista">
              {semCircuitos.map((z) => (
                <li key={z.id}>
                  <span>
                    {z.nome}
                    {z.servico ? <span className="secundario"> · {z.servico}</span> : null}
                  </span>
                  {z.concelho ? (
                    <Link href={urlRede(rid, `concelhos/${z.concelho}/`)}>o concelho</Link>
                  ) : (
                    <span className="secundario">entre concelhos</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {d.sem_zona.length > 0 && (
          <p>
            Sem zona de transporte a pedido: {d.sem_zona.map((c) => c.nome).join(', ')}. É
            informação e não lapso — a página da autoridade de transportes não lhe
            {d.sem_zona.length > 1 ? 's' : ''} dá separador.
          </p>
        )}
      </section>

      {/* OS HORÁRIOS, que são o que muda a página de «existe» para «passa às».

          Vêm das brochuras que a própria autoridade publica, uma por concelho
          ou por circuito. Estão agrupados por CONCELHO e não por zona: a
          brochura diz de que concelho é, e a zona é outra divisão. */}
      {d.horarios.length > 0 && (
        <section aria-labelledby="horarios">
          <h2 id="horarios">
            Os circuitos com horário ({d.horarios.reduce((n, h) => n + h.viagens, 0)} viagens)
          </h2>
          <p>
            Continuam a ser <strong>a pedido</strong>: estas horas só se cumprem se alguém reservar.
            A regra está em cima.
          </p>
          {d.horarios.map((h) => (
            <section key={h.id} aria-labelledby={`tap-${h.id}`}>
              {/* O TÍTULO É O CONCELHO, porque é por aí que se procura — mas
                  nem tudo é de um concelho. O LINK atravessa-os, e a
                  declaração dele traz o concelho vazio de propósito: sem esta
                  alternativa, o cabeçalho dele saía em branco. */}
              <h3 id={`tap-${h.id}`}>
                {h.concelho_nome
                  ? `${h.concelho_nome}${h.circuito_de ? ` — ${h.circuito_de}` : ''}`
                  : h.nome}
              </h3>
              <p className="secundario">
                {[
                  `${h.paragens.length} paragens`,
                  // A TABELA DE PARTIDAS NÃO TEM VIAGENS, e dizer «0 viagens»
                  // era anunciar um serviço que não existe. O folheto do LINK
                  // lista as horas a que se parte de cada cidade, não a ordem
                  // por que um autocarro lhes passa.
                  h.viagens > 0
                    ? `${h.viagens} ${h.viagens === 1 ? 'viagem' : 'viagens'}`
                    : 'tabela de partidas',
                ].join(' · ')}
              </p>
              {h.regras.map((regra) => (
                <p key={regra}>{regra}</p>
              ))}
              {h.quadros.map((q, iq) => (
                <QuadroDeHorario key={iq} quadro={q} titulo={h.nome} />
              ))}
              <Transcricao por={h.transcrito_por} em={h.transcrito_em} de="da brochura" />
              {h.concelho && (
                <p>
                  <Link href={urlRede(rid, `concelhos/${h.concelho}/`)}>
                    O concelho {h.concelho_nome}
                  </Link>
                </p>
              )}
            </section>
          ))}
        </section>
      )}

      {/* O CATÁLOGO. Sem horas e sem zona, e mesmo assim útil: quem mora numa
          aldeia quer saber se há circuito com o nome dela antes de ligar. */}
      {d.circuitos.length > 0 && (
        <section aria-labelledby="circuitos">
          <h2 id="circuitos">Os {d.circuitos.length} circuitos</h2>
          <p>
            São os nomes que o sistema de reservas usa — é por aqui que se procura o nome da própria
            terra antes de ligar.{' '}
            {(() => {
              const com = d.circuitos.filter((c) => c.horario).length;
              return com > 0 ? (
                <>
                  <strong>
                    {com} {com === 1 ? 'tem' : 'têm'} o horário publicado
                  </strong>{' '}
                  e levam a ele; {d.circuitos.length - com} não, e dizem-no.
                </>
              ) : null;
            })()}
          </p>
          <ul className="colunas">
            {d.circuitos.map((c) => (
              <li key={c.nome}>
                {/* A LIGAÇÃO É PARA O HORÁRIO, e não para o nome do quadro:
                    quem procura «Constância Sul» não sabe nem tem de saber
                    que na folha ele se chama «Constância – Constância-Sul e
                    Santa Margarida da Coutada». Chega lá à mesma. */}
                {c.horario ? (
                  <a href={`#tap-${c.horario.grupo}`}>{c.nome}</a>
                ) : (
                  <>
                    {c.nome} <span className="secundario">· sem horário publicado</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="donde">
        <h2 id="donde">De onde vem isto</h2>
        <p>{d.fonte}</p>
        <p>
          O que falta — o horário dos circuitos que nenhuma fonte publica, e saber a que zona
          pertence cada um — entra por introdução manual assistida a partir das páginas públicas.
          Está no <Link href={url(rid, 'dados-abertos/')}>relatório de lacunas</Link>, circuito a
          circuito e zona a zona, com a razão de cada um.
        </p>
        {/* O MESMO HORÁRIO, PARA MÁQUINAS. Não é um extra de quem gosta de
            dados: é o que faz este serviço poder aparecer numa aplicação de
            transportes em vez de viver só nesta página. */}
        <p>
          Estes circuitos também saem em <strong>GTFS-Flex</strong>, o formato em que uma aplicação
          de transportes sabe que a hora só se cumpre com reserva feita — a regra de reserva vai
          dentro do próprio ficheiro. Está nos{' '}
          <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>, com os termos à frente.
        </p>
      </section>
    </>
  );
}
