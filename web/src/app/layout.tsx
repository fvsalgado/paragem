import type { Metadata } from 'next';
import './global.css';
import Medicao from '@/componentes/Medicao';

/**
 * O invólucro de TUDO — do produto e de cada região.
 *
 * O que era daqui e passou a ser da região (cabeçalho, rodapé, título) está em
 * `[regiao]/layout.tsx`. Este ficheiro deixou de saber o que é uma região, e é
 * essa a mudança: o sítio serve várias ao mesmo tempo, e a página de produto
 * não é de nenhuma.
 */
export const metadata: Metadata = {
  title: { default: 'Paragem.pt', template: '%s · Paragem.pt' },
  description: 'Todos os transportes de uma região, num sítio só.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <head>
        {/* Atkinson Hyperlegible: desenhada para quem vê mal, que é meia razão
            para a escolher; a outra é que distingue o que se confunde num
            horário — 1/l/I e 0/O (§8). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="saltar" href="#conteudo">
          Saltar para o conteúdo
        </a>
        <Medicao />
        {children}
      </body>
    </html>
  );
}
