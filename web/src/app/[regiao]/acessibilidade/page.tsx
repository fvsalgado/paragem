import type { Metadata } from 'next';
import { exigirRegiao, temMosaicos, url } from '@/lib/dados';

export const metadata: Metadata = { title: 'Acessibilidade' };

/**
 * A declaração de acessibilidade.
 *
 * Vive em `/acessibilidade` porque é o que o artigo 8.º, n.º 2 do Decreto-Lei
 * n.º 83/2018 exige e é o que se verifica num minuto. O conteúdo segue o
 * modelo desse decreto: estado de conformidade, o que não está conforme, como
 * se chegou à conclusão, e como reclamar.
 *
 * O que está aqui é o que se mediu. As partes que dependem de quem publicar o
 * sítio — a data, o contacto, o mecanismo de reclamação — estão marcadas como
 * por preencher, e não inventadas: uma declaração com um contacto falso é pior
 * do que nenhuma, porque quem reclamar fica à espera.
 */
export default async function Acessibilidade({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const comMapa = await temMosaicos(rid);
  return (
    <>
      <h1>Declaração de acessibilidade</h1>
      <p>
        Este sítio compromete-se a ser acessível, nos termos do Decreto-Lei n.º 83/2018, de 19 de
        outubro, que transpõe a Diretiva (UE) 2016/2102.
      </p>

      <h2>Estado de conformidade</h2>
      <p>
        O objetivo é a conformidade com as <strong>WCAG 2.1 nível AA</strong>. O sítio está em
        construção e ainda não foi objeto de avaliação externa.
      </p>

      <h2>O que já se verifica automaticamente</h2>
      <ul>
        <li>HTML semântico: cabeçalhos em ordem, listas, tabelas com cabeçalho de coluna.</li>
        <li>
          Contraste mínimo de 4,5:1 no texto — incluindo os números de linha, cuja cor vem do
          horário da operadora e é corrigida quando não contrasta.
        </li>
        <li>Alvos táteis com pelo menos 44 px.</li>
        <li>Foco visível em todos os elementos que o recebem.</li>
        <li>Uma ligação para saltar diretamente ao conteúdo.</li>
        <li>Respeito por «reduzir movimento» quando o sistema o pede.</li>
      </ul>
      <p>
        Estas verificações correm em cada alteração, com o{' '}
        <a href="https://github.com/dequelabs/axe-core">axe-core</a>. Uma violação grave impede a
        publicação.
      </p>

      <h2>O que não está conforme</h2>
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
          <strong>Não houve avaliação por pessoas com deficiência.</strong> Uma verificação
          automática apanha talvez metade do que interessa; o resto vê-se com quem usa.
        </li>
      </ul>

      <h2>Como foi preparada</h2>
      <p>
        Por autoavaliação, com verificação automática em cada alteração ao sítio. Última construção:
        os dados são os que o pipeline produziu, e a data está em{' '}
        <a href={url(rid, '/dados-abertos/')}>Dados e licenças</a>.
      </p>

      <h2>Contacto e mecanismo de reclamação</h2>
      <div className="faixa alerta">
        <p>
          <strong>Por preencher.</strong> O contacto para comunicar problemas de acessibilidade e o
          mecanismo de reclamação previsto no artigo 9.º do Decreto-Lei n.º 83/2018 são{' '}
          {r.autoridade?.nome ?? 'da entidade que publicar o sítio'} a definir. Uma declaração com
          um contacto inventado é pior do que nenhuma: quem reclamar fica à espera.
        </p>
      </div>
    </>
  );
}
