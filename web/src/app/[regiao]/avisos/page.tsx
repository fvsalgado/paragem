import type { Metadata } from 'next';
import { CartaoDeAviso } from '@/componentes/Avisos';
import { avisosEmVigor } from '@/lib/avisos';
import { exigirRegiao } from '@/lib/dados';

export const metadata: Metadata = { title: 'Avisos' };

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
  const [r, as] = await Promise.all([exigirRegiao(rid), avisosEmVigor(rid)]);

  return (
    <>
      <h1>Avisos</h1>

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
          <p className="secundario">
            O que aparece aqui são as alterações ao serviço que a autoridade de transportes publica:
            supressões, desvios, greves. Um aviso cujo prazo já passou sai desta página.
          </p>
        </>
      ) : (
        as.map((a) => <CartaoDeAviso key={a.id} aviso={a} />)
      )}

      {/* DE QUE É QUE ESTES AVISOS SÃO, e é preciso dizê-lo: o sítio mostra
          comboios e expressos ao lado da rede da casa, e quem lê uma página de
          avisos sem avisos nenhuns tem direito a saber se isso quer dizer «não
          há» ou «não é aqui que se sabe». */}
      <p className="secundario">
        São os avisos dos serviços que{' '}
        {r.autoridade.sigla || r.autoridade.nome || 'a autoridade de transportes'} gere. Para
        alterações noutros serviços que aparecem neste sítio, o aviso é de quem os opera, e é no
        sítio dele que sai a tempo.
      </p>
      <p className="secundario">
        Os avisos publicados saem também em <a href="gtfs-rt/alerts.pb">GTFS-RT Service Alerts</a>,
        para quem os quiser mostrar noutro lado.
      </p>
    </>
  );
}
