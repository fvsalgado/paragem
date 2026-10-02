import type { Metadata } from 'next';
import { preconnect, preload } from 'react-dom';
import AppDoMapa from '@/componentes/AppDoMapa';
import { marcaDaRegiao, nomesDaAssinatura } from '@/lib/marca';
import CatalogoDaRegiao from '@/componentes/CatalogoDaRegiao';
import {
  procura,
  regiao,
  exigirRegiao,
  temMosaicos,
  modos as lerModos,
  aPedido,
  caminhoDoModo,
  lacunas,
  servicosSemDatas,
  url,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import type { Ponto } from '@/lib/formato';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { disponibilidadeDaRegiao, motorDaRegiao } from '@/lib/enderecos';
import { metadadosDaRegiao } from '@/lib/metadados';
import { avisosEmVigor, type AvisoNoMapa } from '@/lib/avisos';
import { catalogoDosAvisos } from '@/lib/avisos-do-sitio';

/** O início fica com o título do invólucro («Transportes da …»); a frase é dele. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const r = await regiao((await params).regiao);
  if (!r) return {};
  return metadadosDaRegiao(r, {
    descricao: `Todos os transportes ${r.de}, num sítio só: o mapa, o que passa a seguir em cada paragem e como ir de um sítio a outro.`,
    caminho: '/',
  });
}

/**
 * A porta de entrada de uma região: O MAPA.
 *
 * Era uma página de listas — modos, concelhos, títulos — e isso fazia dela um
 * bom catálogo e um mau serviço. Quem chega a isto não sabe o nome da linha
 * nem o da paragem: sabe onde está e para onde quer ir.
 *
 * O catálogo não desapareceu. Mudou-se para `/rede/`, onde continua estático,
 * indexável e legível por leitor de ecrã — é a espinha por baixo da aplicação,
 * e é também o caminho para quem não pode ou não quer usar um mapa.
 */
export default async function Inicio({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);

  // SEM MOSAICOS, O INÍCIO NÃO É UM MAPA (P1-040, P2-041, P4-001).
  //
  // Era: um ecrã de mapa com o mapa em falta — uma caixa cinzenta a dizer que
  // faltava «o recorte do OpenStreetMap» —, e era o primeiro ecrã das duas
  // demonstrações, o que se mostra a quem decide. Uma região sem mosaicos abre
  // na vista sem mapa: a procura, o planeador e o «Perto de ti», com as listas
  // por baixo. Vale para qualquer região, real ou inventada, e não se escolhe
  // por nome: no dia em que os mosaicos se publicarem, o início passa a ser o
  // mapa sem tocar em código. Quem sabe é o inventário do que se publicou.
  if (!(await temMosaicos(rid))) return <CatalogoDaRegiao regiao={rid} inicio />;

  // O MAPA COMEÇA A CHEGAR COM A PÁGINA, e não depois dela (P3-023).
  //
  // O MapLibre só se pedia quando a aplicação acordava, e o processador só
  // depois de o MapLibre chegar: medido em 4G lenta na região real, o primeiro
  // mosaico pedia-se aos 8 s. Os três módulos e a folha de estilo pedem-se
  // agora logo no `<head>`, ao lado do JavaScript da página — o tempo de os
  // descarregar sobrepõe-se ao dela, e quando a aplicação os pede já cá estão.
  // E abre-se já a ligação ao armazém dos dados, de onde vêm os pontos e os
  // mosaicos: num telemóvel em 4G são duas idas e voltas a menos.
  //
  // COM PRIORIDADE BAIXA: chegam DEPOIS do JavaScript da página, que é o que
  // a acorda — e o esboço dos pontos e a procura estão à espera dela.
  const pasta = `/maplibre/${process.env.NEXT_PUBLIC_MAPLIBRE}`;
  const modulos = ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs'];
  preload(`${pasta}/maplibre-gl.css`, { as: 'style', fetchPriority: 'low' });
  const dados = enderecoDosDados(rid, '');
  if (/^https?:\/\//.test(dados)) preconnect(new URL(dados).origin, { crossOrigin: 'anonymous' });
  // OS PONTOS TAMBÉM, MAS DEPOIS DO QUE PINTA A PÁGINA. Saíram do HTML
  // (P3-006) e pedem-se à parte; com prioridade baixa, o navegador só os vai
  // buscar depois da folha de estilo e do JavaScript da página — e quando a
  // aplicação os pede, já vêm a caminho, e o esboço do mapa aparece cedo.
  preload(enderecoDosDados(rid, 'procura.json'), {
    as: 'fetch',
    crossOrigin: 'anonymous',
    fetchPriority: 'low',
  });

  // OS PONTOS LEEM-SE AQUI E NÃO VÃO NA PÁGINA (P3-006). Iam para o
  // componente do mapa, e com isso para o HTML: 410 kB dos 431 do início da
  // região real, e outra vez em cada pré-carregamento desta página. O
  // navegador pede-os à parte, depois de pintar (`lib/pontos-do-navegador.ts`).
  // Daqui saem só as contas que o primeiro pixel precisa: onde abrir, que
  // camadas há, e quantas paragens e estações dizer a quem não vê o mapa.
  const pontos = await procura(rid);
  const tipos = [...new Set(pontos.map((p) => p.tipo))];
  const contagens = {
    paragens: pontos.filter((p) => p.tipo === 'paragem').length,
    estacoes: pontos.filter((p) => p.tipo === 'estacao').length,
  };

  // O MAPA ABRE ONDE HÁ TRANSPORTES, e não no centro geométrico da caixa.
  //
  // O centro da caixa desta região cai no meio de uma albufeira: abria-se a
  // aplicação e via-se água, mato e nem uma paragem — parecia avariada. E não
  // era um azar desta região: a caixa é um retângulo à volta de TUDO, pontas
  // de linhas que saem do território incluídas, e o meio de um retângulo não
  // é o meio de uma rede.
  //
  // Abre no ponto com MAIS PARTIDAS, que é o cais mais servido da região. Não
  // é uma cidade escolhida a dedo — é uma conta sobre os horários, e muda com
  // eles. À volta dele há sempre rede para ver: é o sítio onde um mapa de
  // transportes parece um mapa de transportes.
  //
  // Sem partidas nenhumas — uma região só com bicicletas, ou ainda sem
  // horários — vale o centro da caixa, que é o que há.
  const maisServido = pontos.reduce<Ponto | null>(
    (melhor, p) => ((p.partidas ?? 0) > (melhor?.partidas ?? 0) ? p : melhor),
    null,
  );
  const centro: [number, number] = maisServido
    ? [maisServido.lat, maisServido.lon]
    : [(r.caixa.lat_min + r.caixa.lat_max) / 2, (r.caixa.lon_min + r.caixa.lon_max) / 2];

  // OS MODOS QUE A REGIÃO DECLARA, já com o destino de cada um.
  //
  // Calculados aqui, no servidor, e não no navegador: o componente do mapa
  // não sabe o que é uma região, e não é aqui que vai passar a saber. O que
  // lhe chega é uma lista de nomes e endereços.
  const comPagina = await lerModos(rid);
  const temAPedido = !!(await aPedido(rid));
  const modos = r.modos
    .map((m) => {
      const caminho = caminhoDoModo(m, (x) => x in comPagina);
      if (!caminho) return null;
      if (m === 'a-pedido' && !temAPedido) return null;
      return { id: m, nome: NOME_DOS_MODOS[m] ?? m, href: url(rid, caminho) };
    })
    .filter((x): x is { id: string; nome: string; href: string } => x !== null);

  // OS AVISOS EM VIGOR, para o ecrã do mapa (P4-019): só o que o mapa precisa
  // de saber — o título, a gravidade, a que diz respeito e o número das
  // linhas. São poucos, e o texto inteiro fica na página de avisos.
  //
  // O QUE ISTO CUSTA: o início passa a refazer-se ao minuto em vez de à hora,
  // como o catálogo (`lib/avisos.ts`, `VALIDADE_S`). Os dados dele continuam
  // guardados por uma hora; o que se repete é render o HTML, e só quando
  // alguém o pede.
  const [emVigor, catalogo] = await Promise.all([avisosEmVigor(rid), catalogoDosAvisos(rid)]);
  const avisos: AvisoNoMapa[] = (emVigor ?? []).map((a) => ({
    id: a.id,
    titulo: a.titulo,
    gravidade: a.gravidade,
    linhas: a.linhas,
    paragens: a.paragens,
    modos: a.modos,
    distintivos: a.linhas.map((id) => {
      const l = catalogo.linhas.get(id);
      return { id, codigo: l?.codigo ?? id, cor: l?.cor ?? null, modo: l?.modo };
    }),
  }));

  return (
    <>
      {/* O `preloadModule` do React não deixa dizer a prioridade; o `<link>`
          deixa, e o React leva-o para o `<head>` na mesma. */}
      {modulos.map((m) => (
        <link key={m} rel="modulepreload" href={`${pasta}/${m}`} fetchPriority="low" />
      ))}
      <AppDoMapa
        regiao={rid}
        marca={marcaDaRegiao(r)}
        assinatura={nomesDaAssinatura(r)}
        deDaRegiao={r.de}
        emDaRegiao={r.em}
        centro={centro}
        caixa={r.caixa}
        tipos={tipos}
        contagens={contagens}
        mosaicos={enderecoDosDados(rid, 'regiao.pmtiles')}
        atribuicaoDoMapa={r.mapa?.atribuicao}
        modos={modos}
        temAPedido={temAPedido}
        modosDesligados={r.modos_desligados ?? []}
        motorDaRegiao={motorDaRegiao(rid, r.demonstracao)}
        disponibilidadeDaRegiao={disponibilidadeDaRegiao(rid, r.demonstracao)}
        servicosSemDatas={servicosSemDatas(await lacunas(rid))}
        avisos={avisos}
      />
    </>
  );
}
