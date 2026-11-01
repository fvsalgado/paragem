import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import { exigirModo, paragens, concelhos, numeros, urlRede, regiao } from '@/lib/dados';
import { letraDe, LETRAS, paraUrl } from '@/lib/letras';
import { fraseDoIndiceDasParagens, numero, plural, maiuscula } from '@/lib/prosa';
import { agruparParagens } from '@/lib/lista-de-paragens';
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
  // O NÚMERO DIZ O QUE CONTA, numa frase que se lê à primeira (#105). Eram
  // quatro números — «3 047 paragens. 1 928 são da rede da região e 1 119 de
  // outros operadores que param nela; 1 946 ficam nos concelhos da região» —,
  // e 1 928 e 1 946 pareciam o mesmo com um erro. A divisão por operador fica
  // nos dados abertos.
  const frase = fraseDoIndiceDasParagens(await numeros(rid), cs.length, ps.length);
  // POR SÍTIO, como as páginas de cada letra as mostram (`lista-de-paragens.ts`).
  const porLetra = new Map<string, number>();
  for (const g of agruparParagens(ps)) {
    const l = letraDe(g.nome);
    porLetra.set(l, (porLetra.get(l) ?? 0) + 1);
  }

  return (
    <>
      <h1>Paragens</h1>
      <p>{frase} Procure pela inicial, ou pelo concelho.</p>

      <h2 id="por-inicial">Por inicial</h2>
      {/* UMA GRELHA DE BOTÕES, e não uma lista a toda a largura (#104): as 23
          letras ocupavam dois ecrãs do telemóvel, e com o número cinzento à
          direita, sem sublinhado nem seta, não pareciam ligações. */}
      <nav aria-labelledby="por-inicial" className="grelha-de-iniciais">
        <ul>
          {LETRAS.filter((l) => porLetra.get(l)).map((l) => (
            <li key={l}>
              <Link href={urlRede(rid, `paragens/letra/${paraUrl(l)}/`)}>
                <span className="letra">{l === '#' ? '1–9' : l}</span>
                <span className="quantas">
                  {numero(porLetra.get(l) ?? 0)}
                  <span className="so-para-leitores">
                    {' '}
                    {porLetra.get(l) === 1 ? 'paragem' : 'paragens'}
                    {l === '#' ? ' que começam por número' : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h2>Por concelho</h2>
      <ul className="lista">
        {cs.map((c) => (
          <li key={c.id}>
            <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
              <span>{c.nome}</span>
              <span className="secundario contagem">{numero(c.paragens)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
