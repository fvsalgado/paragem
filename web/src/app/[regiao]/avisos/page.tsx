import type { Metadata } from 'next';
import { CartaoDeAviso } from '@/componentes/Avisos';
import { avisosEmVigor } from '@/lib/avisos';
import { catalogoDosAvisos } from '@/lib/avisos-do-sitio';
import { exigirRegiao, regiao } from '@/lib/dados';
import { aAutoridade } from '@/lib/prosa';
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
    titulo: 'Avisos',
    descricao: `Os avisos em vigor nos transportes ${r.de}.`,
    caminho: '/avisos/',
  });
}

/**
 * Um minuto, e a etiqueta dos avisos.
 *
 * Não é `force-dynamic`: publicar no painel invalida a etiqueta e esta página
 * rende-se de novo à visita seguinte, que é mais depressa do que qualquer
 * prazo. O minuto é o que sobra para o caso de o sinal se perder — e é também
 * o que faz um aviso marcado para as 8h aparecer às 8h e não quando alguém se
 * lembrar de publicar outra coisa.
 */
export const revalidate = 60;

export default async function Avisos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const [r, as, catalogo] = await Promise.all([
    exigirRegiao(rid),
    avisosEmVigor(rid),
    catalogoDosAvisos(rid),
  ]);

  return (
    <>
      <h1>Avisos</h1>
      {/* NUMA DEMONSTRAÇÃO OS AVISOS SÃO EXEMPLOS, e diz-se antes deles. O
          título de cada um já o diz; isto diz porque é que estão aqui — para
          mostrar o que o painel publica —, e que nenhum é verdadeiro. */}
      {r.demonstracao && (
        <p>
          Nesta demonstração, os avisos são exemplos: mostram como a autoridade de transportes
          publica uma alteração ao serviço, e nenhum é verdadeiro.
        </p>
      )}

      {/* TRÊS ESTADOS, E NÃO DOIS. «Não há avisos» e «não consegui ler»
          dizem coisas opostas a quem está à espera do autocarro, e a
          diferença entre elas é exatamente a que custa caro. */}
      {as === null ? (
        <div className="faixa alerta">
          <p>
            <strong>Não foi possível ler os avisos.</strong> Isto não quer dizer que não haja
            nenhum: quer dizer que não conseguimos perguntar. Tenta daqui a pouco; entretanto,
            confirma com a autoridade de transportes antes de contar com o serviço.
          </p>
        </div>
      ) : as.length === 0 ? (
        <>
          <p>Não há avisos em vigor.</p>
          {/* NUMA PROPOSTA, O SÍTIO NÃO FALA PELA AUTORIDADE. Dizia que aqui
              saíam «as alterações que a autoridade de transportes publica» —
              e numa região que ela ainda não adotou isso é falso: ela publica
              os avisos dela nos canais dela, e esta página pode não os ter.
              Quem lê «não há avisos» tem de saber onde confirmar. */}
          {r.proposta ? (
            <p className="secundario">
              O que aparece aqui são as alterações ao serviço publicadas neste sítio: supressões,
              desvios, greves. Este sítio ainda não é um serviço {aAutoridade(r, 'de')}, e por isso
              pode não ter os avisos oficiais — esses saem nos canais de quem gere e opera o
              serviço, e é lá que se confirma antes de contar com ele.
            </p>
          ) : (
            <p className="secundario">
              O que aparece aqui são as alterações ao serviço que a autoridade de transportes
              publica: supressões, desvios, greves. Um aviso cujo prazo já passou sai desta página.
            </p>
          )}
        </>
      ) : (
        as.map((a) => <CartaoDeAviso key={a.id} aviso={a} catalogo={catalogo} />)
      )}

      {/* DE QUE É QUE ESTES AVISOS SÃO, e é preciso dizê-lo: o sítio mostra
          comboios e expressos ao lado da rede da casa, e quem lê uma página de
          avisos sem avisos nenhuns tem direito a saber se isso quer dizer «não
          há» ou «não é aqui que se sabe». */}
      <p className="secundario">
        {r.proposta
          ? `Dizem respeito aos serviços geridos ${aAutoridade(r, 'por')}, e não são os avisos oficiais.`
          : `São os avisos dos serviços geridos ${aAutoridade(r, 'por')}.`}{' '}
        Para alterações noutros serviços que aparecem neste sítio, o aviso é de quem os opera, e é
        no sítio dele que sai a tempo.
      </p>
      <p className="secundario">
        Os avisos publicados saem também em <a href="gtfs-rt/alerts.pb">GTFS-RT Service Alerts</a>,
        para quem os quiser mostrar noutro lado — menos os que só dizem respeito a um modo inteiro,
        como as bicicletas, que esse formato não tem como dizer.
      </p>
    </>
  );
}
