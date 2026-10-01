import type { Metadata } from 'next';
import Link from 'next/link';
import { AUTOR, CONTACTO, correioPara } from '@/lib/produto';

export const metadata: Metadata = {
  title: 'Privacidade',
  description: 'O que o sítio do Paragem.pt mede e o que não mede, e quem responde por isso.',
};

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
 * mesmo dele: sem cookies, sem identificador, sem IP. E diz-se se se mede de
 * todo — sem chave configurada, o sítio não mede nada, e afirmar o contrário
 * era descrever um tratamento que não acontece.
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
            consentimento e uma base legal declarada.
          </p>
        </div>
      ) : (
        <p>
          <strong>Este sítio não guarda nada no seu dispositivo</strong> e não regista o seu
          endereço IP. Não há cookies, não há identificador, não há forma de ligar duas visitas à
          mesma pessoa.
        </p>
      )}

      <h2>O que se mede</h2>
      {mede ? (
        <p>
          Que páginas são vistas, e mais nada: mede-se o que se lê, não quem lê. As medições são
          processadas pelo PostHog, em servidores na União Europeia.
        </p>
      ) : (
        <p>Nada. Este sítio não tem a medição ligada.</p>
      )}

      <h2>O que não se mede</h2>
      <ul>
        <li>o seu nome, o seu email, o seu telefone — nunca são pedidos;</li>
        <li>a sua localização, que este sítio não pede;</li>
        <li>
          {identificada
            ? 'nada mais do que o acima.'
            : 'o seu endereço IP, e nada que permita reconhecê-lo numa visita seguinte.'}
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

      <h2>Quem responde</h2>
      <p>
        {AUTOR.nome}, que faz o Paragem.pt, pelo mesmo endereço. A declaração de acessibilidade
        deste sítio está em <Link href="/acessibilidade/">Acessibilidade</Link>.
      </p>
    </div>
  );
}
