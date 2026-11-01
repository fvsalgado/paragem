/**
 * A quem se faz queixa de uma barreira de acessibilidade, que o Decreto-Lei
 * n.º 83/2018 manda dizer na declaração e a do produto não dizia: a ARTE, que
 * supervisiona o cumprimento do decreto, e o INR, que recebe as denúncias de
 * discriminação (n.º 1 do artigo 13.º, Lei n.º 46/2006). As frases são as das
 * declarações do Coreto, que já o diziam. Um componente só para a declaração
 * do produto e para a de cada região, com a mesma voz: o «você» implícito.
 */
export default function QueixasDeAcessibilidade() {
  return (
    <>
      <p>
        Se a resposta não chegar, ou não resolver o problema, pode apresentar queixa à ARTE —
        Agência para a Reforma Tecnológica do Estado, I. P., a entidade que supervisiona o
        cumprimento do Decreto-Lei n.º 83/2018.
      </p>
      <p>
        Uma pessoa com deficiência tratada de forma menos favorável do que outra em situação
        comparável, numa prática discriminatória prevista no artigo 4.º da Lei n.º 46/2006, pode
        apresentar queixa nos termos do n.º 1 do artigo 13.º do Decreto-Lei n.º 83/2018. O{' '}
        <a href="https://www.inr.pt/" target="_blank" rel="noopener noreferrer">
          Instituto Nacional para a Reabilitação (INR, I. P.)
        </a>{' '}
        tem um formulário para estas denúncias e encaminha-as às entidades competentes.
      </p>
    </>
  );
}
