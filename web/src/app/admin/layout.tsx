import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sair } from '@/lib/painel/acoes';
import { sessaoAtual, type Dentro } from '@/lib/painel/autenticacao';
import { temChaveDeServico } from '@/lib/painel/base';
import { listarRegioes } from '@/lib/painel/consultas';
import { CABECALHO_DO_CAMINHO, barreiraDoLayout } from '@/lib/painel/guarda';
import { pode } from '@/lib/painel/papeis';
import MarcaDoProduto from '@/componentes/MarcaDoProduto';
import BotaoDoTema from '@/componentes/BotaoDoTema';

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

type Item = { href: string; rotulo: string; raiz?: boolean };

/**
 * A barra, conforme quem está dentro. O dono tem as três áreas; uma pessoa
 * tem o que os papéis lhe dão — uma editora com uma região só vê «Avisos»,
 * porque é tudo o que pode fazer, e uma barra com o que não se pode abrir era
 * uma barra de portas fechadas.
 */
function navegacao(dentro: Dentro): Item[] {
  if (dentro.dono) {
    return [
      { href: '/admin/', rotulo: 'Regiões', raiz: true },
      { href: '/admin/pessoas/', rotulo: 'Pessoas' },
      { href: '/admin/auditoria/', rotulo: 'Auditoria' },
    ];
  }
  const regioes = Object.keys(dentro.papeis);
  const gestora = regioes.some((r) => pode(dentro, r, 'gestor'));
  const itens: Item[] = [];
  if (regioes.length === 1) {
    const [r] = regioes as [string];
    const ficha = `/admin/regioes/${encodeURIComponent(r)}/`;
    if (gestora) itens.push({ href: ficha, rotulo: 'A região', raiz: true });
    itens.push({ href: `${ficha}avisos/`, rotulo: 'Avisos' });
  } else if (regioes.length > 1) {
    itens.push({ href: '/admin/', rotulo: 'As minhas regiões', raiz: true });
  }
  if (gestora) itens.push({ href: '/admin/auditoria/', rotulo: 'Auditoria' });
  return itens;
}

/**
 * A ligação da barra que corresponde à página aberta — ou a uma ficha
 * debaixo dela. A raiz só é ela própria (e, para o dono, as fichas das
 * regiões); as outras são tudo o que começa por elas.
 */
function estaAberta(caminho: string | null, item: Item, itens: Item[]): boolean {
  if (!caminho) return false;
  const aberto = caminho.replace(/\/+$/, '');
  const alvo = item.href.replace(/\/+$/, '');
  if (item.raiz) {
    if (alvo === '/admin') return aberto === '/admin' || aberto.startsWith('/admin/regioes');
    // A ficha de uma região é a raiz, e os avisos dela são outra entrada.
    const outra = itens.some(
      (x) => !x.raiz && aberto.startsWith(x.href.replace(/\/+$/, '')) && x.href !== item.href,
    );
    return !outra && (aberto === alvo || aberto.startsWith(`${alvo}/`));
  }
  return aberto === alvo || aberto.startsWith(`${alvo}/`);
}

/**
 * O layout é a segunda barreira do painel, e o sítio onde ela cabe uma vez só.
 *
 * O middleware barra à porta; as ações voltam a pedir a sessão — e o papel —
 * cada uma; e as LEITURAS passam todas por aqui, que é o único caminho comum.
 * A sessão relê-se com `sessaoAtual()` e não com o que o middleware decidiu,
 * de propósito: são verificações independentes, e é assim que uma apanha o
 * que a outra deixar passar. E é aqui que se sabe QUEM está dentro — a
 * pessoa e os papéis dela, lidos da base neste pedido.
 */
export default async function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  const portao = await sessaoAtual();
  const caminho = (await headers()).get(CABECALHO_DO_CAMINHO);
  const entrada = barreiraDoLayout(portao.ok, caminho);
  if (entrada) redirect(entrada);

  const itens = portao.ok ? navegacao(portao) : [];
  // O SELETOR DE REGIÃO, para quem tem mais de uma: as outras entram por aqui
  // sem passar pela lista. O dono tem a lista inteira na página das regiões.
  const minhas =
    portao.ok && !portao.dono && Object.keys(portao.papeis).length > 1 && temChaveDeServico()
      ? (await listarRegioes()).filter((r) => portao.papeis[r.id])
      : [];

  return (
    <>
      <header className="cabecalho painel-cabecalho">
        <div className="interior">
          {/* A uma cor e em letra cheia: no painel o vermelho do produto
              quer dizer perigo, e a esta altura as linhas juntam-se (§6). */}
          <Link href="/admin/" className="marca">
            <MarcaDoProduto versao="cheia" umaCor />
            <span className="so-para-leitores">Paragem.pt</span>
          </Link>
          <span className="marca-dados">Painel</span>
          {portao.ok ? (
            <>
              <p className="quem">
                {/* Num telemóvel, o nome — e o prefixo só para quem ouve: com
                    ele à vista, era o nome que ficava cortado. */}
                <span className="prefixo">Entraste como </span>
                <strong>{portao.pessoa ? portao.pessoa.nome : 'dono'}</strong>
              </p>
              <form action={sair} className="sair">
                <button type="submit" className="secundario">
                  Sair
                </button>
              </form>
            </>
          ) : null}
          <BotaoDoTema />
        </div>
        {portao.ok && (itens.length > 0 || minhas.length > 0) ? (
          <div className="interior navegacao-do-painel">
            <nav aria-label="Painel">
              <ul>
                {itens.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={estaAberta(caminho, item, itens) ? 'page' : undefined}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {minhas.length > 0 ? (
              <form method="get" action="/admin/" className="seletor-de-regiao">
                <label htmlFor="ir-para-regiao">Região</label>
                <select id="ir-para-regiao" name="regiao" defaultValue="">
                  <option value="" disabled>
                    Escolher…
                  </option>
                  {minhas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="secundario">
                  Abrir
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </header>
      <main id="conteudo" className="pagina painel">
        {children}
      </main>
    </>
  );
}
