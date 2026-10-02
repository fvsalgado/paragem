import type { Metadata } from 'next';
import { exigirRegiao } from '@/lib/dados';
import AlturaParaOAnfitriao from '@/componentes/widget/AlturaParaOAnfitriao';

/**
 * O invólucro das caixas que as câmaras colam nos sítios delas (P4-007).
 *
 * SÓ A CAIXA: nem o cabeçalho, nem o rodapé, nem a faixa da demonstração do
 * invólucro da região — por isso vive fora do segmento dela
 * (`SEGMENTO_DOS_WIDGETS`, em `regiao-host.ts`). E diz ao sítio que a acolhe
 * a altura que tem, para a moldura não cortar nem sobrar.
 *
 * Sem `generateStaticParams` a rota era dinâmica, rendida a cada pedido — e
 * uma caixa na página de entrada de uma câmara é vista por toda a gente que
 * lá passa. Com a lista vazia, a primeira visita rende e as seguintes servem
 * a cópia, como as páginas da região.
 */
export function generateStaticParams() {
  return [];
}

export const revalidate = 3600;

/** Uma caixa noutro sítio não é uma página deste: não se indexa. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InvolucroDaCaixa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ regiao: string }>;
}) {
  await exigirRegiao((await params).regiao);
  return (
    <main id="conteudo" className="widget">
      {children}
      <AlturaParaOAnfitriao />
    </main>
  );
}
