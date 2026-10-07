import { Lua } from './Icones';
import { InterruptorDoTema } from './EscolherTema';

/**
 * O interruptor do tema escuro dos cabeçalhos (`EscolherTema.tsx`), com a lua
 * já desenhada no servidor.
 *
 * A lua vem de fora, e não de dentro do interruptor, por causa do peso: o
 * interruptor corre no navegador, e importar dele um ícone metia no
 * JavaScript de todas as páginas o `Icones.tsx` inteiro — 44 desenhos, 2,5 KiB
 * comprimidos, pelo de um. Desenhada aqui, a lua vai no HTML e mais nada.
 */
export default function BotaoDoTema() {
  return (
    <InterruptorDoTema>
      <Lua tamanho={20} />
    </InterruptorDoTema>
  );
}
