import type { Metadata } from 'next';
import { dadosAbertos, exigirRegiao, lacunas } from '@/lib/dados';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { tamanho, type Descarga } from '@/lib/formato';

export const metadata: Metadata = { title: 'Dados e licenças' };

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
  nosso: 'inventado de propósito por nós, sob a licença do código — leve-se sem perguntar',
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
        {d.gerado_em ? ` · ${d.gerado_em}` : ''}
      </span>
      {d.descricao && <div className="secundario">{d.descricao}</div>}
      <div className="secundario">
        {TERMOS[d.termos ?? 'consulta'] ?? 'termos por confirmar'} · origem: {d.fonte}
        {d.atribuicao_obrigatoria && d.atribuicao
          ? ` · atribuição obrigatória: ${d.atribuicao}`
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
  const abertos = ds.filter((d) => d.termos === 'odbl' || d.termos === 'nosso');
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
          <p>
            <strong>Estes ficheiros reutilizam-se.</strong> Saem sob <strong>ODbL</strong> — pode
            levá-los, usá-los e redistribuí-los, com duas condições: atribuir a origem, e partilhar
            nos mesmos termos o que deles derivar. A atribuição vai dentro do próprio ficheiro, em{' '}
            <code>attributions.txt</code>, para não depender de ninguém se lembrar dela.
          </p>
          <p>
            Aqui está{' '}
            <strong>o que {r.autoridade?.nome ?? 'a autoridade de transportes'} gere</strong>. Os
            feeds de outros operadores — o ferroviário, os expressos, as carreiras de operadores
            vizinhos que entram na região — alimentam o mapa, as páginas de paragem e o planeador
            deste sítio, mas não se descarregam daqui: quem os distribui é quem os produz, que é
            também quem responde por eles estarem certos.
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
