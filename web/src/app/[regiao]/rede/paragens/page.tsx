import Link from 'next/link';
import type { Metadata } from 'next';
import { exigirModo, paragens, concelhos, urlRede, regiao } from '@/lib/dados';
import { letraDe, LETRAS, paraUrl } from '@/lib/letras';
import { plural, maiuscula } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  const n = (await paragens(rid)).length;
  return metadadosDaRegiao(r, {
    titulo: 'Paragens',
    descricao: `${maiuscula(plural(n, 'paragem', 'paragens'))} ${r.em}, pela inicial e pelo concelho.`,
    caminho: '/rede/paragens/',
  });
}

/**
 * O índice de paragens, por letra e por concelho.
 *
 * A primeira versão punha as 4634 numa página só. Era inusável num telemóvel,
 * e o axe nem chegava ao fim da análise — esgotava trinta segundos a percorrer
 * a árvore. Uma página que a ferramenta não consegue analisar é uma página que
 * ninguém consegue percorrer.
 */
export default async function Paragens({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  await exigirModo(rid, 'autocarro');
  const ps = await paragens(rid);
  const cs = await concelhos(rid);
  const porLetra = new Map<string, number>();
  for (const p of ps) porLetra.set(letraDe(p.nome), (porLetra.get(letraDe(p.nome)) ?? 0) + 1);

  return (
    <>
      <h1>Paragens</h1>
      <p>{plural(ps.length, 'paragem', 'paragens')}. Procura pela inicial, ou pelo concelho.</p>

      <h2>Por inicial</h2>
      <ul className="lista">
        {LETRAS.filter((l) => porLetra.get(l)).map((l) => (
          <li key={l}>
            <Link href={urlRede(rid, `paragens/letra/${paraUrl(l)}/`)}>
              <span>{l === '#' ? 'Começam por número' : l}</span>
              <span className="secundario">{porLetra.get(l)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Por concelho</h2>
      <ul className="lista">
        {cs.map((c) => (
          <li key={c.id}>
            <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
              <span>{c.nome}</span>
              <span className="secundario">{c.paragens}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
