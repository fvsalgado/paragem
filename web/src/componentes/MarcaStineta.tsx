/**
 * A marca da Stineta: dois cristais de sal-gema, a uma cor.
 *
 * O DESENHO ESTÁ NO CSS (`.marca-stineta`, em `app/global.css`), como máscara,
 * e pinta-se com a cor do texto à volta: dentro de uma ligação é a cor da
 * ligação, no tema claro e no escuro, na página do produto e na de cada
 * região. Aqui fica só o lugar dele.
 *
 * Foi um SVG em linha, e custava mais de 1 KiB a cada página das regiões: o
 * rodapé é um componente do servidor, e o Next manda-o no HTML, outra vez no
 * que manda para a hidratação, e uma terceira no rodapé da página «não
 * encontrada», que vai dentro de cada página. Três páginas da rede passavam o
 * orçamento de peso (`tests/lighthouse.mjs`). Na folha de estilos vai uma vez,
 * e fica em cache de uma página para a outra.
 *
 * Decorativa: quem a usa escreve o nome ao lado, para os leitores de ecrã.
 */
export default function MarcaStineta({ className = 'marca-stineta' }: { className?: string }) {
  return <span className={className} aria-hidden="true" />;
}
