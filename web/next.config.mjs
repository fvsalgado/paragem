/**
 * O sítio deixou de ser exportação estática (CLAUDE.md §11.7).
 *
 * Foi `output: 'export'` enquanto serviu uma região: as páginas saíam do GTFS
 * na construção e o CI enviava os ficheiros prontos. A segunda região não
 * cabia no limite de ficheiros da plataforma, e o painel do dono não podia
 * esperar dezoito minutos por uma reconstrução. As páginas continuam a ser
 * servidas da cache como ficheiros — `revalidate` no invólucro de cada região,
 * etiquetas por região nas leituras (`src/lib/dados.ts`) — e invalidam-se por
 * sinal (`/api/revalidate`). A plataforma constrói o sítio a partir do Git; os
 * dados chegam do armazém em tempo de pedido.
 *
 * `trailingSlash` fica: todas as ligações internas terminam em `/`, e mudar
 * isso era mudar todos os endereços de uma vez.
 */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: true,
  images: { unoptimized: true },
  /*
   * OS METADADOS VÃO NO <head>, SEMPRE — e não a meio da página.
   *
   * O Next 15 «transmite» os metadados: se o `generateMetadata` acaba depois
   * de o cabeçalho do HTML ter saído, o título, a descrição e o `og:*` vão
   * parar ao corpo, e o navegador arruma-os depois. Só os manda no `<head>`
   * aos robôs que ele conhece. Mas aqui as páginas ficam em cache: a primeira
   * visita rende-a, e a cópia serve toda a gente durante uma hora — também o
   * WhatsApp que pede a pré-visualização da paragem, e que só lê o `<head>`.
   * Medido antes de escrever isto: na mesma construção, a página de uma
   * paragem saía com os metadados no `<head>` e a de uma linha no corpo,
   * conforme a leitura dos dados acabava antes ou depois.
   *
   * Tratar todos os pedidos como robôs põe os metadados no `<head>` em todas
   * as renderizações. O custo é o cabeçalho esperar pelos metadados — que
   * leem os mesmos dados que a página já está à espera de ler.
   */
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      // O processador do mapa leva a versão no caminho
      // (`scripts/copiar-maplibre.mjs`): um caminho que muda com a versão pode
      // ser imutável, e um Worker que não se volta a pedir é um mapa que abre
      // mais depressa na segunda visita.
      {
        source: '/maplibre/:versao/:ficheiro',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default config;
