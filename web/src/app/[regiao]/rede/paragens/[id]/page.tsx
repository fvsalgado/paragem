import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import {
  exigirModo,
  paragem as lerParagem,
  concelhos,
  linhas,
  compactar,
  horaLegivel,
  operadorCurto,
  url,
  urlRede,
  NAO_ENCONTRADA,
  regiao,
  urlDaParagem,
  temMosaicos,
  quadrosDeHoje,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import Distintivo from '@/componentes/Distintivo';
import PartidasDaParagem from '@/componentes/PartidasDaParagem';
import type { QuadroDoDia } from '@/componentes/QuadrosPorDia';
import { metadadosDaRegiao } from '@/lib/metadados';
import { linhasNumaFrase } from '@/lib/prosa';

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
  const [ficha, r, cs] = await Promise.all([lerParagem(rid, id), regiao(rid), concelhos(rid)]);
  if (!ficha || !r) return { title: NAO_ENCONTRADA };
  const p = ficha.paragem;
  // «Horário planeado da paragem …, em …: linhas 1 e 2.» — o que se quer
  // ver na pré-visualização de quem manda o horário da paragem a alguém.
  const concelho = cs.find((c) => c.id === p.concelho);
  const onde = concelho ? `, em ${concelho.nome}` : '';
  const quais = p.linhas.length ? `: ${linhasNumaFrase(p.linhas)}` : '';
  return metadadosDaRegiao(r, {
    titulo: p.nome,
    descricao: `Horário planeado da paragem ${p.nome}${onde}${quais}.`,
    caminho: urlDaParagem(rid, p.id),
  });
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
  // A COR PELO IDENTIFICADOR DA LINHA, e não pelo número: há números que se
  // repetem entre concessões (a rede da região e a vizinha têm cada uma a sua
  // linha com o mesmo número), e pelo número a segunda herdava a cor da primeira.
  const cores = Object.fromEntries((await linhas(rid)).map((l) => [l.id, l.cor]));
  const partidas = ficha.partidas;

  // Por serviço, que é como um horário impresso se lê: «Anual · Dias úteis»,
  // e não «hoje». Uma paragem não tem um horário — tem vários, conforme o dia.
  // A ordem é a em que as partidas chegam, e o pipeline já as manda pela do
  // horário impresso (Anual antes de Escolar, dias úteis antes de sábados).
  const porServico = new Map<string, typeof partidas>();
  for (const d of partidas) {
    const lista = porServico.get(d.servico_nome) ?? [];
    lista.push(d);
    porServico.set(d.servico_nome, lista);
  }

  // AS COLUNAS NO MESMO SÍTIO EM TODOS OS QUADROS. Com larguras automáticas,
  // a coluna das linhas começava a 97 px num quadro e a 87 px no seguinte, e a
  // página parecia recortes colados. A largura da coluna da linha é a do
  // número mais comprido DESTA paragem — a mesma em todos os quadros dela.
  const maisComprido = Math.max(2, ...partidas.map((d) => d.linha.length));
  const larguraDaLinha = `${Math.max(4.25, maisComprido * 0.7 + 2.25).toFixed(2)}rem`;

  const quadros: QuadroDoDia[] = [...porServico.entries()].map(([servico, lista]) => ({
    chave: servico,
    nome: servico,
    servicos: [...new Set(lista.map((d) => d.servico_id).filter((s): s is string => !!s))],
    contagem: lista.length === 1 ? '1 partida' : `${lista.length} partidas`,
    conteudo: (
      <>
        <table className="horario quadro-fixo">
          {/* O título está no resumo do quadro, à vista; a legenda é para
              quem chega à tabela pelo leitor de ecrã, que a anuncia. */}
          <caption className="so-para-leitores">{servico}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: '4.75rem' }}>
                Hora
              </th>
              <th scope="col" style={{ width: larguraDaLinha }}>
                Linha
              </th>
              <th scope="col">Destino</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d, i) => {
              const h = horaLegivel(d.hora);
              return (
                <tr key={`${d.linha_id}-${d.hora}-${i}`}>
                  <td>
                    <span className="hora">{h.texto}</span>
                    {/* POR EXTENSO E POR BAIXO, e não «est.» numa abreviatura
                        que só se explicava a quem passasse o rato por cima. */}
                    {d.estimada && <span className="nota-da-hora">estimada</span>}
                    {h.diaSeguinte && <span className="nota-da-hora">dia seguinte</span>}
                  </td>
                  <td>
                    <Link className="ligacao-da-linha" href={urlRede(rid, `linhas/${d.linha_id}/`)}>
                      <span className="so-para-leitores">Linha </span>
                      <Distintivo codigo={d.linha} cor={cores[d.linha_id]} tamanho="medio" />
                    </Link>
                  </td>
                  <td>
                    {/* Uma circular volta ao sítio de onde parte, e o quadro
                        diz isso em vez de repetir o nome desta paragem. Ver
                        `circular` em `formato.ts`. */}
                    {d.circular ? 'circular · volta aqui' : d.destino}
                    {/* QUEM GERE, quando não é a rede da região. O §1 manda
                        que seja informação secundária — e é o que isto é:
                        abaixo do destino, em pequeno. Escondê-lo de todo era
                        outra coisa, porque nesta paragem param carreiras de
                        duas concessões e o título de uma não serve na outra. */}
                    {d.operador && (
                      <>
                        <br />
                        <span className="secundario">Gerido por {operadorCurto(d.operador)}</span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.some((d) => !d.tem_datas) && (
          <div className="faixa informacao">
            <p>
              <strong>Não se sabe em que dias este serviço circula.</strong> O calendário de
              funcionamento da operadora ainda não foi transcrito, e sem ele estas horas existem mas
              não têm dia. Confirma com a operadora antes de contar com elas.
            </p>
          </div>
        )}
      </>
    ),
  }));

  // O «Ver no mapa» abre o mapa do próprio sítio nesta paragem, com o cartão
  // dela. É uma ligação a sério (`<a>`) e não uma navegação por dentro: o
  // mapa lê o endereço ao abrir.
  //
  // SÓ ONDE HÁ MAPA. Numa região sem mosaicos o início é a procura e o
  // planeador, e «Ver no mapa» levava a uma página sem mapa nenhum.
  const r = await regiao(rid);
  const noMapa = (await temMosaicos(rid)) ? url(rid, `/?ponto=${encodeURIComponent(p.id)}`) : null;
  // E NUMA REGIÃO INVENTADA AS COORDENADAS NÃO SÃO DE SÍTIO NENHUM: abri-las
  // no OpenStreetMap mostrava uma terra real — ou o mar — por baixo de uma
  // paragem que não existe.
  const noOsm = r?.demonstracao
    ? null
    : `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`;

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
      {/* A AÇÃO NO TOPO, junto do nome. Estava no fim da página — a 19 000 px
          na paragem mais servida —, e chegava-lhe quem já tinha desistido. O
          destino vai preenchido: quem chega a esta paragem por uma pesquisa
          não tem de escrever outra vez o nome que já está no ecrã. */}
      <p className="cartao-accoes">
        <Link className="botao" href={url(rid, `/viagem/?para=${encodeURIComponent(p.nome)}`)}>
          Como chegar aqui
        </Link>
        {noMapa && <a href={noMapa}>Ver no mapa</a>}
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
        <PartidasDaParagem
          regiao={rid}
          partidas={compactar(partidas)}
          cores={cores}
          quadros={quadros}
          quadrosDeHoje={await quadrosDeHoje(rid, quadros)}
        />
      )}

      {/* ONDE FICA, em palavras de quem viaja. Eram coordenadas cruas —
          «39.463, -8.213525» —, que não dizem nada a ninguém e faziam a página
          parecer um extrato de base de dados. O sítio tem o seu mapa; as
          coordenadas ficam, em pequeno, para quem as quer. */}
      <section aria-labelledby="onde">
        <h2 id="onde">Onde fica</h2>
        {(noMapa || noOsm) && (
          <p className="cartao-accoes">
            {noMapa && <a href={noMapa}>Ver no mapa desta região</a>}
            {noOsm && <a href={noOsm}>Ver no OpenStreetMap</a>}
          </p>
        )}
        <p className="secundario">
          Coordenadas: {p.lat}, {p.lon}
        </p>
      </section>
    </>
  );
}
