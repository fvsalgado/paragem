/**
 * `GET /robots.txt` no anfitrião de uma REGIÃO — e a regra não mudou.
 *
 * Era `public/robots.txt`, servido igual a todos os anfitriões. Mudou-se para
 * aqui quando o anfitrião do produto passou a ter o seu
 * (`app/-produto/robots.txt`), que deixa indexar uma página sem horários. O
 * desta continua a fechar a porta, com o comentário que tinha, palavra por
 * palavra: é o §4.4 escrito para os motores de busca, e sai quando a
 * autoridade de transportes autorizar (Fase 5) — num commit que alguém
 * assina, e não num interruptor de um painel.
 *
 * Sem `Sitemap:`, de propósito. O mapa do sítio da região já existe
 * (`app/[regiao]/sitemap.xml`), para esse dia ser uma linha aqui; antes dele,
 * apontá-lo era convidar a ler o que se pede para não indexar.
 */
const REGRA = `# Este ficheiro não é um pormenor de configuração: é o §4.4 escrito para os
# motores de busca.
#
# O que aqui se publica são horários planeados, com a data dos dados, e pode
# ter preços marcados «por confirmar» e serviços cujas datas ninguém confirmou.
# A interface diz tudo isso a quem a lê — um resultado de pesquisa não diz nada
# disso a quem só vê o título e a hora.
#
# Quantos são, região a região, está no relatório de lacunas de cada construção,
# e não aqui. Este parágrafo contava-os, e as contas envelheceram sem ninguém
# lhes tocar: quando se foi ver, a maior parte dos preços que dava por confirmar
# já estava confirmada. Um número sobre uma fonte viva não se crava num
# comentário (CLAUDE.md §8).
#
# Enquanto for assim, não se indexa. Sai quando a autoridade de transportes
# autorizar a publicação (CLAUDE.md §9, Fase 5), e não antes — e sai DAQUI, num
# commit que alguém assina, não num interruptor de um painel que se desliga sem
# deixar rasto.
#
# E É A ÚNICA TRANCA QUE HÁ EM PRODUÇÃO. Este comentário dizia que «a proteção
# da Vercel faz o mesmo do outro lado», e não faz: medido no painel do projeto,
# o \`ssoProtection\` está ligado só para as PRÉ-VISUALIZAÇÕES. O endereço
# público está aberto a quem lá chegue — o que é o que se quer, porque há quem
# precise de apanhar o autocarro —, e o que não se quer é que um motor de busca
# ponha uma hora destas num resultado sem o resto da página à volta.
#
# Quem mudar isto num painel não deixa rasto aqui. Quem o mudar aqui deixa.

User-agent: *
Disallow: /
`;

export function GET(): Response {
  return new Response(REGRA, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
