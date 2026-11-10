import type { ReactNode } from 'react';
import { STINETA } from '@/lib/produto';
import MarcaStineta from './MarcaStineta';

/**
 * «Stineta — software para a comunidade.» — quem faz o produto, numa
 * frase igual em todo o lado (`STINETA`, em `lib/produto.ts`).
 *
 * Um componente só para todos os sítios onde a frase aparece, para que digam a
 * mesma coisa com a mesma marcação. A ligação leva a marca e o nome, e o nome é
 * o que os leitores de ecrã ouvem: a marca é decorativa.
 *
 * `children` é o princípio da frase, quando ela não começa no nome. No rodapé
 * do produto não há: a frase está sozinha. Numa região, o produto assina tudo
 * numa frase só (decidido pelo dono a 10/11/2026) — «Feito com Paragem.pt, um
 * produto Stineta — software para a comunidade.» —, no rodapé e no
 * menu do mapa, e o princípio vem de quem a usa.
 *
 * AS LIGAÇÕES FICAM NA FRASE, filhas diretas do parágrafo e com texto ao lado.
 * É o que as isenta dos 44 px das ligações autónomas (critério 2.5.8, a exceção
 * das ligações no texto) — sem isso, abriam um buraco na entrelinha.
 *
 * `rel`: cada lado segue a regra das ligações para fora — nas regiões vão com
 * `noreferrer`, no produto sem nada.
 */
export default function AssinaturaStineta({
  className,
  rel,
  children,
}: {
  className?: string;
  rel?: string;
  children?: ReactNode;
}) {
  return (
    <p className={className}>
      {children}
      <a href={STINETA.url} rel={rel}>
        <MarcaStineta />
        {STINETA.nome}
      </a>
      {/* O travessão agarra-se ao nome com um espaço que não parte: numa frase
          que muda de linha, a seguinte não começa por ele. */}
      {`\u00a0— ${STINETA.descricao}.`}
    </p>
  );
}
