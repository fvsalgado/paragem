import Link from 'next/link';
import MarcaDoProduto from './MarcaDoProduto';
import BotaoDoTema from './BotaoDoTema';

/**
 * O cabeçalho das páginas do PRODUTO — não o de uma região.
 *
 * A marca era um `<span>` sem estilo: a regra `.cabecalho a.marca` só apanha
 * ligações, e na única página onde a marca não era ligação o nome do produto
 * saía como texto corrido — precisamente na página que o vende (P4-029). Agora
 * é a ligação para o início.
 *
 * A MARCA A CORES, SOBRE O PAPEL DO CABEÇALHO (decidido a 3/10/2026). Numa
 * faixa vermelha teria de ir a branco, e a esta altura três linhas brancas
 * juntam-se numa letra cheia: o feixe só se vê a cores sobre um fundo claro.
 * Vão duas no HTML e o CSS mostra uma: as três linhas onde há píxeis para elas
 * (ecrã largo e denso), e o feixe reduzido a duas no resto — abaixo de ~65
 * píxeis de ecrã de altura, o vazio entre três linhas deixa de se ver.
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
// No fim da fila, o interruptor do tema escuro (`BotaoDoTema.tsx`), como nas
// regiões.
export default function CabecalhoDoProduto({ origem = '' }: { origem?: string }) {
  const em = (caminho: string) => `${origem}${caminho}`;
  return (
    <header className="cabecalho cabecalho-do-produto">
      <div className="interior">
        <Link href={em('/')} className="marca">
          <MarcaDoProduto className="inteira" />
          <MarcaDoProduto versao="reduzido" className="reduzida" />
          <span className="so-para-leitores">Paragem.pt</span>
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
        <BotaoDoTema />
      </div>
      <span className="regua-do-feixe" aria-hidden="true" />
    </header>
  );
}
