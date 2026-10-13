/**
 * O INTERRUPTOR DAS LEITURAS AO VIVO — em código, e com a razão ao lado.
 *
 * As duas leituras deste serviço vão buscar dados a SISTEMAS DE TERCEIROS no
 * momento em que alguém abre a página:
 *
 *   · as bicicletas leem o HTML da página de estações que o sítio de um
 *     sistema de bicicletas partilhadas publica (`nucleo.mjs`, `analisar.mjs`);
 *   · os expressos perguntam preços e lugares a uma pesquisa NÃO DOCUMENTADA do
 *     operador, sem autenticação, cujos termos de reutilização estão «por
 *     confirmar» (a fonte da pesquisa de expressos, em `data/sources.yaml`).
 *
 * Nenhuma das duas tem um acordo escrito publicado com quem publica a fonte.
 *
 * AS BICICLETAS ESTÃO LIGADAS, por decisão do dono a 13 de outubro de 2026:
 * «As contagens de bicicletas podem e devem entrar.» A página que se lê é a
 * que o próprio sistema publica para quem procura uma bicicleta — a mesma
 * informação, à mesma hora — e a contagem é o que faz a página do modo servir
 * a quem está na rua. A regra do §4.3 do briefing continua a valer: se o
 * `robots.txt` ou os termos do sítio lido passarem a proibir a leitura, ou o
 * dono do sistema a desautorizar, volta-se a desligar aqui, num commit.
 *
 * OS EXPRESSOS CONTINUAM DESLIGADOS: perguntar preços a uma pesquisa não
 * documentada de um operador privado é outra coisa, e espera por um acordo. O
 * sítio não pede a leitura (`web/src/lib/enderecos.ts`), a rota responde que
 * está desligada sem tocar na fonte, e o contentor não a levanta. Os horários
 * dos expressos continuam a sair dos ficheiros públicos (GTFS) — nenhuma
 * secção fica vazia.
 *
 * LIGAR OU DESLIGAR UMA É UM COMMIT, e não uma variável de ambiente: tem de
 * ficar escrito no histórico, com a razão — citada aqui e registada na fonte,
 * no `sources.yaml` da raiz da região. Uma variável mudava-se num painel de
 * alojamento sem ninguém saber porquê.
 */
export const LEITURAS_AUTORIZADAS = Object.freeze({
  bicicletas: true,
  expressos: false,
});

/** A frase que as rotas devolvem, e o contentor escreve, quando a leitura está desligada. */
export const RAZAO_DA_LEITURA_DESLIGADA =
  'desligada: lê um sistema de terceiros sem acordo escrito publicado ' +
  '(disponibilidade/autorizacao.mjs)';
