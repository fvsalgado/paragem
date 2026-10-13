/**
 * O que se verifica sozinho em cada alteração — e o que NÃO se verifica.
 *
 * É do CÓDIGO, e não de quem publica: a mesma bateria corre sobre a página do
 * produto e sobre as de cada região. Por isso é uma peça só, nas duas
 * declarações — a do produto e a de cada autoridade de transportes —, e as
 * duas não divergem quando a bateria mudar.
 *
 * DIZIA MAIS DO QUE SE PROVA. A lista inteira estava debaixo de «o que se
 * verifica automaticamente», e o foco visível e o «reduzir movimento» não são
 * verificados por teste nenhum — estão no desenho, e é só isso que se pode
 * dizer deles. E «uma violação grave impede a publicação» não era verdade: os
 * testes correm no CI, e a plataforma publica o que está no ramo principal
 * sem esperar por eles. Cada frase aqui corresponde a um teste em
 * `web/tests/acessibilidade.spec.ts` ou `web/tests/lighthouse.mjs`, ou está na
 * lista de baixo, a dizer que não tem teste.
 *
 * O que muda de uma para a outra fica de fora: o contraste dos números de
 * linha só existe onde há linhas.
 */
export default function VerificacoesDeAcessibilidade({ comLinhas }: { comLinhas: boolean }) {
  return (
    <>
      <p>
        Em cada alteração proposta ao código, e no ramo que se publica, correm estes testes
        automáticos sobre páginas de cada tipo — o axe-core e o Lighthouse no tema claro e no
        escuro:
      </p>
      <ul>
        <li>
          o <a href="https://github.com/dequelabs/axe-core">axe-core</a>, com as regras das WCAG 2.0
          e 2.1 de nível A e AA — entre elas, o contraste mínimo de 4,5:1 no texto
          {comLinhas
            ? ', incluindo os números de linha, cuja cor vem do horário da operadora e é corrigida quando não contrasta'
            : ''}
          ;
        </li>
        <li>cabeçalhos sem saltos de nível, e um só título principal por página;</li>
        <li>alvos táteis autónomos com pelo menos 44 px de altura;</li>
        <li>nada que obrigue a deslizar para o lado num ecrã de telemóvel;</li>
        <li>uma ligação, à cabeça da página, para saltar diretamente ao conteúdo;</li>
        <li>o tema claro ou escuro à escolha de quem vê — por omissão, o do aparelho;</li>
        <li>o Lighthouse, com a nota de acessibilidade de pelo menos 95 em telemóvel.</li>
      </ul>
      <p>
        Uma falha deixa a verificação a vermelho, à vista de quem publica. Não trava a publicação
        sozinha.
      </p>
      <p>O que está no desenho do sítio e nenhum teste automático confirma:</p>
      <ul>
        <li>o foco visível em todos os elementos que o recebem;</li>
        <li>o respeito por «reduzir movimento», quando o sistema o pede;</li>
        <li>a navegação de ponta a ponta só com o teclado, e com um leitor de ecrã.</li>
      </ul>
    </>
  );
}
