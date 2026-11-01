import Link from 'next/link';
import DireitosDePrivacidade from '@/componentes/DireitosDePrivacidade';
import { AUTOR, CONTACTO, correioPara } from '@/lib/produto';
import { metadadosDoProduto } from '@/lib/metadados';

export const metadata = metadadosDoProduto({
  titulo: 'Privacidade',
  descricao: 'O que o sítio do Paragem.pt mede e o que não mede, e quem responde por isso.',
  caminho: '/privacidade/',
});

/**
 * A privacidade DO PRODUTO — a desta montra, e não a de uma região.
 *
 * Dava 404 no anfitrião do produto. A de cada região é outra coisa, e fica
 * onde está: lá mede-se a procura de viagens, que é o dado da autoridade de
 * transportes, e quem responde é ela. Aqui não há viagens, nem mapa, nem
 * localização — há páginas lidas por quem está a decidir —, e quem responde é
 * quem faz o produto. Uma página para as duas confundia as duas coisas.
 *
 * O que se mede é o mesmo código (`lib/medicao.ts`), e por isso diz-se o
 * mesmo dele — e o que se diz é o que o código faz: sem cookies e sem
 * identificador guardado, mas com o que a biblioteca de medição junta a cada
 * evento, e com o endereço IP a chegar a quem serve e a quem mede, como em
 * qualquer sítio. Dizia «o sítio não regista o seu endereço IP», que é uma
 * definição do projeto de medição e não uma garantia do código (ver a
 * privacidade de cada região). E diz-se se se mede de todo — sem chave
 * configurada, o sítio não mede nada, e afirmar o contrário era descrever um
 * tratamento que não acontece.
 */
export default function PrivacidadeDoProduto() {
  const identificada = process.env.NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA === '1';
  const mede = !!process.env.NEXT_PUBLIC_PARAGEM_POSTHOG;

  return (
    <div className="produto-texto">
      <h1>Privacidade</h1>
      <p className="produto-entrada">
        Esta página é do sítio do Paragem.pt — a página do produto e as de contacto, privacidade e
        acessibilidade. O sítio de cada região tem a sua, no endereço da região, e quem responde por
        ela é a autoridade de transportes que o publica.
      </p>

      {identificada ? (
        <div className="faixa alerta">
          <p>
            <strong>Este sítio está configurado para seguir a mesma pessoa entre visitas.</strong>{' '}
            Nesse modo guarda-se um identificador no seu dispositivo, e isso exige o seu
            consentimento e uma base legal declarada. O tema claro ou escuro, se o escolher, também
            fica guardado no seu navegador.
          </p>
        </div>
      ) : (
        <p>
          <strong>
            Este sítio só guarda uma coisa no seu dispositivo, e só se a escolher: o tema claro ou
            escuro.
          </strong>{' '}
          Fica no seu navegador, não é enviada a ninguém, e escolher «Como o aparelho» apaga-a. Não
          há cookies nem identificador guardado no seu dispositivo, e por isso duas visitas não se
          ligam à mesma pessoa.
        </p>
      )}

      <h2>O que se regista</h2>
      {mede ? (
        <p>
          Que páginas são vistas, e quando se sai delas: mede-se o que se lê, não quem lê. A
          biblioteca de medição junta a cada registo o endereço da página, a página de onde veio, o
          navegador e o sistema (com a identificação que o navegador envia), o tamanho do ecrã e da
          janela, a língua e o fuso horário do navegador, e um identificador ao acaso que{' '}
          {identificada
            ? 'fica no seu dispositivo e liga as suas visitas.'
            : 'liga as páginas de uma mesma visita e vive só na memória da página.'}{' '}
          As medições são processadas pelo PostHog, em servidores na União Europeia.
        </p>
      ) : (
        <p>Nada. Este sítio não tem a medição ligada.</p>
      )}

      <h2>O seu endereço IP</h2>
      <p>
        {identificada
          ? 'Neste modo, o endereço IP vai com as medições. '
          : 'O código deste sítio não o guarda, nem o envia como dado. '}
        {mede
          ? 'Chega, como em qualquer sítio, a quem o aloja e ao serviço de medição, com cada pedido. '
          : 'Chega, como em qualquer sítio, a quem o aloja, com cada pedido. '}
        {mede && !identificada
          ? 'O projeto de medição deste sítio está configurado para o descartar — é uma definição desse serviço, e não uma garantia do código. '
          : ''}
        A plataforma que aloja o sítio pode mantê-lo nos seus registos técnicos, nos termos dela.
      </p>

      <h2>O que não se regista</h2>
      <ul>
        <li>o seu nome, o seu email, o seu telefone — nunca são pedidos;</li>
        <li>a sua localização, que este sítio não pede;</li>
        <li>
          {identificada
            ? 'nada mais do que o acima.'
            : 'nada que permita reconhecê-lo numa visita seguinte.'}
        </li>
      </ul>

      <h2>Se nos escrever</h2>
      <p>
        Este sítio não tem formulário: o que escrever vai pelo correio, de si para{' '}
        <a href={correioPara('Privacidade do Paragem.pt')} className="endereco-de-correio">
          {CONTACTO}
        </a>
        , e serve para lhe responder.
      </p>

      <DireitosDePrivacidade mede={mede} identificada={identificada} email={CONTACTO} />

      <h2>Quem responde</h2>
      <p>
        {AUTOR.nome}, que faz o Paragem.pt, pelo mesmo endereço. A declaração de acessibilidade
        deste sítio está em <Link href="/acessibilidade/">Acessibilidade</Link>.
      </p>
    </div>
  );
}
