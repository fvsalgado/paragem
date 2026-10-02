import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  compactar,
  estacaoDetalhe,
  estacoes,
  exigirModo,
  concelhos,
  linhas,
  paragem as lerParagem,
  seguro,
  url,
  urlRede,
  urlDaParagem,
  NAO_ENCONTRADA,
  regiao,
  temMosaicos,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import ProximasPartidas from '@/componentes/ProximasPartidas';
import { metadadosDaRegiao } from '@/lib/metadados';

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
  await exigirModo(rid, 'comboio');
  const [es, r] = await Promise.all([estacoes(rid), regiao(rid)]);
  const e = es.find((x) => seguro(x.id) === id);
  if (!e || !r) return { title: NAO_ENCONTRADA };
  // O autocarro à porta só se promete onde ele está: a estação sem paragem a
  // menos de 300 m di-lo na página, e a pré-visualização não diz o contrário.
  const porta = e.sem_ligacao ? '' : ', e o autocarro à porta';
  return metadadosDaRegiao(r, {
    titulo: `${e.nome} (estação)`,
    descricao: `Os comboios da estação ${e.nome}, com as partidas planeadas${porta}.`,
    caminho: urlRede(rid, `estacoes/${seguro(e.id)}/`),
  });
}

export default async function Estacao({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'comboio');
  const e = (await estacoes(rid)).find((x) => seguro(x.id) === id);
  if (!e) notFound();
  const r = await regiao(rid);
  const concelho = (await concelhos(rid)).find((c) => c.id === e.concelho);
  const ficha = await estacaoDetalhe(rid, e.id);
  const temMapa = await temMosaicos(rid);
  const cores = Object.fromEntries((await linhas(rid)).map((l) => [l.id, l.cor]));

  // O AUTOCARRO À PORTA, uma vez por nome. A estação mostrava duas vezes
  // «<terra> (Estação) · 125 m» — os dois lados da estrada, que para
  // quem sai do comboio são o mesmo sítio —, e nenhuma partida. Junta-se por
  // nome, com as partidas das duas, e a distância da mais perto.
  const porNome = new Map<string, { ids: string[]; metros: number }>();
  for (const p of e.paragens_perto) {
    const g = porNome.get(p.nome) ?? { ids: [], metros: p.metros };
    g.ids.push(p.id);
    g.metros = Math.min(g.metros, p.metros);
    porNome.set(p.nome, g);
  }
  const aPorta = await Promise.all(
    [...porNome.entries()].map(async ([nome, g]) => {
      const fichas = (await Promise.all(g.ids.map((i) => lerParagem(rid, i)))).filter(
        (f): f is NonNullable<typeof f> => !!f,
      );
      const partidas = fichas
        .flatMap((f) => f.partidas)
        .sort((a, b) => a.hora.localeCompare(b.hora));
      return { nome, id: g.ids[0], metros: g.metros, partidas };
    }),
  );

  return (
    <>
      <h1>{e.nome}</h1>
      <p>
        Estação de comboio
        {concelho && (
          <>
            {' em '}
            <Link href={urlRede(rid, `concelhos/${concelho.id}/`)}>{concelho.nome}</Link>
          </>
        )}
        .
      </p>
      <p className="cartao-accoes">
        <Link className="botao" href={url(rid, `/viagem/?para=${encodeURIComponent(e.nome)}`)}>
          Como chegar aqui
        </Link>
        {/* Só onde há mapa: numa região sem mosaicos o início não tem mapa. */}
        {temMapa && <a href={url(rid, `/?ponto=${encodeURIComponent(e.id)}`)}>Ver no mapa</a>}
      </p>
      <MarcaDeDados regiao={rid} />

      {/* OS COMBOIOS QUE O SÍTIO JÁ TEM. A página dizia «os horários da CP não
          são publicados aqui», e o planeador do mesmo sítio propunha comboios
          ao minuto: a estação negava o que o sítio sabe. As partidas vêm da
          mesma grelha que o planeador usa. */}
      <section aria-labelledby="comboios" className="a-seguir">
        {ficha && ficha.partidas.length > 0 ? (
          <ProximasPartidas
            regiao={rid}
            partidas={compactar(ficha.partidas)}
            cores={{}}
            Titulo="h2"
            id="comboios"
            titulo="Comboios a seguir"
          />
        ) : (
          <>
            <h2 id="comboios">Comboios a seguir</h2>
            <p>
              {ficha
                ? 'Nos horários carregados, nenhum comboio parte desta estação.'
                : 'As horas dos comboios desta estação ainda não estão nesta página — o planeador já as usa: procura a viagem em «Como chegar».'}
            </p>
          </>
        )}
        <OperadorFerroviario operador={e.operador} demonstracao={!!r?.demonstracao} />
      </section>

      <section aria-labelledby="autocarro">
        <h2 id="autocarro">Autocarro à porta</h2>
        {e.sem_ligacao ? (
          // UM FACTO QUE NÃO MUDA AMANHÃ, numa faixa de informação: a de
          // alerta é para o que mudou hoje (P1-017).
          <div className="faixa informacao">
            <p>
              <strong>Não há paragem de autocarro a menos de 300 m desta estação.</strong> Quem aqui
              chegar de comboio tem de contar com outra maneira de sair — a pé, de táxi, ou com quem
              o venha buscar.
            </p>
          </div>
        ) : (
          aPorta.map((g) => (
            <div key={g.nome} className="paragem-a-porta">
              <h3>
                <Link href={urlDaParagem(rid, g.id)}>{g.nome}</Link>{' '}
                <span className="secundario">· {g.metros} m</span>
              </h3>
              {g.partidas.length > 0 ? (
                <ProximasPartidas
                  regiao={rid}
                  partidas={compactar(g.partidas)}
                  cores={cores}
                  Titulo={null}
                  quantas={3}
                />
              ) : (
                <p className="secundario">Sem partidas registadas nesta paragem.</p>
              )}
            </div>
          ))
        )}
      </section>
    </>
  );
}

/**
 * QUEM OPERA OS COMBOIOS, e onde se compram os bilhetes — do feed dele.
 *
 * Estava escrito «Bilhetes e perturbações em cp.pt», à mão, em todas as
 * estações de todas as regiões. Numa região servida por outro operador isso
 * mandava quem lá estivesse para o sítio de outra empresa; vem agora do
 * próprio feed (`agency.txt`). Dados de antes disso não trazem o operador, e
 * aí fica a frase de antes, sem nomear ninguém.
 *
 * Numa demonstração o operador é inventado, e o sítio dele também: não se
 * manda ninguém lá.
 */
function OperadorFerroviario({
  operador,
  demonstracao,
}: {
  operador?: { nome: string; sitio: string | null } | null;
  demonstracao: boolean;
}) {
  if (!operador?.nome) {
    return <p className="secundario">Horário planeado do operador ferroviário.</p>;
  }
  const sitio = !demonstracao && operador.sitio ? operador.sitio : null;
  const legivel = sitio
    ? sitio
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
    : '';
  return (
    <p className="secundario">
      Horário planeado do operador ferroviário ({operador.nome}).
      {sitio ? (
        <>
          {' '}
          Bilhetes e perturbações em <a href={sitio}>{legivel}</a>.
        </>
      ) : null}
    </p>
  );
}
