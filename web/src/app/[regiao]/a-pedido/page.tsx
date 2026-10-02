import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { aPedido, dadosAbertos, exigirRegiao, url, urlRede, regiao } from '@/lib/dados';
import ProcurarTerra from '@/componentes/ProcurarTerra';
import { caminhoDoHorario, idDoQuadro, indiceDasTerras } from '@/lib/a-pedido';
import { plural } from '@/lib/prosa';
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
  const comCircuitos = d.zonas.filter((z) => z.circuitos.length);
  const semCircuitos = d.zonas.filter((z) => !z.circuitos.length);
  // O QUE FALTA E O QUE HÁ, contados — e não escritos para uma região só. A
  // página dizia sempre que faltavam horários e que havia um feed GTFS-Flex,
  // e numa região com tudo publicado e sem esse feed eram duas frases falsas.
  const faltaAlgo = semCircuitos.length > 0 || d.circuitos.some((c) => !c.horario);
  const temFlex = (await dadosAbertos(rid)).some(
    (x) => x.modo === 'a-pedido' && x.caminho.endsWith('.zip'),
  );

  return (
    <>
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

      {/* A PERGUNTA DE QUEM CHEGA AQUI, logo a seguir à regra: «há na minha
          terra?». Escreve-se o nome da aldeia e a resposta diz qual circuito
          lá passa — em vez de 24 ecrãs de zonas com nomes de contrato. */}
      <section aria-labelledby="procurar">
        <h2 id="procurar">Há na tua terra?</h2>
        <ProcurarTerra
          indice={indiceDasTerras(d, (c) => url(rid, c))}
          telefone={v.telefone}
          telefoneApresentado={v.telefone_apresentado}
        />
      </section>

      <section aria-labelledby="zonas">
        <h2 id="zonas">As zonas</h2>
        <p className="secundario">
          Toca numa zona para ver os circuitos dela e o horário de cada um.
        </p>

        {/* CADA ZONA FECHADA, com os circuitos no resumo. Abertas, eram 24
            ecrãs; e o nome de contrato de uma zona (um número de lote) não diz a
            ninguém se é a dele — os nomes dos circuitos, que são as terras,
            dizem. */}
        {comCircuitos.map((z) => (
          <details key={z.id} className="zona-a-pedido" id={`z-${z.id}`}>
            <summary>
              <span className="nome-da-zona">
                {z.nome}
                {z.servico ? <span className="secundario"> · {z.servico}</span> : null}
              </span>
              <span className="circuitos-no-resumo">
                {plural(z.circuitos.length, 'circuito', 'circuitos')}:{' '}
                {z.circuitos.map((c) => c.nome).join(', ')}
              </span>
            </summary>
            <ul className="circuitos-da-zona">
              {z.circuitos.map((c) => (
                <li key={c.nome}>
                  <span>{c.nome}</span>
                  {/* O HORÁRIO PRIMEIRO, o folheto depois. Quem está a olhar
                      para a zona onde mora quer a hora, e o folheto é o PDF
                      da autoridade — vale por ser a fonte, não por ser o
                      caminho mais curto até às horas. E uma ligação com
                      aspeto de ligação: «Horário» em texto escuro, sem
                      sublinhado, lia-se como texto corrido. */}
                  {c.horario ? (
                    <Link
                      href={url(
                        rid,
                        `${caminhoDoHorario(c.horario.grupo)}#${idDoQuadro(c.horario.quadro)}`,
                      )}
                    >
                      Ver horário
                    </Link>
                  ) : c.folheto ? (
                    <a href={c.folheto} rel="noreferrer">
                      Ver folheto
                    </a>
                  ) : (
                    <span className="secundario">horário por publicar</span>
                  )}
                </li>
              ))}
            </ul>
            {z.mapa && (
              <p className="cartao-accoes">
                <a href={z.mapa} rel="noreferrer">
                  Mapa da zona {z.nome}
                </a>
                <span className="secundario">no sítio da autoridade de transportes</span>
              </p>
            )}
          </details>
        ))}

        {/* O QUE FALTA, ESCRITO — e não uma lista curta a fingir-se de
            completa. A página de horários da autoridade carrega cada
            separador só quando alguém lhe toca, por isso o instantâneo
            guardado à mão só apanhou um. */}
        {semCircuitos.length > 0 && (
          <div className="faixa informacao">
            <h3>
              {semCircuitos.length === 1
                ? 'Uma zona sem os circuitos atribuídos'
                : `${semCircuitos.length} zonas sem os circuitos atribuídos`}
            </h3>
            <p>
              Existem e têm serviço. Os circuitos também se conhecem — estão todos na lista abaixo
              —, o que não se sabe é qual deles serve qual zona, nem a que horas passa. Reservam-se
              pelo telefone acima, que serve todas.
            </p>
            <ul className="lista lista-de-zonas">
              {semCircuitos.map((z) => (
                <li key={z.id}>
                  {/* A NOTA SEPARADA DO NOME, e não colada: lia-se «LINK
                      Cidadesentre concelhos», no ecrã e no leitor de ecrã. */}
                  {z.concelho ? (
                    <Link href={urlRede(rid, `concelhos/${z.concelho}/`)}>
                      <span>
                        {z.nome}
                        {z.servico ? ` · ${z.servico}` : ''}
                      </span>
                      <span className="secundario">ver o concelho</span>
                    </Link>
                  ) : (
                    <span className="sem-ligacao">
                      <span>
                        {z.nome}
                        {z.servico ? ` · ${z.servico}` : ''}
                      </span>
                      <span className="secundario">entre concelhos</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {d.sem_zona.length > 0 && (
          <p>
            Sem zona de transporte a pedido: {d.sem_zona.map((c) => c.nome).join(', ')}. É
            informação e não lapso — a fonte não lhe{d.sem_zona.length > 1 ? 's' : ''} atribui zona
            nenhuma.
          </p>
        )}
      </section>

      {/* OS HORÁRIOS, que são o que muda a página de «existe» para «passa às».

          Cada grupo — uma brochura, um folheto — tem a sua página: aqui
          estavam todos, com as tabelas todas, e a página chegava aos 833 kB
          e a dez mil elementos, a pintar em cinco segundos num telemóvel.
          Agrupados por CONCELHO e não por zona: a brochura diz de que
          concelho é, e a zona é outra divisão. */}
      {d.horarios.length > 0 && (
        <section aria-labelledby="horarios">
          <h2 id="horarios">
            Os circuitos com horário (
            {plural(
              d.horarios.reduce((n, h) => n + h.viagens, 0),
              'viagem',
              'viagens',
            )}
            )
          </h2>
          <p>
            Continuam a ser <strong>a pedido</strong>: estas horas só se cumprem se alguém reservar.
            A regra está em cima.
          </p>
          <ul className="lista">
            {d.horarios.map((h) => (
              <li key={h.id}>
                <Link href={url(rid, caminhoDoHorario(h.id))}>
                  {/* O TÍTULO É O CONCELHO, porque é por aí que se procura —
                      mas nem tudo é de um concelho: o LINK atravessa-os, e
                      sem esta alternativa o nome dele saía em branco. */}
                  <span>
                    {h.concelho_nome
                      ? `${h.concelho_nome}${h.circuito_de ? ` — ${h.circuito_de}` : ''}`
                      : h.nome}
                  </span>
                  <span className="secundario">
                    {/* A TABELA DE PARTIDAS NÃO TEM VIAGENS, e dizer «0
                        viagens» era anunciar um serviço que não existe. */}
                    {h.viagens > 0 ? plural(h.viagens, 'viagem', 'viagens') : 'tabela de partidas'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* O CATÁLOGO. Sem horas e sem zona, e mesmo assim útil: quem mora numa
          aldeia quer saber se há circuito com o nome dela antes de ligar. A
          procura de cima faz o mesmo mais depressa; a lista fica para quem
          prefere ler. */}
      {d.circuitos.length > 0 && (
        <section aria-labelledby="circuitos">
          <h2 id="circuitos">
            {d.circuitos.length === 1 ? 'O circuito' : `Os ${d.circuitos.length} circuitos`}
          </h2>
          <p>
            São os nomes que o sistema de reservas usa.{' '}
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
          <details className="lista-fechada">
            <summary>A lista toda, por ordem alfabética</summary>
            <ul className="colunas circuitos-do-catalogo">
              {d.circuitos.map((c) => (
                <li key={c.nome}>
                  {/* A LIGAÇÃO É PARA O HORÁRIO, e não para o nome do quadro:
                    quem procura «Constância Sul» não sabe nem tem de saber
                    que na folha ele se chama «Constância – Constância-Sul e
                    Santa Margarida da Coutada». Chega lá à mesma. */}
                  {c.horario ? (
                    <Link
                      href={url(
                        rid,
                        `${caminhoDoHorario(c.horario.grupo)}#${idDoQuadro(c.horario.quadro)}`,
                      )}
                    >
                      {c.nome}
                    </Link>
                  ) : (
                    <span className="sem-horario">
                      {c.nome} <span className="secundario">· sem horário publicado</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <section aria-labelledby="donde">
        <h2 id="donde">De onde vem isto</h2>
        <p>{d.fonte}</p>
        {faltaAlgo && (
          <p>
            O que falta — o horário dos circuitos que nenhuma fonte publica, e saber a que zona
            pertence cada um — entra por introdução manual assistida a partir das páginas públicas.
            Está no <Link href={url(rid, 'dados-abertos/')}>relatório de lacunas</Link>, circuito a
            circuito e zona a zona, com a razão de cada um.
          </p>
        )}
        {/* O MESMO HORÁRIO, PARA MÁQUINAS. Não é um extra de quem gosta de
            dados: é o que faz este serviço poder aparecer numa aplicação de
            transportes em vez de viver só nesta página. */}
        {temFlex && (
          <p>
            Estes circuitos também saem em <strong>GTFS-Flex</strong>, o formato em que uma
            aplicação de transportes sabe que a hora só se cumpre com reserva feita — a regra de
            reserva vai dentro do próprio ficheiro. Está nos{' '}
            <Link href={url(rid, 'dados-abertos/')}>dados abertos</Link>, com os termos à frente.
          </p>
        )}
      </section>
    </>
  );
}
