import { STINETA } from '@/lib/produto';
import MarcaStineta from './MarcaStineta';

/**
 * «Stineta — software para regiões e comunidades.» — quem faz o produto, numa
 * frase igual em todo o lado (`STINETA`, em `lib/produto.ts`).
 *
 * Um componente só para os dois rodapés, o do produto e o de cada região, para
 * que digam a mesma coisa com a mesma marcação. A ligação leva a marca e o nome,
 * e o nome é o que os leitores de ecrã ouvem: a marca é decorativa.
 *
 * A LIGAÇÃO FICA NA FRASE, filha direta do parágrafo e com texto ao lado. É o
 * que a isenta dos 44 px das ligações autónomas (critério 2.5.8, a exceção das
 * ligações no texto) — sem isso, abria um buraco na entrelinha do rodapé.
 *
 * `rel`: cada rodapé segue a regra das ligações para fora do seu lado — nas
 * regiões vão com `noreferrer`, no produto sem nada.
 */
export default function AssinaturaStineta({
  className,
  rel,
}: {
  className?: string;
  rel?: string;
}) {
  return (
    <p className={className}>
      <a href={STINETA.url} rel={rel}>
        <MarcaStineta />
        {STINETA.nome}
      </a>
      {` — ${STINETA.descricao}.`}
    </p>
  );
}
