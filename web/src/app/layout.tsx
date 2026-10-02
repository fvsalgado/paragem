import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './global.css';
import Medicao from '@/componentes/Medicao';
import { COR_DO_TEMA } from '@/lib/manifesto';

/**
 * O invólucro de TUDO — do produto e de cada região.
 *
 * O que era daqui e passou a ser da região (cabeçalho, rodapé, título) está em
 * `[regiao]/layout.tsx`. Este ficheiro deixou de saber o que é uma região, e é
 * essa a mudança: o sítio serve várias ao mesmo tempo, e a página de produto
 * não é de nenhuma.
 *
 * O manifesto é o mesmo endereço em todos os anfitriões, e cada um responde o
 * seu (`regiao-host.ts`): o de uma região chama-se como ela. Os ícones são
 * convenções do Next nesta pasta — `icon.svg`, `apple-icon.png`,
 * `favicon.ico` —, e o Next põe as ligações para eles sozinho.
 */
export const metadata: Metadata = {
  title: { default: 'Paragem.pt', template: '%s · Paragem.pt' },
  description: 'Todos os transportes de uma região, num sítio só.',
  manifest: '/manifest.webmanifest',
};

/** A barra do navegador na cor da marca, no Android e no ecrã de arranque. */
export const viewport: Viewport = { themeColor: COR_DO_TEMA };

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
/*
 * SÓ O ALFABETO LATINO SE PRÉ-CARREGA. O `latin` do Google já traz o
 * português todo — os acentos, o «ç», o «ã», as aspas angulares e o «€»;
 * o `latin-ext` é o «ł», o «ő», o «ș». Pré-carregados os dois, cada página
 * pagava 12 kB por letras que quase nunca escreve (P3-006). O `latin-ext`
 * continua declarado, com o seu `unicode-range`: o navegador só o pede se uma
 * página o usar — o nome de uma cidade estrangeira num expresso.
 */
const letra = Atkinson_Hyperlegible({
  weight: ['400', '700'],
  subsets: ['latin'],
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
