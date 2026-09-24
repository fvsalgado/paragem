import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Assinatura } from '@/componentes/Marca';
import { sair } from '@/lib/painel/acoes';
import { sessaoAtual } from '@/lib/painel/autenticacao';
import { CABECALHO_DO_CAMINHO, barreiraDoLayout } from '@/lib/painel/guarda';
import { CORES_DA_FAIXA } from '@/lib/marca';

/** Nada do painel pode ser servido de cache. */
export const dynamic = 'force-dynamic';

/*
 * O título do separador diz a página e depois a área — «Auditoria · Painel».
 * Cada página declara o seu; sem isso eram separadores todos iguais para
 * quem tem três abertos, e um só nome para quem navega por títulos com um
 * leitor de ecrã (WCAG 2.4.2).
 */
export const metadata: Metadata = {
  title: { default: 'Painel · Paragem.pt', template: '%s · Painel · Paragem.pt' },
  robots: { index: false, follow: false, noarchive: true },
};

/** O painel não é de nenhuma região: veste a cor da montra (`lib/marca.ts`). */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: CORES_DA_FAIXA.montra },
    { media: '(prefers-color-scheme: dark)', color: CORES_DA_FAIXA.montra },
  ],
};

const NAV = [
  { href: '/admin/', rotulo: 'Regiões' },
  { href: '/admin/auditoria/', rotulo: 'Auditoria' },
] as const;

/**
 * A ligação da barra que corresponde à página aberta — ou a uma ficha
 * debaixo dela. As regiões são a raiz, por isso só são elas em `/admin` e
 * nas fichas; a auditoria é tudo o que começa por ela.
 */
function estaAberta(caminho: string | null, href: string): boolean {
  if (!caminho) return false;
  const aberto = caminho.replace(/\/+$/, '');
  const alvo = href.replace(/\/+$/, '');
  if (alvo === '/admin') return aberto === '/admin' || aberto.startsWith('/admin/regioes');
  return aberto === alvo || aberto.startsWith(`${alvo}/`);
}

/**
 * O layout é a segunda barreira do painel, e o sítio onde ela cabe uma vez só.
 *
 * O middleware barra à porta; as ações voltam a pedir a sessão cada uma; e
 * as LEITURAS — a lista das regiões, as licenças, a auditoria — passam todas
 * por aqui, que é o único caminho comum. A sessão relê-se com `sessaoAtual()`
 * e não com o que o middleware decidiu, de propósito: são verificações
 * independentes, e é assim que uma apanha o que a outra deixar passar. A
 * `barreiraDoLayout` explica quando se barra e porque é preciso o cabeçalho.
 */
export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const portao = await sessaoAtual();
  const caminho = (await headers()).get(CABECALHO_DO_CAMINHO);
  const entrada = barreiraDoLayout(portao.ok, caminho);
  if (entrada) redirect(entrada);

  return (
    <>
      {/* O painel não é de nenhuma região — veste a cor da montra. */}
      <header className="cabecalho cabecalho-montra painel-cabecalho">
        <div className="interior">
          <Link href="/admin/" className="marca">
            <Assinatura />
          </Link>
          <span className="marca-dados">Painel</span>
          {portao.ok ? (
            <>
              <nav aria-label="Painel">
                <ul>
                  {NAV.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={estaAberta(caminho, item.href) ? 'page' : undefined}
                      >
                        {item.rotulo}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <form action={sair} className="sair">
                <button type="submit" className="secundario">
                  Sair
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>
      <main id="conteudo" className="pagina painel">
        {children}
      </main>
    </>
  );
}
