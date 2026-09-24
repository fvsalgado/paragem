import type { Metadata } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
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

/**
 * Atkinson Hyperlegible: desenhada para quem vê mal, que é meia razão para a
 * escolher; a outra é que distingue o que se confunde num horário — 1/l/I e
 * 0/O (§6).
 *
 * SERVE-SE DAQUI, E NÃO DO GOOGLE. Vinha de `fonts.googleapis.com` em cada
 * visita: o navegador pedia-a ao Google, e o Google ficava com o endereço IP
 * de quem abria uma página de horários — num sítio cuja página de
 * privacidade diz que não o regista. O `next/font` vai buscá-la uma vez, na
 * construção, e serve-a com o resto do sítio. A letra é a mesma.
 */
const letra = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--letra',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={letra.variable}>
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
