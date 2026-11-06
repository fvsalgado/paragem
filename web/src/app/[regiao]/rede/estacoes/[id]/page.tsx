import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
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
  paragensPertoPorNome,
  regiao,
  temMosaicos,
  modos as lerModos,
  calendarioDaRegiao,
  procura,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import ProximasPartidas from '@/componentes/ProximasPartidas';
import PartidasDoDia from '@/componentes/PartidasDoDia';
import Distintivo from '@/componentes/Distintivo';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
} from '@/componentes/DisponibilidadeBicicletas';
import { metadadosDaRegiao } from '@/lib/metadados';
import { feedsDosServicos } from '@/lib/formato';
import { servicosNoDia } from '@/lib/dias';
import { diaNoFuso } from '@/lib/fuso';
import { disponibilidadeDaRegiao } from '@/lib/enderecos';
import { tambemAqui, RAIO_DA_PORTA } from '@/lib/tambem-aqui';
import { emMetros, lista, semPrefixos } from '@/lib/prosa';

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
  // A mesma regra da lista das estações (`paragensPertoPorNome`).
  const aPorta = await Promise.all(
    paragensPertoPorNome(e.paragens_perto).map(async ({ nome, ...g }) => {
      const fichas = (await Promise.all(g.ids.map((i) => lerParagem(rid, i)))).filter(
        (f): f is NonNullable<typeof f> => !!f,
      );
      const partidas = fichas
        .flatMap((f) => f.partidas)
        .sort((a, b) => a.hora.localeCompare(b.hora));
      return { nome, id: g.ids[0], metros: g.metros, partidas };
    }),
  );

  // OS COMBOIOS QUE PARAM AQUI, pelos tipos que o operador lhes dá (#82): o
  // subtítulo dizia «Estação de comboio em <concelho>», que o título já
  // quase dizia. Os tipos dizem que serviço se apanha aqui.
  const partidas = ficha?.partidas ?? [];
  const tipos = [...new Set(partidas.map((d) => d.linha).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt'),
  );

  // O DIA DE HOJE JÁ NO HTML, como na paragem (`PartidasDoDia`): os serviços
  // que andam no dia em que a página se fez, pela tabela dos dias do servidor.
  const calendario = await calendarioDaRegiao(rid);
  const hojeNoServidor = diaNoFuso(new Date()).replace(/-/g, '');
  const ativosHoje = calendario ? servicosNoDia(calendario, hojeNoServidor) : null;
  const servicos = [...new Set(partidas.map((d) => d.servico_id).filter((x): x is string => !!x))];
  const doDiaNoServidor = ativosHoje
    ? { hoje: hojeNoServidor, servicos: servicos.filter((x) => ativosHoje.has(x)) }
    : null;

  // O QUE MAIS HÁ À PORTA (#82): bicicletas, táxis, o urbano, o expresso — a
  // poucos passos, com a distância e o caminho para cada um.
  const dosModos = await lerModos(rid);
  const aqui = tambemAqui(e, dosModos);
  const noMapa = new Set(temMapa ? (await procura(rid)).map((x) => x.id) : []);
  const comBicicletas = aqui.some((x) => x.modo === 'bicicleta');
  // O nome sem o sistema e sem a terra, que a linha de baixo e o título já
  // dizem: «Praça da República», e não «<sistema> - <terra> - Praça da
  // República».
  const nomeAqui = (x: (typeof aqui)[number]) =>
    semPrefixos(x.nome, [x.de, concelho?.nome ?? '', e.nome].filter(Boolean));

  const tambem =
    aqui.length > 0 ? (
      <section aria-labelledby="tambem-aqui" className="tambem-aqui">
        <h2 id="tambem-aqui">Também aqui</h2>
        <ul className="pontos-de-modo">
          {aqui.map((x) => (
            <li key={`${x.modo}-${x.nome}-${x.metros}`}>
              <span className="nome">
                {nomeAqui(x)}
                <span className="secundario"> · {emMetros(x.metros)}</span>
              </span>
              <span className="onde">
                <Link href={url(rid, `modos/${x.modo}/`)}>{NOME_DOS_MODOS[x.modo] ?? x.modo}</Link>
                {x.de && x.de !== x.nome ? ` · ${x.de}` : ''}
              </span>
              {x.modo === 'bicicleta' && <ContagemDaEstacao id={x.id} emLinhaPropria />}
              {x.id && noMapa.has(x.id) && (
                <span className="accoes">
                  <a href={url(rid, `/?ponto=${encodeURIComponent(x.id)}`)}>
                    Ver no mapa<span className="so-para-leitores">: {nomeAqui(x)}</span>
                  </a>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

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
        {tipos.length > 0 && (
          <>
            {' · '}
            <span className="so-para-leitores">
              {tipos.length === 1 ? 'comboio ' : 'comboios '}
              {lista(tipos)}.
            </span>
            <span aria-hidden="true" className="tipos-de-comboio">
              {tipos.map((t) => (
                <Distintivo key={t} codigo={t} modo="comboio" />
              ))}
            </span>
          </>
        )}
        {/* O PONTO SÓ QUANDO A FRASE ACABA EM PALAVRAS: depois das tabuletas
            dos comboios ficava um ponto solto, a seguir a uma pastilha. Quem
            ouve tem-no na frase escondida. */}
        {tipos.length === 0 && '.'}
      </p>

      {/* NUM ECRÃ LARGO, LADO A LADO (#83), como a paragem: a estação usava
          576 px de 1 440, com os comboios e o autocarro empilhados a um ecrã
          de distância. À direita, o que se apanha a seguir e o que há à porta;
          à esquerda, as partidas do dia inteiro. No telemóvel, o que parte a
          seguir e o que há à porta primeiro, e a lista do dia — comprida — no
          fim. */}
      <div className="em-colunas estacao-em-colunas">
        {/* OS COMBOIOS QUE O SÍTIO JÁ TEM. A página dizia «os horários da CP não
            são publicados aqui», e o planeador do mesmo sítio propunha comboios
            ao minuto: a estação negava o que o sítio sabe. As partidas vêm da
            mesma grelha que o planeador usa. */}
        <section aria-labelledby="comboios" className="a-seguir ao-lado">
          {partidas.length > 0 ? (
            <ProximasPartidas
              regiao={rid}
              partidas={compactar(partidas)}
              cores={{}}
              modo="comboio"
              Titulo="h2"
              id="comboios"
              titulo="Comboios a seguir"
              quantas={4}
            />
          ) : (
            <>
              <h2 id="comboios">Comboios a seguir</h2>
              <p>
                {ficha
                  ? 'Nos horários carregados, nenhum comboio parte desta estação.'
                  : 'As horas dos comboios desta estação ainda não estão nesta página — o planeador já as usa: procure a viagem em «Como chegar».'}
              </p>
            </>
          )}
          <OperadorFerroviario operador={e.operador} demonstracao={!!r?.demonstracao} />
        </section>

        {/* O QUE SE PROCURA PRIMEIRO, E O RESTO DEPOIS (auditoria de
            1/11/2026, #80): a nota sobre os dados logo a seguir às horas, que
            é a quem ela responde — «não é tempo real» —, e os botões a seguir
            a ela. */}
        <div className="ao-lado">
          <MarcaDeDados
            regiao={rid}
            modos={['comboio']}
            feeds={feedsDosServicos(partidas.map((d) => d.servico_id))}
          />
          <p className="cartao-accoes">
            <Link className="botao" href={url(rid, `/viagem/?para=${encodeURIComponent(e.nome)}`)}>
              Como chegar aqui
            </Link>
            {/* Só onde há mapa: numa região sem mosaicos o início não tem mapa. */}
            {temMapa && <a href={url(rid, `/?ponto=${encodeURIComponent(e.id)}`)}>Ver no mapa</a>}
          </p>
        </div>

        {/* O AUTOCARRO À PORTA NO MESMO CARTÃO DOS COMBOIOS (#166): são a
            mesma pergunta — o que parte daqui a seguir —, e um vinha num
            cartão branco e o outro solto no fundo. */}
        <section aria-labelledby="autocarro" className="a-seguir ao-lado">
          <h2 id="autocarro">Autocarro à porta</h2>
          {e.sem_ligacao ? (
            // UM FACTO QUE NÃO MUDA AMANHÃ, numa faixa de informação: a de
            // alerta é para o que mudou hoje (P1-017).
            <div className="faixa informacao">
              <p>
                <strong>
                  Não há paragem de autocarro a menos de {emMetros(300)} desta estação.
                </strong>{' '}
                Quem aqui chegar de comboio tem de contar com outra maneira de sair — a pé, de táxi,
                ou com quem o venha buscar.
              </p>
            </div>
          ) : (
            aPorta.map((g) => (
              <div key={g.nome} className="paragem-a-porta">
                <h3>
                  <Link href={urlDaParagem(rid, g.id)}>{g.nome}</Link>{' '}
                  <span className="secundario">· {emMetros(g.metros)}</span>
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

        {tambem && (
          <div className="ao-lado">
            {comBicicletas ? (
              <DisponibilidadeBicicletas endereco={disponibilidadeDaRegiao(rid, r?.demonstracao)}>
                {tambem}
              </DisponibilidadeBicicletas>
            ) : (
              tambem
            )}
            <p className="secundario">
              A menos de {emMetros(RAIO_DA_PORTA)} da estação, em linha reta.
            </p>
          </div>
        )}
        {/* O DIA INTEIRO, E OUTRO DIA (#81). Mostravam-se seis partidas, sem
            «ver mais», sem outro dia e sem sentidos: na estação mais servida da
            região, a última era às 21:21 e os comboios para o Sul e para o
            Norte vinham misturados. Agora é a lista do dia, de hoje, de amanhã
            ou de outra data, e escolhe-se para onde. */}
        {partidas.length > 0 && (
          <section aria-labelledby="partidas-do-dia" className="partidas-da-estacao">
            <h2 id="partidas-do-dia">Partidas do dia</h2>
            <PartidasDoDia
              regiao={rid}
              partidas={compactar(partidas)}
              cores={{}}
              nomesDosServicos={{}}
              noServidor={doDiaNoServidor}
              caminhoDasLinhas={null}
              modo="comboio"
              deQue="desta estação"
              porDestino
            />
          </section>
        )}
      </div>
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
