/**
 * O MODO DE PRÉ-VISUALIZAÇÃO: o sítio do ramo `pre`, antes de ir para o ar.
 *
 * Uma mudança entra primeiro no ramo `pre`, que a plataforma publica nos
 * endereços com a marca `pre` — `pre.<domínio do produto>` para o produto,
 * `<região>.pre.<domínio do produto>` para cada região — e fecha por trás do
 * início de sessão dela. É lá que o dono a confere; só depois ela passa para o
 * `main`, que é o que está no ar (`docs/PRE-VISUALIZACAO.md`).
 *
 * A pré-visualização lê os MESMOS dados que o sítio público — os ficheiros do
 * armazém e a base pela porta pública —, porque uma mudança só se confere a
 * sério com os horários a sério. E por isso NÃO ESCREVE em lado nenhum: o
 * painel fica fechado e a porta de serviço da base recusa (`painel/base.ts`),
 * mesmo que o alojamento lhe dê as chaves. Uma pré-visualização que
 * escrevesse nos dados reais era uma segunda produção sem ninguém a saber.
 *
 * Isto corre também no runtime de edge, à frente de todos os pedidos: não
 * importa nada do Node nem do Next.
 */

/** O rótulo que marca um endereço de pré-visualização. */
export const MARCA_DE_PRE = 'pre';

/**
 * Este deployment é uma pré-visualização?
 *
 * Quem o diz é a plataforma (`VERCEL_ENV`, que vale `preview` em tudo o que
 * não é produção — o ramo `pre` e os ramos de cada PR). Fora dela,
 * `PARAGEM_PRE_VISUALIZACAO=1` liga o modo à mão, para o ver a correr numa
 * máquina qualquer.
 */
export function emPreVisualizacao(
  plataforma: string | undefined = process.env.VERCEL_ENV,
  aMao: string | undefined = process.env.PARAGEM_PRE_VISUALIZACAO,
): boolean {
  return plataforma === 'preview' || aMao === '1';
}

/**
 * O anfitrião de produção que um endereço de pré-visualização representa:
 * `demo.pre.paragem.pt` → `demo.paragem.pt`, `pre.paragem.pt` → `paragem.pt`.
 * `null` quando o endereço não leva a marca.
 *
 * Tira-se o rótulo, e só ele, onde estiver: uma região nova ganha o seu
 * endereço de pré-visualização sem uma linha de código, como ganha o de
 * produção. A marca precisa de um domínio inteiro à direita — «pre.pt» não
 * representa nada — e só conta como rótulo: `prev.paragem.pt` e
 * `pre-demo.paragem.pt` não a levam.
 */
export function semAMarcaDePre(host: string): string | null {
  const rotulos = host.split('.');
  const i = rotulos.indexOf(MARCA_DE_PRE);
  if (i === -1 || rotulos.length - i - 1 < 2) return null;
  return [...rotulos.slice(0, i), ...rotulos.slice(i + 1)].join('.');
}
