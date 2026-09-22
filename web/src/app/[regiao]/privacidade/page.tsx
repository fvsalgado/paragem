import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirRegiao, url } from '@/lib/dados';

export const metadata: Metadata = { title: 'Privacidade' };

/**
 * O que se mede e o que não se mede, dito a quem visita.
 *
 * Esta página existe mesmo na configuração sem cookies — em que não há dado
 * pessoal e a lei não obrigaria a nada. Dizer o que se recolhe quando não se é
 * obrigado é o que distingue não recolher dados pessoais de dizer que não se
 * recolhem.
 */
export default async function Privacidade({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const identificada = process.env.NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA === '1';

  return (
    <>
      <h1>Privacidade</h1>

      {identificada ? (
        <div className="faixa alerta">
          <p>
            <strong>Este sítio está configurado para seguir a mesma pessoa entre visitas.</strong>{' '}
            Nesse modo guarda-se um identificador no teu dispositivo, e isso exige o teu
            consentimento e uma base legal declarada.
          </p>
        </div>
      ) : (
        <p>
          <strong>Este sítio não guarda nada no teu dispositivo</strong> e não regista o teu
          endereço IP. Não há cookies, não há identificador, não há forma de ligar duas visitas à
          mesma pessoa.
        </p>
      )}

      <h2>O que se mede</h2>
      <p>Mede-se o que se procura, não quem procura:</p>
      <ul>
        <li>que páginas são vistas — que paragens, que linhas, que concelhos;</li>
        <li>
          que viagens são procuradas, pelo <strong>nome</strong> da paragem de partida e o da
          paragem de chegada, com o dia e a hora pedidos;
        </li>
        <li>
          <strong>que viagens não tiveram resposta.</strong> É o dado mais útil que este sítio
          produz: quem procura uma ligação que não existe está a dizer que precisa dela, e isso é
          matéria de planeamento da rede;
        </li>
        <li>quando o motor de viagens está em baixo.</li>
      </ul>

      <h2>O que não se mede</h2>
      <ul>
        <li>o teu nome, o teu email, o teu telefone — nunca são pedidos;</li>
        <li>a tua localização: o sítio não a pede ao navegador;</li>
        <li>
          o que escreves enquanto escreves — só a paragem que acabas por escolher, que é um nome
          público do horário da operadora;
        </li>
        <li>
          {identificada
            ? 'nada mais do que o acima.'
            : 'o teu endereço IP, e nada que permita reconhecer-te numa visita seguinte.'}
        </li>
      </ul>

      <h2>Quem processa</h2>
      <p>
        As medições são processadas pelo PostHog, em servidores na União Europeia. Os dados de
        transporte {r.de} são públicos e estão descritos em{' '}
        <Link href={url(rid, '/dados-abertos/')}>Dados e licenças</Link>.
      </p>

      <h2>Se quiseres saber mais</h2>
      <p>
        A declaração de acessibilidade está em{' '}
        <Link href={url(rid, '/acessibilidade/')}>Acessibilidade</Link>. O contacto para questões de
        privacidade é{' '}
        {r.autoridade?.nome
          ? `d${r.artigo === 'a' ? 'a' : 'o'} ${r.autoridade.nome}`
          : 'da entidade que publica o sítio'}
        , e ainda está por definir — como o de acessibilidade. Um contacto inventado é pior do que
        nenhum.
      </p>
    </>
  );
}
