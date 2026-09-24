import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  exigirModo,
  paragem as lerParagem,
  concelhos,
  linhas,
  horaLegivel,
  operadorCurto,
  url,
  urlRede,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import Distintivo from '@/componentes/Distintivo';

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
  const ficha = await lerParagem(rid, id);
  return { title: ficha ? ficha.paragem.nome : 'Paragem' };
}

export default async function Paragem({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const ficha = await lerParagem(rid, id);
  if (!ficha) notFound();
  const p = ficha.paragem;

  const concelho = (await concelhos(rid)).find((c) => c.id === p.concelho);
  const cores = Object.fromEntries((await linhas(rid)).map((l) => [l.codigo, l.cor]));
  const partidas = ficha.partidas;

  // Por serviço, que é como um horário impresso se lê: «Anual · Dias úteis»,
  // e não «hoje». Uma paragem não tem um horário — tem vários, conforme o dia.
  const porServico = new Map<string, typeof partidas>();
  for (const d of partidas) {
    const lista = porServico.get(d.servico_nome) ?? [];
    lista.push(d);
    porServico.set(d.servico_nome, lista);
  }

  return (
    <>
      <h1>{p.nome}</h1>
      {/* Uma frase, e não a ligação sozinha num parágrafo: a ligação sozinha
          era um alvo de 20 px que a norma não isenta — a isenção do critério
          2.5.8 é para o alvo «numa frase», e uma ligação sem frase à volta não
          está numa frase. E lê-se melhor assim. */}
      <p>
        {concelho ? (
          <>
            Paragem em <Link href={urlRede(rid, `concelhos/${concelho.id}/`)}>{concelho.nome}</Link>
            {concelho.membro ? '.' : ' — concelho também servido pela rede.'}
          </>
        ) : (
          'Esta paragem fica fora dos concelhos da região. A linha que a serve atravessa a fronteira.'
        )}
      </p>
      <MarcaDeDados regiao={rid} />

      {partidas.length === 0 ? (
        <div className="faixa">
          <p>
            <strong>Sem partidas registadas nesta paragem.</strong> Pode ser uma paragem só de
            chegada, ou uma paragem cujas viagens dependem de serviços que ainda não têm datas.
          </p>
        </div>
      ) : (
        [...porServico.entries()].map(([servico, lista]) => {
          const semDatas = lista.some((d) => !d.tem_datas);
          return (
            <section key={servico}>
              <table className="horario">
                <caption>{servico}</caption>
                <thead>
                  <tr>
                    <th scope="col">Hora</th>
                    <th scope="col">Linha</th>
                    <th scope="col">Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d, i) => {
                    const h = horaLegivel(d.hora);
                    return (
                      <tr key={`${d.linha}-${d.hora}-${i}`}>
                        <td>
                          <span className="hora">{h.texto}</span>
                          {h.diaSeguinte && (
                            <>
                              {' '}
                              <span className="secundario">(dia seguinte)</span>
                            </>
                          )}
                          {d.estimada && (
                            <>
                              {' '}
                              <abbr title="Hora estimada por nós entre dois pontos do horário publicado">
                                est.
                              </abbr>
                            </>
                          )}
                        </td>
                        <td>
                          <Link href={urlRede(rid, `linhas/${d.linha_id}/`)}>
                            <Distintivo codigo={d.linha} cor={cores[d.linha]} />
                          </Link>
                        </td>
                        <td>
                          {/* Uma circular volta ao sítio de onde parte, e o
                            quadro diz isso em vez de repetir o nome desta
                            paragem. Ver `circular` em `formato.ts`. */}
                          {d.circular ? 'circular · volta aqui' : d.destino}
                          {/* QUEM GERE, quando não é a rede da região. O §1
                            manda que seja informação secundária — e é o que
                            isto é: abaixo do destino, em pequeno. Escondê-lo
                            de todo era outra coisa, porque nesta paragem
                            param carreiras de duas concessões e o título de
                            uma não serve na outra. */}
                          {d.operador && (
                            <>
                              <br />
                              <span className="secundario">
                                Gerido por {operadorCurto(d.operador)}
                              </span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {semDatas && (
                <div className="faixa alerta">
                  <p>
                    <strong>Não se sabe em que dias este serviço circula.</strong> O calendário de
                    funcionamento da operadora ainda não foi transcrito, e sem ele estas horas
                    existem mas não têm dia. Confirma com a operadora antes de contar com elas.
                  </p>
                </div>
              )}
            </section>
          );
        })
      )}

      <h2>Onde fica</h2>
      <p>
        {p.lat}, {p.lon}{' '}
        <a
          href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`}
        >
          ver no OpenStreetMap
        </a>
      </p>
      {/* A ligação que fecha o círculo: esta página diz o que passa aqui, e
          daqui vai-se a «como chegar» com o destino JÁ preenchido. Sem o
          `?para=`, quem chega de uma pesquisa a esta paragem tinha de escrever
          outra vez o nome que já estava no ecrã. */}
      <p>
        Para vir de outro sítio,{' '}
        <Link href={url(rid, `/viagem/?para=${encodeURIComponent(p.nome)}`)}>
          procura como chegar a {p.nome}
        </Link>
        .
      </p>
    </>
  );
}
