import CabecalhoDoProduto from '@/componentes/CabecalhoDoProduto';
import RodapeDoProduto from '@/componentes/RodapeDoProduto';

/**
 * O invólucro das páginas do PRODUTO — o que responde a um anfitrião que não é
 * de nenhuma região (`regiao-host.ts`).
 *
 * Vive num segmento com hífen, `-produto`, que nenhuma região pode ter: o
 * middleware reescreve para cá `/`, `/contacto/`, `/privacidade/` e
 * `/acessibilidade/`, e de fora o segmento não se alcança. É o par do
 * `[regiao]/layout.tsx`: lá a casa é da autoridade de transportes, aqui é do
 * produto — e as duas não se confundem, porque a declaração de
 * acessibilidade de uma região é da autoridade e a do produto é do produto.
 *
 * O `main` não tem medida: a montra tem faixas à largura do ecrã, e cada
 * página escolhe a sua coluna.
 */
export default function LayoutDoProduto({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CabecalhoDoProduto />
      <main id="conteudo" className="produto">
        {children}
      </main>
      <RodapeDoProduto />
    </>
  );
}
