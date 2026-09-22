import AppDoMapa from '@/componentes/AppDoMapa';
import {
  procura,
  exigirRegiao,
  temMosaicos,
  modos as lerModos,
  aPedido,
  caminhoDoModo,
  url,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import type { Ponto } from '@/lib/formato';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { disponibilidadeDaRegiao, motorDaRegiao } from '@/lib/enderecos';

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
  const pontos = await procura(rid);

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

  // Uma região sem recorte do OpenStreetMap não tem mosaicos, e a interface
  // di-lo em vez de desenhar um mapa vazio. Quem sabe é o inventário que o
  // pipeline publica com os dados — já não há disco para onde olhar.
  const temMapa = await temMosaicos(rid);

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

  return (
    <AppDoMapa
      regiao={rid}
      nomeDaRegiao={r.nome_com_artigo}
      emDaRegiao={r.em}
      centro={centro}
      pontos={pontos}
      mosaicos={enderecoDosDados(rid, 'regiao.pmtiles')}
      temMapa={temMapa}
      modos={modos}
      temAPedido={temAPedido}
      modosDesligados={r.modos_desligados ?? []}
      motorDaRegiao={motorDaRegiao(rid)}
      disponibilidadeDaRegiao={disponibilidadeDaRegiao(rid)}
    />
  );
}
