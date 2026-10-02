import Link from 'next/link';
import type { Metadata } from 'next';
import { exigirModo, paragens, concelhos, urlRede, urlDaParagem, regiao } from '@/lib/dados';
import { plural } from '@/lib/prosa';
import { letraDe, LETRAS, paraUrl, daUrl } from '@/lib/letras';
import { metadadosDaRegiao } from '@/lib/metadados';

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
  params: Promise<{ regiao: string; letra: string }>;
}): Promise<Metadata> {
  const { regiao: rid, letra } = await params;
  await exigirModo(rid, 'autocarro');
  const l = daUrl(letra);
  const titulo = `Paragens em ${l === '#' ? 'número' : l}`;
  const r = await regiao(rid);
  if (!r) return { title: titulo };
  return metadadosDaRegiao(r, {
    titulo,
    descricao: `As paragens ${r.de} cujo nome começa por ${l === '#' ? 'um número' : l}.`,
    caminho: urlRede(rid, `paragens/letra/${paraUrl(l)}/`),
  });
}

export default async function PorLetra({
  params,
}: {
  params: Promise<{ regiao: string; letra: string }>;
}) {
  const { regiao: rid, letra } = await params;
  await exigirModo(rid, 'autocarro');
  const l = daUrl(letra);
  const ps = (await paragens(rid)).filter((p) => letraDe(p.nome) === l);
  const nomes = Object.fromEntries((await concelhos(rid)).map((c) => [c.id, c.nome]));

  return (
    <>
      <h1>{l === '#' ? 'Paragens que começam por número' : `Paragens em ${l}`}</h1>
      <p>
        {plural(ps.length, 'paragem', 'paragens')}.{' '}
        <Link href={urlRede(rid, 'paragens/')}>Ver todas as iniciais</Link>.
      </p>
      <ul className="lista">
        {ps.map((p) => (
          <li key={p.id}>
            <Link href={urlDaParagem(rid, p.id)}>
              <span>{p.nome}</span>
              <span className="secundario">
                {p.concelho ? (nomes[p.concelho] ?? p.concelho) : 'fora da região'}
                {p.linhas.length > 0 && (
                  <>
                    <br />
                    {p.linhas.slice(0, 6).join(' · ')}
                    {p.linhas.length > 6 ? ' …' : ''}
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
