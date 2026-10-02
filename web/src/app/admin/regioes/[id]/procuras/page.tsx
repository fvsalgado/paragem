import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { IDENTIFICADOR } from '@/lib/dados';
import { porExtenso } from '@/lib/fuso';
import { paginaDaRegiao } from '@/lib/painel/autenticacao';
import { temChaveDeServico } from '@/lib/painel/base';
import { listarAliases, listarRegioes } from '@/lib/painel/consultas';
import { naFrase } from '@/lib/painel/ficha';
import { relatorioDasProcuras } from '@/lib/painel/procuras';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Procuras sem resposta · ${id}` };
}

const DIAS = 90;

/**
 * As viagens procuradas sem resposta, agregadas por ligação (P4-030).
 *
 * É o dado mais valioso que o sítio produz para quem planeia a rede: quem
 * procura uma ligação que não existe está a dizer que precisa dela. Ficava na
 * medição do fornecedor, onde a autoridade não chegava. Aqui aparece
 * agregado — a ligação, quantas vezes, a última —, e não há nada que
 * identifique quem procurou: a medição não o guarda (`docs/MEDICAO.md`).
 */
export default async function ProcurasSemResposta({ params }: Props) {
  const { id } = await params;
  if (!IDENTIFICADOR.test(id)) notFound();
  await paginaDaRegiao(id, 'gestor');
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Procuras sem resposta" />;

  const [regioes, aliases] = await Promise.all([listarRegioes(), listarAliases()]);
  const regiao = regioes.find((r) => r.id === id);
  if (!regiao) notFound();
  const dominios = [
    regiao.domain,
    ...aliases.filter((a) => a.region_id === id).map((a) => a.domain),
  ];
  const relatorio = await relatorioDasProcuras(id, dominios, DIAS);
  const frase = naFrase(regiao);

  return (
    <>
      <h1>
        Procuras sem resposta <span className="secundario-texto">{regiao.name}</span>
      </h1>
      <p className="entrada">
        As viagens que alguém procurou no planeador {frase.de} e para as quais a rede não tinha
        resposta, nos últimos {DIAS} dias, juntas por ligação. Quem procura uma ligação que não
        existe está a dizer que precisa dela. Não há aqui nada que identifique quem procurou: só os
        nomes das paragens, que são públicos, e quantas vezes.
      </p>

      {relatorio.estado === 'sem-ligacao' ? (
        <>
          <div className="faixa">
            <p>
              <strong>O painel ainda não está ligado à medição do sítio.</strong> O sítio conta as
              procuras sem resposta desde que tem medição; o que falta é o painel poder lê-las.
            </p>
          </div>
          <details className="para-quem-gere" open>
            <summary>Para quem gere a instalação</summary>
            <p>
              Faltam {relatorio.falta.length === 1 ? 'a variável' : 'as variáveis'}{' '}
              {relatorio.falta.map((v, i) => (
                <span key={v}>
                  {i > 0 ? ' e ' : ''}
                  <code>{v}</code>
                </span>
              ))}{' '}
              no ambiente do servidor: uma chave pessoal do PostHog só de leitura (âmbito{' '}
              <code>query:read</code>) e o número do projeto. A chave do sítio não serve — só
              escreve, e é pública. Opcional: <code>POSTHOG_API</code>, se o projeto não estiver em{' '}
              <code>https://eu.posthog.com</code>. Não é um serviço novo: é a mesma medição, lida do
              lado do servidor (<code>docs/MEDICAO.md</code>).
            </p>
          </details>
        </>
      ) : relatorio.estado === 'erro' ? (
        <div className="faixa alerta" role="status">
          <p>
            <strong>Não foi possível ler a medição agora</strong> ({relatorio.mensagem}). Isto não
            quer dizer que não haja procuras sem resposta: quer dizer que não se conseguiu
            perguntar. Tenta daqui a pouco.
          </p>
        </div>
      ) : (
        <section aria-labelledby="titulo-procuras" className="cartao">
          <h2 id="titulo-procuras">As ligações que faltam</h2>
          {relatorio.totais ? (
            <p>
              <strong>
                {relatorio.totais.semResposta} de {relatorio.totais.procuradas}
              </strong>{' '}
              viagens procuradas não tiveram resposta nos últimos {DIAS} dias.
            </p>
          ) : null}
          {relatorio.procuras.length === 0 ? (
            <p>Nenhuma procura ficou sem resposta neste período.</p>
          ) : (
            <div className="rolavel" tabIndex={0} role="region" aria-labelledby="titulo-procuras">
              <table className="registo">
                <thead>
                  <tr>
                    <th scope="col">Ligação procurada</th>
                    <th scope="col">Vezes</th>
                    <th scope="col">A última</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.procuras.map((p) => (
                    <tr key={p.ligacao}>
                      <td>{p.ligacao}</td>
                      <td>{p.vezes}</td>
                      <td>{p.ultima ? porExtenso(p.ultima) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="secundario-texto">
            Uma procura para um dia que já passou, ou para lá dos horários carregados, não conta:
            não diz nada sobre a rede. «A minha localização» é quem partiu de onde estava — a
            coordenada não sai do telemóvel de ninguém.
          </p>
        </section>
      )}

      <p>
        <Link href={`/admin/regioes/${encodeURIComponent(id)}/`}>Voltar à ficha da região</Link>
      </p>
    </>
  );
}
