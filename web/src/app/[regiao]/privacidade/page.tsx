import type { Metadata } from 'next';
import Link from '@/componentes/Ligacao';
import DireitosDePrivacidade from '@/componentes/DireitosDePrivacidade';
import { exigirRegiao, temMosaicos, url, regiao } from '@/lib/dados';
import { aAutoridade } from '@/lib/prosa';
import { DO_PRODUTO, lerContactos, responsavelNaFrase } from '@/lib/contactos';
import { motorDaRegiao } from '@/lib/enderecos';
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
    titulo: 'Privacidade',
    descricao: `O que o sítio dos transportes ${r.de} mede, e o que não mede.`,
    caminho: '/privacidade/',
  });
}

/**
 * O que se regista e o que não se regista, dito a quem visita.
 *
 * DIZIA «NÃO HÁ DADO PESSOAL» E «O SÍTIO NÃO REGISTA O TEU ENDEREÇO IP», e o
 * código não o prova. O endereço IP chega a quem serve o sítio e ao serviço de
 * medição com cada pedido, como em qualquer sítio; as opções da biblioteca de
 * medição que o deviam cortar não têm efeito na versão instalada, e quem o
 * descarta é uma definição do projeto de medição (confirmada pelo dono a
 * 4/10/2026, `docs/PLANO-CRUZADO.md`). E a biblioteca junta a cada evento o
 * navegador, o sistema, o ecrã, a língua, o fuso e a página de onde se veio.
 * A página passa a dizer isso, e a distinguir o que o código garante do que
 * depende de uma definição que o repositório não mostra.
 *
 * E só diz que se mede quando se mede: sem a chave da medição configurada,
 * nada sai do navegador para medir — como a privacidade do produto já dizia.
 */
export default async function Privacidade({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const identificada = process.env.NEXT_PUBLIC_PARAGEM_MEDICAO_IDENTIFICADA === '1';
  const mede = !!process.env.NEXT_PUBLIC_PARAGEM_POSTHOG;
  // Com motor de viagens, a partida vai-lhe no pedido; sem ele, o planeador
  // corre no navegador e a coordenada não sai de lá (`planeador.ts`).
  const comMotor = motorDaRegiao(rid, r.demonstracao) !== '';
  // Uma região sem recorte do OpenStreetMap não tem mapa, nem botão no mapa.
  const comMapa = await temMosaicos(rid);
  // Quem responde pelos dados e a quem se escreve: da autoridade, no painel (P4-024).
  const contactos = await lerContactos(rid);
  // ENQUANTO A AUTORIDADE NÃO INDICAR, responde quem faz o produto, pelo
  // contacto do produto (`DO_PRODUTO`). Dizia «Por preencher».
  const declarado = responsavelNaFrase(contactos, aAutoridade(r, 'com_artigo'));
  const responsavel = declarado ?? DO_PRODUTO.responsavel;
  const emailDePrivacidade = contactos?.privacidade_email || (declarado ? null : DO_PRODUTO.email);

  return (
    <>
      <h1>Privacidade</h1>

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
        <>
          <p>Mede-se o que se procura, não quem procura:</p>
          <ul>
            <li>
              que páginas são vistas — que paragens, que linhas, que concelhos —, e quando se sai;
            </li>
            <li>
              que viagens são procuradas, pelo <strong>nome</strong> da paragem de partida e o da
              paragem de chegada, com o dia e a hora pedidos, quantas opções houve, quanto dura a
              melhor e por que linhas vai;
            </li>
            <li>
              <strong>que viagens não tiveram resposta.</strong> É o dado mais útil que este sítio
              produz: quem procura uma ligação que não existe está a dizer que precisa dela, e isso
              é matéria de planeamento da rede;
            </li>
            <li>quando o motor de viagens está em baixo.</li>
          </ul>
          <p>
            A biblioteca de medição junta a cada um destes registos o endereço da página, a página
            de onde se veio, o navegador e o sistema (com a identificação que o navegador envia), o
            tamanho do ecrã e da janela, a língua e o fuso horário do navegador, e um identificador
            ao acaso.{' '}
            {identificada
              ? 'Neste modo esse identificador fica no seu dispositivo e liga as suas visitas.'
              : 'Esse identificador liga as páginas de uma mesma visita e vive só na memória da página: perde-se quando a página se fecha ou recarrega, e não fica no seu dispositivo.'}
          </p>
        </>
      ) : (
        <p>Nada: este sítio não tem a medição ligada.</p>
      )}

      <h2>O endereço IP</h2>
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
        <li>o nome, o email, o telefone — nunca são pedidos;</li>
        {/* DIZIA «O SÍTIO NÃO A PEDE AO NAVEGADOR», e pede: o botão da
            localização do mapa, o «Aqui perto» e o «A minha localização» das
            direções perguntam-na, cada um quando se carrega nele. O que a
            página tem de dizer é para que serve e para onde vai. */}
        <li>
          a localização. Só é pedida ao navegador quando se carrega{' '}
          {comMapa
            ? 'no botão da localização do mapa, em «Paragens perto de mim»'
            : 'em «Paragens perto de mim»'}{' '}
          ou em «A minha localização», e serve para {comMapa ? 'a pôr no mapa, ' : ''}encontrar as
          paragens mais perto ou partir dali.{' '}
          {comMotor
            ? 'Para calcular uma viagem que parta de onde está, a coordenada vai no pedido ao motor de viagens deste sítio; nas medições, essa partida conta só como «A minha localização»;'
            : 'A coordenada fica no seu navegador, e nas medições essa partida conta só como «A minha localização»;'}
        </li>
        <li>
          o que se escreve enquanto se escreve — só a paragem que se acaba por escolher, que é um
          nome público do horário da operadora;
        </li>
        <li>
          {identificada
            ? 'nada mais do que o acima.'
            : 'nada que permita reconhecer alguém numa visita seguinte.'}
        </li>
      </ul>

      <h2>Quem processa</h2>
      <p>
        {mede ? 'As medições são processadas pelo PostHog, em servidores na União Europeia. ' : ''}
        Os dados de transporte {r.de} são públicos e estão descritos em{' '}
        <Link href={url(rid, '/dados-abertos/')}>Dados abertos</Link>.
      </p>

      <h2>Quem responde pelos dados</h2>
      <p>
        O responsável pelo tratamento é {responsavel}
        {declarado ? '' : `, enquanto ${aAutoridade(r, 'com_artigo')} não indicar outro`}.
        {emailDePrivacidade ? (
          <>
            {' '}
            Para questões de privacidade, escreva para{' '}
            <a href={`mailto:${emailDePrivacidade}`}>{emailDePrivacidade}</a>.
          </>
        ) : null}
      </p>

      <DireitosDePrivacidade mede={mede} identificada={identificada} email={emailDePrivacidade} />

      <h2>Para saber mais</h2>
      <p>
        A declaração de acessibilidade está em{' '}
        <Link href={url(rid, '/acessibilidade/')}>Acessibilidade</Link>.
      </p>
    </>
  );
}
