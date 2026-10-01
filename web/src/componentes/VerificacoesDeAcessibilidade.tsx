/**
 * O que se verifica sozinho em cada alteração ao código.
 *
 * É do CÓDIGO, e não de quem publica: a mesma bateria corre sobre a página do
 * produto e sobre as de cada região. Por isso é uma peça só, nas duas
 * declarações — a do produto e a de cada autoridade de transportes —, e as
 * duas não divergem quando a bateria mudar.
 *
 * O que muda de uma para a outra fica de fora: o contraste dos números de
 * linha só existe onde há linhas.
 */
export default function VerificacoesDeAcessibilidade({ comLinhas }: { comLinhas: boolean }) {
  return (
    <>
      <ul>
        <li>HTML semântico: cabeçalhos em ordem, listas, tabelas com cabeçalho de coluna.</li>
        <li>
          {comLinhas
            ? 'Contraste mínimo de 4,5:1 no texto — incluindo os números de linha, cuja cor vem do horário da operadora e é corrigida quando não contrasta.'
            : 'Contraste mínimo de 4,5:1 no texto.'}
        </li>
        <li>Alvos táteis com pelo menos 44 px.</li>
        <li>Foco visível em todos os elementos que o recebem.</li>
        <li>Uma ligação para saltar diretamente ao conteúdo.</li>
        <li>Respeito por «reduzir movimento» quando o sistema o pede.</li>
      </ul>
      <p>
        Estas verificações correm em cada alteração, com o{' '}
        <a href="https://github.com/dequelabs/axe-core">axe-core</a>. Uma violação grave impede a
        publicação.
      </p>
    </>
  );
}
