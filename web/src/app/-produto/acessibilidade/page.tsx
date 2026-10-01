import type { Metadata } from 'next';
import VerificacoesDeAcessibilidade from '@/componentes/VerificacoesDeAcessibilidade';
import { CONTACTO, correioPara } from '@/lib/produto';

export const metadata: Metadata = {
  title: 'Acessibilidade',
  description:
    'A declaração de acessibilidade do sítio do Paragem.pt: o que se verifica, o que falta e para onde se escreve.',
};

/**
 * Quando a declaração foi revista. Muda quando alguém a volta a rever —
 * não com cada construção, que não a lê.
 */
const REVISTA_A = '1 de outubro de 2026';

/**
 * A declaração de acessibilidade DO PRODUTO — a desta montra, e não a de uma
 * região.
 *
 * Dava 404 no anfitrião do produto (P4-003): a página que vende um sítio
 * acessível, nos termos do Decreto-Lei n.º 83/2018, não tinha declaração
 * nenhuma. As regiões têm a sua, e são outra coisa: o sítio de uma região é
 * publicado em nome da autoridade de transportes, e a declaração dele é dela —
 * com o contacto dela, que ela ainda tem de indicar. Esta é do produto, e o
 * contacto do produto existe; por isso aqui não há nada «por preencher».
 *
 * O que se verifica sozinho é a mesma peça nas duas
 * (`VerificacoesDeAcessibilidade`), porque é o mesmo código a ser verificado.
 */
export default function AcessibilidadeDoProduto() {
  return (
    <div className="produto-texto">
      <h1>Declaração de acessibilidade</h1>
      <p className="produto-entrada">
        Esta declaração é do sítio do Paragem.pt — a página do produto e as de contacto, privacidade
        e acessibilidade. O sítio de cada região tem a sua, publicada pela autoridade de transportes
        no endereço da região.
      </p>
      <p>
        Segue a estrutura que o Decreto-Lei n.º 83/2018, de 19 de outubro, pede aos sítios das
        entidades públicas. Este não é de uma entidade pública, e publica-a na mesma: é o que
        oferece às autoridades que o licenciam.
      </p>

      <h2>Estado de conformidade</h2>
      <p>
        O objetivo é a conformidade com as <strong>WCAG 2.1 nível AA</strong>. O sítio ainda não foi
        objeto de avaliação externa.
      </p>

      <h2>O que já se verifica automaticamente</h2>
      <VerificacoesDeAcessibilidade comLinhas={false} />

      <h2>O que não está conforme</h2>
      <ul>
        <li>
          <strong>Não houve avaliação por pessoas com deficiência.</strong> Uma verificação
          automática apanha talvez metade do que interessa; o resto vê-se com quem usa.
        </li>
      </ul>

      <h2>Como foi preparada</h2>
      <p>
        Por autoavaliação, com verificação automática em cada alteração ao código. Revista a{' '}
        {REVISTA_A}.
      </p>

      <h2>Contacto</h2>
      <p>
        Para comunicar um problema de acessibilidade neste sítio, ou pedir a informação de uma
        página noutro formato, escreva para{' '}
        <a href={correioPara('Acessibilidade do Paragem.pt')} className="endereco-de-correio">
          {CONTACTO}
        </a>
        .
      </p>
      <p className="secundario">
        Um problema no sítio de uma região é com a autoridade de transportes dessa região: a
        declaração de acessibilidade dela está no endereço da região.
      </p>
    </div>
  );
}
