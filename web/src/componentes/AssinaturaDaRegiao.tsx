import { enderecoDosDados } from '@/lib/dados-do-navegador';
import type { Marca } from '@/lib/marca';

/**
 * A ASSINATURA DA REGIÃO: o logótipo da rede, quando a região o declara, e os
 * dois nomes — a rede e o que ela é («Rede Ameno» / «Transportes das Terras do
 * Ameno»). A mesma no cabeçalho, na folha de abertura do mapa e no menu: é a
 * marca de quem licencia, e não a do fornecedor (P4-008, P1-007, P1-008).
 *
 * **Os nomes não partem a linha**, cortam-se com reticências, e o nome
 * inteiro fica no `title` e no texto que um leitor de ecrã lê. O nome de uma
 * comunidade intermunicipal tem facilmente sessenta letras, e o cabeçalho tem
 * de aguentar qualquer cliente sem mudar de altura (P1-043).
 *
 * **O logótipo é decorativo para quem ouve** (`alt=""`): o nome está escrito
 * ao lado, e dizê-lo duas vezes — «Rede Ameno, logótipo; Rede Ameno» — é
 * ruído. A largura vem guardada da proporção que o pipeline lê do ficheiro, e
 * nada salta quando ele chega.
 */
export default function AssinaturaDaRegiao({
  regiao,
  marca,
  principal,
  secundario,
  altura = 40,
  emLinha = false,
}: {
  regiao: string;
  marca: Marca;
  principal: string;
  secundario: string | null;
  /** A altura do logótipo, em px: 40 no cabeçalho, menos na folha do mapa. */
  altura?: number;
  /**
   * OS DOIS NOMES NUMA LINHA SÓ, na folha do mapa. Num telemóvel, cada linha
   * que a folha ganha é uma linha de mapa que se perde — e com duas, o centro
   * do mapa ia parar por baixo da barra da procura, e o botão da localização
   * e a atribuição por baixo da folha.
   */
  emLinha?: boolean;
}) {
  // Entre um quadrado e uma faixa de quatro para um: um logótipo mais
  // comprido do que isso é o nome escrito por extenso, e já está ao lado.
  const proporcao = Math.min(4, Math.max(0.5, marca.logotipoProporcao ?? 1));
  return (
    <span className="assinatura">
      {marca.logotipo && (
        <img
          className="logotipo"
          src={enderecoDosDados(regiao, marca.logotipo)}
          alt=""
          width={Math.round(altura * proporcao)}
          height={altura}
          decoding="async"
        />
      )}
      {emLinha ? (
        <span
          className="nomes em-linha"
          title={secundario ? `${principal} · ${secundario}` : principal}
        >
          <span className="nome-principal">{principal}</span>
          {secundario && <span className="nome-secundario"> · {secundario}</span>}
        </span>
      ) : (
        <span className="nomes">
          <span className="nome-principal" title={principal}>
            {principal}
          </span>
          {secundario && (
            <span className="nome-secundario" title={secundario}>
              {secundario}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
