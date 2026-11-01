import type { Metadata } from 'next';
import { dadosAbertos, exigirRegiao, lacunas, regiao } from '@/lib/dados';
import { enderecoDaDescarga } from '@/lib/descargas';
import { tamanho, type Descarga } from '@/lib/formato';
import { aAutoridade } from '@/lib/prosa';
import { disponibilidadeDaRegiao } from '@/lib/enderecos';
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
    titulo: 'Dados abertos',
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
    // A MESMA REDE, NOUTRO FORMATO: o que o pipeline escreve do GTFS de cima,
    // validado contra o esquema oficial (docs/NETEX.md). Os termos são os do
    // GTFS de onde sai, e a página di-los ao lado de cada ficheiro, como aos
    // outros.
    id: 'netex',
    titulo: 'Horários em NeTEx',
    texto:
      'Os mesmos horários no formato europeu que o regulamento indica para os Pontos de Acesso Nacionais, no perfil de informação ao passageiro (EPIP). Cada ficheiro sai do GTFS com o mesmo nome, ali em cima, e diz o mesmo, sem os traçados.',
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
    // O TEXTO DEPENDE DE O SÍTIO LER AS CONTAGENS, e é decidido na página
    // (`textoDasBicicletas`): dizia «sem disponibilidade, que não é pública»
    // ao lado de um modo que as mostra ao vivo.
    texto: 'GBFS estático: onde ficam as estações.',
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

/**
 * O que se diz das bicicletas, conforme o sítio leia ou não as contagens.
 *
 * Dizia «sem disponibilidade, que não é pública — e prometê-la seria
 * inventá-la», e a página do modo mostrava as bicicletas e as docas livres de
 * cada estação, lidas no momento da página de estações que o próprio sistema
 * publica (`disponibilidade/`, ligada por decisão do dono). As duas coisas são
 * verdade ao mesmo tempo, e é isso que se escreve: o ficheiro é estático e não
 * as leva; o sítio lê-as ao vivo, e não as guarda nem as redistribui.
 */
function textoDasBicicletas(lidasAoVivo: boolean): string {
  return lidasAoVivo
    ? 'GBFS estático: onde ficam as estações, sem a disponibilidade. As bicicletas e as docas livres que a página das bicicletas mostra são lidas no momento, da página de estações que o próprio sistema publica — não se guardam nem se redistribuem daqui, e quando essa página não responde as estações aparecem sem contagem, em vez de uma contagem adivinhada.'
    : 'GBFS estático: onde ficam as estações. Sem disponibilidade: este sítio não a lê, e não a promete.';
}

const TERMOS: Record<string, string> = {
  nosso: 'obra da casa, sob licença aberta — leve-se sem perguntar',
  odbl: 'ODbL — reutilizável com atribuição e partilha nos mesmos termos',
  consulta: 'sem licença aberta declarada — para consulta',
  terceiro: 'ficheiro de outra entidade — os termos são dela',
};

function Ficheiro({ d }: { d: Descarga }) {
  const nome = d.caminho ?? d.ficheiro;
  return (
    <li>
      {/* PELO DOMÍNIO DA REGIÃO, e não pelo do armazém (P4-025): a rota
          redireciona para lá, e é este endereço que se copia. */}
      <a href={enderecoDaDescarga(d)} download>
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
        {/* A PARTE DO MAPA, num ficheiro que não é todo dele: é essa parte que
            está sob ODbL, e não o ficheiro — que leva dados de quem não nos
            deu licença nenhuma. */}
        {d.partes_odbl
          ? ` · a parte que vem do OpenStreetMap (${d.partes_odbl}) está sob ODbL`
          : ''}
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
  const soParaConsulta = ds.filter((d) => d.termos === 'consulta');

  return (
    <>
      <h1>Dados abertos</h1>
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
      {/* UM FACTO SOBRE OS TERMOS, E NÃO UM ALARME: numa faixa de informação.
          O vermelho é dos avisos de serviço (P1-017).

          E DIZ O QUE A ODbL NÃO FAZ. Esteve aqui que os ficheiros com
          horários e paragens da região saíam sob ODbL por terem partes do
          OpenStreetMap — e com isso «pode levá-los, usá-los e
          redistribuí-los» ao lado de dados que ninguém nos autorizou a
          reutilizar. A ODbL obriga quem usa o mapa; não dá direitos sobre os
          dados dos outros. */}
      {soParaConsulta.length ? (
        <div className="faixa informacao">
          <p>
            <strong>Nem todos estes ficheiros têm licença aberta declarada.</strong>{' '}
            {sobOdbl.length > 0 ? (
              <>
                Os que derivam só do OpenStreetMap saem sob ODbL e reutilizam-se com atribuição
                {` (${sobOdbl.length})`}.{' '}
              </>
            ) : null}
            Os que levam horários, paragens ou circuitos de quem gere e opera o serviço estão aqui{' '}
            <strong>para consulta</strong> ({soParaConsulta.length}): servem para ver e conferir,
            mas não se redistribuem com uma licença que não é nossa para dar. Quando um deles leva
            partes do OpenStreetMap, diz quais — essas partes estão sob ODbL, com a atribuição
            dentro do ficheiro. A publicação com licença aberta depende de autorização{' '}
            {aAutoridade(r, 'de')}.
          </p>
          <p>
            Aqui está <strong>o que {aAutoridade(r, 'com_artigo')} gere</strong>. Os feeds de outros
            operadores alimentam o mapa, as páginas de paragem e o planeador deste sítio, mas não se
            descarregam daqui: quem os distribui é quem os produz.
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
                <strong>ODbL</strong>, a licença que a declaração desta região lhes dá: assentam no
                OpenStreetMap, e a ODbL obriga a partilhar nos mesmos termos o que dele deriva. Pode
                levá-los, usá-los e redistribuí-los, com duas condições: atribuir a origem, e
                partilhar nos mesmos termos o que deles derivar. A atribuição vai dentro do próprio
                ficheiro, para não depender de ninguém se lembrar dela: no{' '}
                <code>attributions.txt</code> dos GTFS, num <code>ATRIBUICAO.txt</code> nos outros
                zip, nos campos <code>attribution</code> e <code>license</code> dos JSON. Um CSV não
                tem onde a guardar, e leva-a aqui, ao lado.
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
            <p>
              {g.id === 'bicicletas'
                ? textoDasBicicletas(disponibilidadeDaRegiao(rid, r.demonstracao) !== '')
                : g.texto}
            </p>
            <ul className="descargas">
              {doGrupo.map((d) => (
                <Ficheiro key={d.caminho ?? d.ficheiro} d={d} />
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
        {r.proposta
          ? 'As alterações ao serviço publicadas neste sítio'
          : 'As alterações ao serviço que a autoridade de transportes publica'}{' '}
        — supressões, desvios, greves — saem em <strong>GTFS-RT Service Alerts</strong>, o formato
        que as aplicações de transportes leem:
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
        — a mesma regra dos ficheiros aqui de cima
        {r.proposta
          ? `, e enquanto este sítio for uma proposta não são os avisos oficiais ${aAutoridade(r, 'de')}`
          : ''}
        . Este sítio mostra também serviços de outros operadores, e sobre esses o aviso é de quem os
        opera: espelhá-lo aqui era republicar informação de serviço de outra entidade, que a pode
        corrigir sem nos dizer.
      </p>
      <p>
        Cada pedido traz <strong>todos</strong> os avisos em vigor, e o que não vier deixou de valer
        — com uma exceção: um aviso que só diga respeito a um modo inteiro, como as bicicletas, sem
        nomear linhas nem paragens, fica só nas páginas do sítio, porque o formato não tem como o
        dizer sem o aplicar à rede toda. Sem avisos, o feed sai válido e vazio — que é diferente de
        não responder: se não conseguirmos ler a base, o endereço responde com um erro e não com um
        feed vazio, porque dizer «não há avisos» por cima de uma greve é pior do que não responder.
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
