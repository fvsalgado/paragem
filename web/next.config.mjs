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
