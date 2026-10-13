import { emPreVisualizacao } from '@/lib/pre-visualizacao';

/**
 * A faixa que diz que esta versão ainda não está no ar.
 *
 * A pré-visualização tem o aspeto do sítio público e os dados dele — é para
 * isso que existe (`lib/pre-visualizacao.ts`) —, e por isso tem de se dizer em
 * todas as páginas, no invólucro e não em cada uma: o produto, as regiões e o
 * painel. Fora da pré-visualização não desenha nada.
 *
 * Em azul-noite e não no vermelho dos alertas: informa, não alarma. O vermelho
 * é dos avisos de serviço, que podem aparecer nesta mesma página.
 */
export default function FaixaDePreVisualizacao() {
  if (!emPreVisualizacao()) return null;
  return (
    <div className="faixa-pre-visualizacao" role="note">
      <p>
        <strong>Pré-visualização.</strong> Esta versão ainda não está no ar: é aqui que se confere
        antes de se publicar. Os horários são os do sítio público, e o painel está fechado.
      </p>
    </div>
  );
}
