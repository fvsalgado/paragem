import type { Metadata } from 'next';
import { exigirRegiao, temMosaicos, url, regiao } from '@/lib/dados';
import { aAutoridade, maiuscula } from '@/lib/prosa';
import { DO_PRODUTO, lerContactos, responsavelNaFrase, telefoneParaMarcar } from '@/lib/contactos';
import VerificacoesDeAcessibilidade from '@/componentes/VerificacoesDeAcessibilidade';
import { metadadosDaRegiao } from '@/lib/metadados';
import QueixasDeAcessibilidade from '@/componentes/QueixasDeAcessibilidade';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  return metadadosDaRegiao(r, {
    titulo: 'Acessibilidade',
    descricao: `A declaração de acessibilidade do sítio dos transportes ${r.de}.`,
    caminho: '/acessibilidade/',
  });
}

/**
 * A declaração de acessibilidade.
 *
 * Vive em `/acessibilidade` porque é o que o artigo 8.º, n.º 2 do Decreto-Lei
 * n.º 83/2018 exige e é o que se verifica num minuto. O conteúdo segue o
 * modelo desse decreto: estado de conformidade, o que não está conforme, como
 * se chegou à conclusão, e como reclamar.
 *
 * O que está aqui é o que se mediu. O contacto é o que a autoridade indicou no
 * painel; enquanto não indicar, responde quem faz o produto, com o contacto do
 * produto (`DO_PRODUTO`, em `lib/contactos.ts`) — que existe e recebe. Um
 * contacto inventado continua a ser pior do que nenhum: quem reclama fica à
 * espera.
 *
 * A QUEIXA É A DO ARTIGO 13.º, e não do 9.º. A página dizia «o mecanismo de
 * reclamação previsto no artigo 9.º»; o 9.º trata da monitorização, e a queixa
 * por tratamento discriminatório de uma pessoa com deficiência é o n.º 1 do
 * artigo 13.º — é assim que o citam as declarações publicadas pela própria
 * entidade que fiscaliza o decreto. Conferido a 13/10/2026.
 */
/**
 * A DATA DESTA DECLARAÇÃO, que o modelo do decreto pede — a última vez que o
 * texto e o estado de conformidade foram revistos. Muda-se À MÃO, quando
 * mudarem: não é a data da construção dos dados, que muda todas as semanas
 * sem que a acessibilidade do sítio mude com ela.
 */
const REVISTA_EM = { dia: 1, mes: 'novembro', ano: 2026 } as const;

export default async function Acessibilidade({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const [comMapa, contactos] = await Promise.all([temMosaicos(rid), lerContactos(rid)]);
  // O DA AUTORIDADE, quando o indicou; senão, o do produto — nunca nenhum.
  const email = contactos?.acessibilidade_email || DO_PRODUTO.email;
  const doProduto = !contactos?.acessibilidade_email;
  const telefone = doProduto ? null : contactos?.acessibilidade_telefone;
  const reclamar = contactos?.reclamacao_url;
  // QUEM SE COMPROMETE, como o modelo do decreto pede: quem a autoridade
  // indicou no painel; enquanto não indicar, quem faz o produto — que é quem
  // publica o sítio, e é o que a página diz.
  // «Fulano, que faz o Paragem.pt, compromete-se»: o aposto fecha com vírgula.
  const entidade =
    responsavelNaFrase(contactos, aAutoridade(r, 'com_artigo')) ?? `${DO_PRODUTO.responsavel},`;
  return (
    <>
      <h1>Declaração de acessibilidade</h1>
      {/* PELO MODELO DO DECRETO (o de acessibilidade.gov.pt): quem se
          compromete, a que sítio se aplica, o estado numa das três
          classificações, e quando e como foi feita. A declaração não tinha
          data nem entidade, e o estado era «Por avaliar», que não é nenhuma
          das três (auditoria de 1/11/2026). O detalhe honesto que já cá
          estava continua por baixo. */}
      <p>
        {maiuscula(entidade)} compromete-se a tornar este sítio acessível, nos termos do Decreto-Lei
        n.º 83/2018, de 19 de outubro, que transpõe a Diretiva (UE) 2016/2102.
      </p>
      {r.dominio && <p>A presente declaração aplica-se ao sítio {r.dominio}.</p>}

      <h2>Estado de conformidade</h2>
      {/* «PARCIALMENTE CONFORME», E NÃO «CONFORME»: os testes automáticos
          passam, mas há conteúdos que não estão conformes (os de baixo).
          «Plenamente conforme» exige todos os requisitos cumpridos, sem
          exceções — e há exceções. A FRASE É A MESMA DA AGENDA CULTURAL que
          se apresenta ao lado deste sítio (decisão de 1/11/2026: «unifica»):
          duas declarações da mesma casa a dizerem o mesmo estado por palavras
          diferentes liam-se como dois estados. */}
      <p>
        <strong>Parcialmente conforme</strong> com o Decreto-Lei n.º 83/2018 e com as WCAG 2.1,
        nível AA, devido às limitações enumeradas abaixo. O estado resulta de uma autoavaliação —
        testes automáticos a cada alteração e verificação manual durante o desenvolvimento —, sem
        auditoria externa nem testes com pessoas que usam tecnologias de apoio.
      </p>

      <h2>Elaboração desta declaração</h2>
      <p>
        Declaração revista a {REVISTA_EM.dia} de {REVISTA_EM.mes} de {REVISTA_EM.ano}, por
        autoavaliação: os testes automáticos descritos abaixo e verificação manual durante o
        desenvolvimento.
      </p>

      <h2>O que foi verificado, e como</h2>
      <VerificacoesDeAcessibilidade comLinhas />

      <h2>O que não está conforme, ou ainda não se sabe</h2>
      <ul>
        {/* DIZIA «AINDA NÃO HÁ MAPA», e o mapa é hoje a página de entrada. O
            que continua a ser verdade é que ele não serve a quem não vê — e o
            que a declaração tem de dizer é onde está a alternativa. Uma região
            sem recorte do OpenStreetMap não tem mapa, e aí não se fala dele. */}
        {comMapa && (
          <li>
            <strong>O mapa não serve a quem não o vê.</strong> É um desenho numa tela, que um leitor
            de ecrã não percorre. O que ele mostra está também em texto: a procura encontra as
            paragens e os sítios pelo nome, as páginas de <a href={url(rid, '/rede/')}>A rede</a>{' '}
            listam as paragens, as linhas e as estações, e a página de cada modo diz onde ele está.
          </li>
        )}
        <li>
          <strong>Os ficheiros PDF da operadora não são nossos e podem não ser acessíveis.</strong>{' '}
          Onde os ligamos, a informação está também em HTML.
        </li>
        <li>
          <strong>
            Não houve auditoria externa, nem testes com pessoas que usam tecnologias de apoio.
          </strong>{' '}
          Um teste automático apanha uma parte do que interessa; o resto vê-se com quem usa.
        </li>
      </ul>

      <h2>Como foi preparada</h2>
      <p>
        Os testes automáticos descritos acima correm em cada alteração ao sítio. Os dados são os que
        o pipeline produziu, e a data deles está em{' '}
        <a href={url(rid, '/dados-abertos/')}>Dados abertos</a>.
      </p>

      {/* O CONTACTO É DA AUTORIDADE, e escreve-se no painel (P4-024). Enquanto
          ela não o indicar, responde quem faz o produto, pelo contacto dele: a
          página dizia «Por preencher», e quem precisava de reclamar ficava sem
          para onde escrever. */}
      <h2>Contacto e queixas</h2>
      <p>
        {doProduto
          ? `Responde por esta declaração ${DO_PRODUTO.responsavel}, enquanto ${aAutoridade(r, 'com_artigo')} não indicar o seu contacto. `
          : null}
        Para comunicar um problema de acessibilidade neste sítio, ou pedir num formato acessível a
        informação que aqui está, escreva para <a href={`mailto:${email}`}>{email}</a>
        {telefone ? (
          <>
            {' '}
            ou ligue para <a href={`tel:${telefoneParaMarcar(telefone)}`}>{telefone}</a>
          </>
        ) : null}
        .
      </p>
      {reclamar ? (
        <p>
          Se a resposta não chegar, ou não resolver o problema, pode apresentar uma reclamação em{' '}
          <a href={reclamar}>{new URL(reclamar).hostname}</a>.
        </p>
      ) : null}
      <QueixasDeAcessibilidade />
    </>
  );
}
