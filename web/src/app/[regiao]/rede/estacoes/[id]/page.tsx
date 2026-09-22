import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { estacoes, exigirModo, concelhos, seguro, urlRede, urlDaParagem } from '@/lib/dados';

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
  await exigirModo(rid, 'comboio');
  const e = (await estacoes(rid)).find((x) => seguro(x.id) === id);
  return { title: e ? `${e.nome} (estação)` : 'Estação' };
}

export default async function Estacao({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'comboio');
  const e = (await estacoes(rid)).find((x) => seguro(x.id) === id);
  if (!e) notFound();
  const concelho = (await concelhos(rid)).find((c) => c.id === e.concelho);

  return (
    <>
      <h1>{e.nome}</h1>
      <p>
        Estação de comboio
        {concelho && (
          <>
            {' em '}
            <Link href={urlRede(rid, `concelhos/${concelho.id}/`)}>{concelho.nome}</Link>
          </>
        )}
        .
      </p>

      <h2>Autocarro à porta</h2>
      {e.sem_ligacao ? (
        <div className="faixa alerta">
          <p>
            <strong>Não há paragem de autocarro a menos de 300 m desta estação.</strong> Quem aqui
            chegar de comboio tem de contar com outra maneira de sair — a pé, de táxi, ou com quem o
            venha buscar.
          </p>
        </div>
      ) : (
        <ul className="lista">
          {e.paragens_perto.map((p) => (
            <li key={p.id}>
              <Link href={urlDaParagem(rid, p.id)}>
                <span>{p.nome}</span>
                <span className="secundario">{p.metros} m</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2>Horários de comboio</h2>
      <p>
        Os horários da CP não são publicados aqui. Consulta-os em{' '}
        <a href="https://www.cp.pt">cp.pt</a>.
      </p>
    </>
  );
}
