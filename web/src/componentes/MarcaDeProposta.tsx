import { exigirRegiao } from '@/lib/dados';
import { ORIGEM_DO_PRODUTO } from '@/lib/dados-do-navegador';
import { fraseDaProposta } from '@/lib/prosa';

/**
 * A faixa que diz que este sítio ainda não é da autoridade de transportes.
 *
 * É a irmã da `MarcaDeDemonstracao`, e o caso é o contrário do dela: a rede
 * existe, as paragens e os horários são os dela, os dados são públicos — e foi
 * isso que tornou a faixa precisa. Um sítio com o nome da rede, o logótipo dela
 * e as paragens dela lê-se como sendo DELA, e quem o abre antes de a
 * autoridade o adotar tem de saber que não é: quem responde pelo que aqui está
 * somos nós, e é connosco que se fala.
 *
 * INFORMA, NÃO ALARMA, como a da demonstração (P4-002): a cor da marca e não a
 * de alerta. O vermelho é dos avisos de serviço, que vão aparecer nesta mesma
 * página; gasto aqui, deixava de dizer «atenção» quando fosse preciso. Usa a
 * mesma classe da demonstração, para ter o mesmo desenho também no ecrã do
 * mapa — e a sua, para se poder distinguir.
 */
export default async function MarcaDeProposta({ regiao: id }: { regiao: string }) {
  const r = await exigirRegiao(id);
  if (!r.proposta || r.demonstracao) return null;
  // O CONTACTO DO PRODUTO PELA MORADA DELE, e não por `/`: no domínio desta
  // região, `/` é a própria região. Sem morada declarada não se sabe onde
  // está — e uma ligação que não leva aonde diz é pior do que nenhuma.
  const origem = ORIGEM_DO_PRODUTO === '/' ? null : ORIGEM_DO_PRODUTO;
  const { titulo, texto } = fraseDaProposta(r);
  return (
    <div className="marca-demonstracao marca-proposta" role="note">
      <p>
        <strong>{titulo}</strong> {texto}
        {origem && (
          <>
            {' '}
            <a href={`${origem}/contacto/`}>Falar connosco</a>
          </>
        )}
      </p>
    </div>
  );
}
