import VerificacoesDeAcessibilidade from '@/componentes/VerificacoesDeAcessibilidade';
import { AUTOR, CONTACTO, correioPara } from '@/lib/produto';
import { metadadosDoProduto } from '@/lib/metadados';
import QueixasDeAcessibilidade from '@/componentes/QueixasDeAcessibilidade';

export const metadata = metadadosDoProduto({
  titulo: 'Acessibilidade',
  descricao:
    'A declaração de acessibilidade do sítio do Paragem.pt: o que se verifica, o que falta e para onde se escreve.',
  caminho: '/acessibilidade/',
});

/**
 * Quando a declaração foi revista. Muda quando alguém a volta a rever —
 * não com cada construção, que não a lê.
 */
const REVISTA_A = '13 de outubro de 2026';

/**
 * A declaração de acessibilidade DO PRODUTO — a desta montra, e não a de uma
 * região.
 *
 * Dava 404 no anfitrião do produto (P4-003): a página que vende um sítio
 * acessível, nos termos do Decreto-Lei n.º 83/2018, não tinha declaração
 * nenhuma. As regiões têm a sua, e são outra coisa: o sítio de uma região é
 * publicado em nome da autoridade de transportes, e a declaração dele é dela —
 * com o contacto dela, e o do produto enquanto ela não o indicar
 * (`lib/contactos.ts`). Esta é do produto, e o contacto é o do produto.
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

      {/* NÃO SE DECLARA CONFORME O QUE NÃO FOI AVALIADO. Dizia «o objetivo é a
          conformidade» e a montra dizia «Acessível: WCAG 2.1 AA»: a segunda
          frase afirmava o que só uma avaliação manual pode afirmar. */}
      <h2>Estado de conformidade</h2>
      <p>
        <strong>Por avaliar.</strong> O objetivo é a conformidade com as WCAG 2.1 nível AA, mas o
        sítio ainda não foi avaliado à mão — nem de ponta a ponta por nós, nem por uma entidade
        externa, nem com pessoas com deficiência —, e por isso não se declara conforme. O que se
        sabe é o que os testes automáticos verificam.
      </p>

      <h2>O que foi verificado, e como</h2>
      <VerificacoesDeAcessibilidade comLinhas={false} />

      <h2>O que não está conforme, ou ainda não se sabe</h2>
      <ul>
        <li>
          <strong>Não houve avaliação manual, nem por pessoas com deficiência.</strong> Um teste
          automático apanha uma parte do que interessa; o resto vê-se com quem usa.
        </li>
      </ul>

      <h2>Como foi preparada</h2>
      <p>Por autoavaliação, só com os testes automáticos descritos acima. Revista a {REVISTA_A}.</p>

      <h2>Contacto</h2>
      <p>
        Responde por esta declaração {AUTOR.nome}, que faz o Paragem.pt. Para comunicar um problema
        de acessibilidade neste sítio, ou pedir a informação de uma página noutro formato, escreva
        para{' '}
        <a href={correioPara('Acessibilidade do Paragem.pt')} className="endereco-de-correio">
          {CONTACTO}
        </a>
        .
      </p>
      <QueixasDeAcessibilidade />
      <p className="secundario">
        O sítio de cada região tem a sua declaração, no endereço da região, com o contacto de quem
        responde por ela.
      </p>
    </div>
  );
}
