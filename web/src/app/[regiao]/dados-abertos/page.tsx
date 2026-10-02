import type { Metadata } from 'next';
import { dadosAbertos, exigirRegiao, lacunas, regiao } from '@/lib/dados';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { tamanho, type Descarga } from '@/lib/formato';
import { aAutoridade } from '@/lib/prosa';
import { dataCompleta } from '@/lib/dias';
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
    titulo: 'Dados e licenças',
    descricao: `Os dados dos transportes ${r.de} para descarregar, cada ficheiro com a origem, a data e os termos.`,
    caminho: '/dados-abertos/',
  });
}

/**
 * Os grupos por que a página se organiza, e a ordem.
 *
 * Primeiro o que serve para USAR a rede — os horários —, depois o que serve
 * para a CONFERIR. Quem chega aqui vem quase sempre pelo primeiro; quem vem
 * pelo segundo sabe o que procura.
 */
const GRUPOS: { id: string; titulo: string; texto: string }[] = [
  {
    id: 'feeds',
    titulo: 'Horários em GTFS',
    texto: 'O formato que as aplicações de transportes leem. Um ficheiro por rede.',
  },
  {
    id: 'catalogos',
    titulo: 'Catálogos de serviços',
    texto:
      'Os serviços que não têm GTFS — transporte a pedido e urbanos municipais — como o sítio os lê.',
  },
  {
    id: 'bicicletas',
    titulo: 'Bicicletas partilhadas',
    texto:
      'GBFS estático: onde ficam as estações. Sem disponibilidade, que não é pública — e prometê-la seria inventá-la.',
  },
  {
    id: 'geometria',
    titulo: 'Pontos e percursos',
    texto: 'GeoJSON, para abrir num mapa sem escrever código.',
  },
  {
    id: 'decisoes',
    titulo: 'As decisões da construção',
    texto:
      'Uma linha por decisão: que paragem é cada nome do papel, que viagem herdou que paragens intermédias, e porquê quando não herdou nenhuma. É com isto que se confere o resto.',
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    texto: 'O que a última construção contou, e o que ficou por saber.',
  },
];

const TERMOS: Record<string, string> = {
  nosso: 'obra da casa, sob licença aberta — leve-se sem perguntar',
  odbl: 'ODbL — reutilizável com atribuição e partilha nos mesmos termos',
  consulta: 'sem licença aberta declarada — para consulta',
  terceiro: 'ficheiro de outra entidade — os termos são dela',
};

function Ficheiro({ d, regiao }: { d: Descarga; regiao: string }) {
  const nome = d.caminho ?? d.ficheiro;
  return (
    <li>
      <a href={enderecoDosDados(regiao, `descargas/${nome}`)} download>
        {nome}
      </a>{' '}
      <span className="secundario">
        {tamanho(d.bytes)}
        {/* «28/09/2026», como o resto do sítio escreve as datas — e não o
            «2026-09-28» do ficheiro (P1-046). */}
        {d.gerado_em && /^\d{4}-\d{2}-\d{2}$/.test(d.gerado_em)
          ? ` · ${dataCompleta(d.gerado_em.replace(/-/g, ''))}`
          : d.gerado_em
            ? ` · ${d.gerado_em}`
            : ''}
      </span>
      {d.descricao && <div className="secundario">{d.descricao}</div>}
      {/* A ATRIBUIÇÃO QUE O FICHEIRO LEVA DENTRO, dita aqui também — e não só
          a obrigatória. Numa região inventada, a página dizia «obra da casa» e
          o ficheiro, lá dentro, «© contribuidores do OpenStreetMap»; os dois
          dizem agora a da fonte de onde ele sai (P1-046, P2-026). */}
      <div className="secundario">
        {TERMOS[d.termos ?? 'consulta'] ?? 'termos por confirmar'} · origem: {d.fonte}
        {d.atribuicao
          ? ` · ${d.atribuicao_obrigatoria ? 'atribuição obrigatória' : 'atribuição'}: ${d.atribuicao}`
          : ''}
      </div>
    </li>
  );
}

export default async function DadosAbertos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const ds = await dadosAbertos(rid);
  const r = await exigirRegiao(rid);
  const l = await lacunas(rid);
  const porEsclarecer = ds.filter((d) => d.licenca_por_esclarecer);
  const sobOdbl = ds.filter((d) => d.termos === 'odbl');
  const daCasa = ds.filter((d) => d.termos === 'nosso');
  const abertos = [...sobOdbl, ...daCasa];
  const soParaConsulta = ds.filter((d) => d.termos === 'consulta');

  return (
    <>
      <h1>Dados e licenças</h1>
      <p>
        Os dados {r.de} são construídos a partir de fontes públicas, com um comando só, e o que
        falta fica escrito em vez de preenchido a palpite. Aqui estão os ficheiros que saem dessa
        construção, cada um com os seus termos.
      </p>

      {/* O AVISO MUDA CONFORME O QUE HÁ, e não é cosmética.

          Enquanto houve ficheiros que a construção fazia de documentos cujos
          termos não nos autorizavam a relicenciar, dizê-lo era honestidade.
          Deixar o mesmo aviso depois de eles saírem seria o contrário: uma
          página de dados abertos a pedir desculpa por dados que são abertos. */}
      {soParaConsulta.length ? (
        <div className="faixa alerta">
          <p>
            <strong>Nem todos estes ficheiros têm licença aberta declarada.</strong> Os que derivam
            do OpenStreetMap saem sob ODbL e reutilizam-se com atribuição
            {abertos.length ? ` (${abertos.length})` : ''}. Os que a construção faz a partir de
            documentos cujos termos não nos autorizam a relicenciar estão aqui{' '}
            <strong>para consulta</strong> ({soParaConsulta.length}): a publicação com licença
            aberta depende de autorização{' '}
            {r.autoridade?.nome
              ? `d${r.artigo === 'a' ? 'a' : 'o'} ${r.autoridade.nome}`
              : 'da autoridade de transportes'}
            .
          </p>
        </div>
      ) : (
        <div className="faixa">
          {/* SOB QUE LICENÇA, LIDO DO QUE ESTÁ LÁ. Esta frase dizia «saem sob
              ODbL» sempre, e numa região cujos ficheiros são todos obra da
              casa isso era falso — uma página de licenças a enganar-se na
              licença é pior do que uma página sem aviso nenhum. */}
          <p>
            <strong>Estes ficheiros reutilizam-se.</strong>{' '}
            {sobOdbl.length > 0 ? (
              <>
                {daCasa.length > 0 ? `${sobOdbl.length} ` : ''}
                {sobOdbl.length === 1 && daCasa.length > 0 ? 'sai' : 'saem'} sob{' '}
                <strong>ODbL</strong> — pode levá-los, usá-los e redistribuí-los, com duas
                condições: atribuir a origem, e partilhar nos mesmos termos o que deles derivar. A
                atribuição vai dentro do próprio ficheiro, para não depender de ninguém se lembrar
                dela: no <code>attributions.txt</code> dos GTFS, num <code>ATRIBUICAO.txt</code> nos
                outros zip, nos campos <code>attribution</code> e <code>license</code> dos JSON. Um
                CSV não tem onde a guardar, e leva-a aqui, ao lado.
              </>
            ) : null}
            {daCasa.length > 0 ? (
              <>
                {sobOdbl.length > 0
                  ? daCasa.length === 1
                    ? ' O outro é '
                    : ` Os outros ${daCasa.length} são `
                  : 'São '}
                obra da casa, sob a licença do código — levam-se sem perguntar nada a ninguém.
                {daCasa.some((d) => d.atribuicao)
                  ? ' Os que trazem atribuição levam-na dentro: é a da fonte de onde saem, e está também ao lado de cada um.'
                  : ''}
              </>
            ) : null}
          </p>
          <p>
            Aqui está <strong>o que {aAutoridade(r, 'com_artigo')} gere</strong>. Os feeds de outros
            operadores — o ferroviário, os expressos, as carreiras de operadores vizinhos que entram
            na região — alimentam o mapa, as páginas de paragem e o planeador deste sítio, mas não
            se descarregam daqui: quem os distribui é quem os produz, que é também quem responde por
            eles estarem certos.
          </p>
        </div>
      )}

      {GRUPOS.map((g) => {
        const doGrupo = ds.filter((d) => d.grupo === g.id);
        if (!doGrupo.length) return null;
        return (
          <section key={g.id}>
            <h2>{g.titulo}</h2>
            <p>{g.texto}</p>
            <ul className="descargas">
              {doGrupo.map((d) => (
                <Ficheiro key={d.caminho ?? d.ficheiro} d={d} regiao={rid} />
              ))}
            </ul>
          </section>
        );
      })}

      {porEsclarecer.length > 0 && (
        <p className="secundario">
          {porEsclarecer.length}{' '}
          {porEsclarecer.length === 1 ? 'destas licenças está' : 'destas licenças estão'} por
          esclarecer com quem publica a fonte.
        </p>
      )}

      {/* NÃO É UMA DESCARGA, e por isso não está na lista acima: é um endereço
          que responde com o que está no ar AGORA. Quem o consome sonda-o; um
          ficheiro com data não lhe servia de nada. */}
      <h2>Avisos em tempo real</h2>
      <p>
        As alterações ao serviço que a autoridade de transportes publica — supressões, desvios,
        greves — saem em <strong>GTFS-RT Service Alerts</strong>, o formato que as aplicações de
        transportes leem:
      </p>
      <p>
        <a href="../gtfs-rt/alerts.pb">
          <code>gtfs-rt/alerts.pb</code>
        </a>
      </p>
      <p>
        <strong>
          São os avisos dos serviços que a autoridade de transportes desta região gere
        </strong>{' '}
        — a mesma regra dos ficheiros aqui de cima. Este sítio mostra também serviços de outros
        operadores, e sobre esses o aviso é de quem os opera: espelhá-lo aqui era republicar
        informação de serviço de outra entidade, que a pode corrigir sem nos dizer.
      </p>
      <p>
        Cada pedido traz <strong>todos</strong> os avisos em vigor, e o que não vier deixou de
        valer. Sem avisos, o feed sai válido e vazio — que é diferente de não responder: se não
        conseguirmos ler a base, o endereço responde com um erro e não com um feed vazio, porque
        dizer «não há avisos» por cima de uma greve é pior do que não responder.
      </p>

      <h2>O que falta</h2>
      <p>
        O pipeline conta o que não sabe em todas as construções. Isto é o que contou da última vez:
      </p>
      {l.bloqueios.length > 0 && (
        <>
          <h3>Impede a publicação</h3>
          <ul>
            {l.bloqueios.map((b) => (
              <li key={b.id}>
                <strong>{b.o_que}</strong>
                {typeof b.quantos === 'number' ? ` (${b.quantos})` : ''} — {b.porque_importa}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Lacunas conhecidas</h3>
      <ul>
        {l.lacunas.map((x) => (
          <li key={x.id}>
            {x.o_que}
            {typeof x.quantos === 'number' ? ` (${x.quantos})` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}
