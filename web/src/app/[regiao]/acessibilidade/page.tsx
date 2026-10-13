import type { Metadata } from 'next';
import { exigirRegiao, temMosaicos, url, regiao } from '@/lib/dados';
import { aAutoridade } from '@/lib/prosa';
import { DO_PRODUTO, lerContactos, telefoneParaMarcar } from '@/lib/contactos';
import VerificacoesDeAcessibilidade from '@/componentes/VerificacoesDeAcessibilidade';
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
export default async function Acessibilidade({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const [comMapa, contactos] = await Promise.all([temMosaicos(rid), lerContactos(rid)]);
  // O DA AUTORIDADE, quando o indicou; senão, o do produto — nunca nenhum.
  const email = contactos?.acessibilidade_email || DO_PRODUTO.email;
  const doProduto = !contactos?.acessibilidade_email;
  const telefone = doProduto ? null : contactos?.acessibilidade_telefone;
  const reclamar = contactos?.reclamacao_url;
  return (
    <>
      <h1>Declaração de acessibilidade</h1>
      <p>
        Este sítio compromete-se a ser acessível, nos termos do Decreto-Lei n.º 83/2018, de 19 de
        outubro, que transpõe a Diretiva (UE) 2016/2102.
      </p>

      <h2>Estado de conformidade</h2>
      <p>
        <strong>Por avaliar.</strong> O objetivo é a conformidade com as WCAG 2.1 nível AA, mas o
        sítio ainda não foi avaliado à mão — nem de ponta a ponta, nem por uma entidade externa, nem
        com pessoas com deficiência —, e por isso não se declara conforme. O que se sabe é o que os
        testes automáticos verificam.
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
          <strong>Não houve avaliação manual, nem por pessoas com deficiência.</strong> Um teste
          automático apanha uma parte do que interessa; o resto vê-se com quem usa.
        </li>
      </ul>

      <h2>Como foi preparada</h2>
      <p>
        Por autoavaliação, só com os testes automáticos descritos acima, que correm em cada
        alteração ao sítio. Os dados são os que o pipeline produziu, e a data deles está em{' '}
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
        informação que aqui está, escreve para <a href={`mailto:${email}`}>{email}</a>
        {telefone ? (
          <>
            {' '}
            ou liga para <a href={`tel:${telefoneParaMarcar(telefone)}`}>{telefone}</a>
          </>
        ) : null}
        .
      </p>
      {reclamar ? (
        <p>
          Se a resposta não chegar, ou não resolver o problema, podes apresentar uma reclamação em{' '}
          <a href={reclamar}>{new URL(reclamar).hostname}</a>.
        </p>
      ) : null}
      <p>
        Uma pessoa com deficiência tratada de forma menos favorável do que outra em situação
        comparável pode apresentar queixa nos termos do n.º 1 do artigo 13.º do Decreto-Lei n.º
        83/2018.
      </p>
    </>
  );
}
