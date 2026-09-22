import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  aPedido,
  concelhos,
  paragens,
  estacoes,
  exigirRegiao,
  url,
  urlRede,
  urlDaParagem,
  modos as lerModos,
  NOME_DOS_MODOS,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';

/**
 * VAZIO DE PROPÓSITO, E NÃO SE APAGA. Sem `generateStaticParams`, o Next trata
 * uma rota com segmento dinâmico como DINÂMICA: rende-a a cada pedido e manda
 * `no-store`. Com a função a devolver uma lista vazia, a rota é «estática com
 * caminhos a pedido»: a primeira visita rende e guarda, as seguintes servem a
 * cópia, até ao `revalidate` ou ao sinal do pipeline. Medido antes de escrever
 * isto — com a função apagada, `Cache-Control: private, no-cache, no-store`
 * em todas as páginas de região.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}): Promise<Metadata> {
  const { regiao: rid, id } = await params;
  const c = (await concelhos(rid)).find((x) => x.id === id);
  return { title: c ? c.nome : 'Concelho' };
}

export default async function Concelho({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  const c = (await concelhos(rid)).find((x) => x.id === id);
  if (!c) notFound();

  const r = await exigirRegiao(rid);
  const ps = (await paragens(rid)).filter((p) => p.concelho === c.id);
  const es = (await estacoes(rid)).filter((e) => e.concelho === c.id);
  const linhasDaqui = [...new Set(ps.flatMap((p) => p.linhas))].sort();
  const pedido = await aPedido(rid);
  const zona = pedido?.zonas.find((z) => z.concelho === c.id) ?? null;

  // OS OUTROS MODOS, CONTADOS NESTE CONCELHO.
  //
  // Contam-se aqui e não no pipeline porque a pergunta é do concelho e a
  // resposta está nos dados do modo: quantas estações de bicicletas há neste
  // concelho, quantas praças de táxi. Um modo que a região declare e que não
  // tenha nada neste concelho aparece na mesma, a dizer zero — quem mora cá
  // tem o direito de saber que o serviço existe na região e não aqui.
  const outros = Object.entries(await lerModos(rid))
    .map(([m, d]) => ({
      modo: m,
      nome: NOME_DOS_MODOS[m] ?? m,
      quantos:
        d.sistemas.reduce((n, s) => n + s.estacoes.filter((e) => e.concelho === c.id).length, 0) +
        d.pontos.filter((x) => x.concelho === c.id).length +
        d.paragens.filter((x) => x.concelho === c.id).length,
      percursos: d.percursos.filter((x) => x.operador).length,
      incompleto: d.incompleto,
    }))
    .sort((a, b) => b.quantos - a.quantos);

  return (
    <>
      <h1>{c.nome}</h1>
      <p>
        Distrito {c.distrito}.{' '}
        {c.membro
          ? `Município ${r.autoridade?.sigla ? `da ${r.autoridade.sigla}` : 'da autoridade de transportes'}.`
          : `Não é município ${r.autoridade?.sigla ? `da ${r.autoridade.sigla}` : 'da autoridade'}, e a rede serve-o na mesma.`}
      </p>
      <MarcaDeDados regiao={rid} />

      <h2>Em números</h2>
      <ul className="lista">
        <li>
          <span style={{ padding: '0.6rem 0.25rem', display: 'block' }}>
            {ps.length} paragens de autocarro
          </span>
        </li>
        <li>
          <span style={{ padding: '0.6rem 0.25rem', display: 'block' }}>
            {linhasDaqui.length} linhas passam aqui
          </span>
        </li>
        {r.modos.includes('comboio') && (
          <li>
            <span style={{ padding: '0.6rem 0.25rem', display: 'block' }}>
              {es.length} estações de comboio
            </span>
          </li>
        )}
      </ul>

      {es.length > 0 && (
        <>
          <h2>Estações</h2>
          <ul className="lista">
            {es.map((e) => (
              <li key={e.id}>
                <Link href={urlRede(rid, `estacoes/${e.id.replace(/[^a-zA-Z0-9\-_]/g, '-')}/`)}>
                  <span>{e.nome}</span>
                  <span className="secundario">
                    {e.sem_ligacao ? 'sem autocarro perto' : 'com autocarro perto'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* O A PEDIDO VEM ANTES DAS LINHAS, e é de propósito: num concelho
          rural há freguesias sem carreira nenhuma, e para quem mora lá esta é
          a única secção desta página que responde. */}
      {zona && (
        <section aria-labelledby="c-a-pedido">
          <h2 id="c-a-pedido">Transporte a pedido</h2>
          <div className="faixa a-pedido">
            <p>
              {zona.circuitos.length
                ? `${zona.circuitos.length} circuitos na zona ${zona.nome}, que só circulam se alguém os reservar.`
                : `Há transporte a pedido na zona ${zona.nome}, que só circula se alguém o reservar. Os circuitos ainda não estão levantados.`}
            </p>
            <p className="cartao-accoes">
              {pedido?.reservas.telefone && (
                <a className="botao" href={`tel:${pedido.reservas.telefone}`}>
                  Ligar {pedido.reservas.telefone_apresentado ?? pedido.reservas.telefone}
                </a>
              )}
              <Link href={url(rid, 'a-pedido/')}>Como funciona</Link>
            </p>
            {pedido?.reservas.prazo && <p className="secundario">{pedido.reservas.prazo}.</p>}
          </div>
        </section>
      )}

      {outros.length > 0 && (
        <section aria-labelledby="c-outros">
          <h2 id="c-outros">Outros modos aqui</h2>
          <ul className="lista">
            {outros.map((o) => (
              <li key={o.modo}>
                <Link className={`cartao modo-${o.modo}`} href={url(rid, `modos/${o.modo}/`)}>
                  <span>{o.nome}</span>
                  <span className="secundario">
                    {o.quantos > 0 ? o.quantos : o.incompleto ? 'por levantar' : 'nenhum aqui'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2>Linhas</h2>
      <p>{linhasDaqui.join(' · ') || 'Nenhuma linha registada.'}</p>

      <h2>Paragens</h2>
      <ul className="lista">
        {ps.slice(0, 300).map((p) => (
          <li key={p.id}>
            <Link href={urlDaParagem(rid, p.id)}>
              <span>{p.nome}</span>
              <span className="secundario">{p.linhas.join(' · ')}</span>
            </Link>
          </li>
        ))}
      </ul>
      {ps.length > 300 && (
        <p className="secundario">
          São {ps.length} ao todo; mostram-se as primeiras 300. A lista inteira está em{' '}
          <Link href={urlRede(rid, 'paragens/')}>Paragens</Link>.
        </p>
      )}
    </>
  );
}
