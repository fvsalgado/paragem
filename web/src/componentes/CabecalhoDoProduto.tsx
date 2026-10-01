import Link from 'next/link';
import SimboloDoProduto from './SimboloDoProduto';

/**
 * O cabeçalho das páginas do PRODUTO — não o de uma região.
 *
 * A marca era um `<span>` sem estilo: a regra `.cabecalho a.marca` só apanha
 * ligações, e na única página onde a marca não era ligação o nome do produto
 * saía como texto corrido — precisamente na página que o vende (P4-029). Agora
 * é a ligação para o início, com o símbolo ao lado.
 *
 * À direita, «Falar connosco»: é a pergunta de quem chega aqui a decidir, e
 * tem de estar à vista em todas as páginas, como no Coreto. As três âncoras
 * levam às secções da montra; num telemóvel saem do cabeçalho
 * (`global.css`), porque as secções estão logo abaixo e o botão não pode cair
 * para uma segunda linha.
 *
 * `origem` é para a página de «não encontrada», que pode estar no domínio de
 * uma região desligada — aí `/` voltava a ser essa página, e as ligações têm
 * de levar à montra pela morada dela.
 */
export default function CabecalhoDoProduto({ origem = '' }: { origem?: string }) {
  const em = (caminho: string) => `${origem}${caminho}`;
  return (
    <header className="cabecalho cabecalho-do-produto">
      <div className="interior">
        <Link href={em('/')} className="marca">
          <SimboloDoProduto />
          <span>
            Paragem<span aria-hidden="true">.</span>pt
          </span>
        </Link>
        <nav aria-label="Produto">
          <ul>
            <li>
              <Link href={em('/#demonstracao')}>Demonstração</Link>
            </li>
            <li>
              <Link href={em('/#para-quem')}>Para quem</Link>
            </li>
            <li>
              <Link href={em('/#entrada')}>Como é a entrada</Link>
            </li>
          </ul>
        </nav>
        <Link href={em('/contacto/')} className="botao">
          Falar connosco
        </Link>
      </div>
    </header>
  );
}
