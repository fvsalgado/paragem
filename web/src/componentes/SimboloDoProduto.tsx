/**
 * O símbolo do produto: um P que é uma placa de paragem.
 *
 * O poste é a haste do P e a placa redonda é o bojo — de longe lê-se a letra,
 * de perto lê-se a paragem. É o mesmo desenho do `app/icon.svg`, sem o
 * quadrado de fundo: aqui está ao lado do nome, sobre o branco do cabeçalho.
 *
 * NÃO É UM P BRANCO NUM QUADRADO AZUL, e foi a primeira ideia a cair: é o
 * sinal de estacionamento, e um produto de transportes públicos com o
 * símbolo do parque de estacionamento manda as pessoas para o sítio errado.
 *
 * Decorativo: o nome do produto vem escrito ao lado, e um leitor de ecrã que
 * anunciasse a imagem diria o nome duas vezes.
 */
export default function SimboloDoProduto({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg
      className="simbolo-do-produto"
      viewBox="14 7 34 50"
      width={Math.round((tamanho * 34) / 50)}
      height={tamanho}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="poste" x="15" y="8" width="8" height="48" rx="4" />
      <circle className="placa" cx="32" cy="23" r="15" />
      <circle className="olho" cx="32" cy="23" r="5.5" />
    </svg>
  );
}
