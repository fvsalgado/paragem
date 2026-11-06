'use client';

/**
 * «Imprimir», na pré-visualização da folha para afixar. É o único pedaço da
 * folha que precisa do navegador; tudo o resto vem feito do servidor.
 */
export default function BotaoDeImprimir() {
  return (
    <button type="button" className="botao" onClick={() => window.print()}>
      Imprimir
    </button>
  );
}
