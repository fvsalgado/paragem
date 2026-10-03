import { palavra, type Versao } from '@/lib/marca-do-produto';

/**
 * A marca do produto no sítio: «paragem.pt» em feixe (§6).
 *
 * O desenho é o de `lib/marca-do-produto.ts`, o mesmo de onde saem os ícones e
 * a imagem de partilha. As cores não vêm escritas: cada linha leva uma classe
 * (`l0`, `l1`, `l2`) e o CSS pinta-a pelo tema, como o resto da página. O
 * halo — o traço da cor do fundo que faz um traço passar por baixo do outro —
 * pinta-se com a superfície onde a marca está (`--fundo-da-marca`).
 *
 * `umaCor`: as linhas e o ponto na cor do texto à volta (`currentColor`). É a
 * marca do painel, que não leva o vermelho do produto: no painel o vermelho
 * quer dizer perigo.
 *
 * Decorativa: quem a usa escreve o nome ao lado, para os leitores de ecrã.
 */
export default function MarcaDoProduto({
  versao = 'feixe',
  umaCor = false,
  className = '',
}: {
  versao?: Versao;
  umaCor?: boolean;
  className?: string;
}) {
  const { viewBox, corpo } = palavra(versao, { classes: true });
  const classes = ['marca-do-produto', umaCor ? 'uma-cor' : '', className].filter(Boolean);
  return (
    <svg
      className={classes.join(' ')}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      // O desenho é nosso e calculado aqui, sem nada de quem visita.
      dangerouslySetInnerHTML={{ __html: corpo }}
    />
  );
}
