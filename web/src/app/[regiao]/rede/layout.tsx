import Trilho from '@/componentes/Trilho';

/**
 * O invólucro das páginas da rede: só o trilho por cima de cada uma
 * (`Trilho.tsx`). O resto — o cabeçalho, a faixa da região, o rodapé — é do
 * invólucro da região, um nível acima.
 */
export default function LayoutDaRede({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Trilho />
      {children}
    </>
  );
}
