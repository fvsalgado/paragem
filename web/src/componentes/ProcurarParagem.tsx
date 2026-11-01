/**
 * «PROCURAR PARAGEM OU LINHA», num formulário que não precisa de JavaScript.
 *
 * Vai à página dos resultados (`/rede/paragens/procurar/`) com o que se
 * escreveu no endereço, e é o servidor que procura (`procura-de-paragens.ts`).
 * Funciona num telemóvel antigo, com o JavaScript desligado e com um leitor de
 * ecrã — que é para quem a lista das paragens existe, ao lado do mapa.
 *
 * Não sabe que região é, e não precisa: a região é o anfitrião, e o endereço
 * é o mesmo em todas. Por isso serve também a página que não existe, que não
 * recebe os parâmetros da rota.
 */
export default function ProcurarParagem({
  valor = '',
  etiqueta = 'Procurar paragem ou linha',
}: {
  valor?: string;
  etiqueta?: string;
}) {
  return (
    <form role="search" action="/rede/paragens/procurar/" method="get" className="procurar-paragem">
      <label htmlFor="procurar-paragem">{etiqueta}</label>
      <span className="campo-e-botao">
        <input
          id="procurar-paragem"
          name="q"
          type="search"
          defaultValue={valor}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby="procurar-paragem-ajuda"
        />
        <button type="submit" className="botao">
          Procurar
        </button>
      </span>
      <span id="procurar-paragem-ajuda" className="secundario">
        O nome da paragem, da terra ou o número da linha.
      </span>
    </form>
  );
}
