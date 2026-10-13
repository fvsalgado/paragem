/**
 * O INTERRUPTOR DAS LEITURAS AO VIVO — em código, e desligado.
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
 * Nenhuma das duas tem um acordo escrito publicado com quem publica a fonte. O
 * §4.3 do briefing não deixa automatizar o que não se sabe se se pode, e uma
 * autoridade de transportes não deve servir no seu sítio uma leitura que o
 * dono da fonte pode desautorizar amanhã. Por isso ficam DESLIGADAS: o sítio
 * não as pede (`web/src/lib/enderecos.ts`), as rotas respondem que estão
 * desligadas sem tocar na fonte, e o contentor não as levanta.
 *
 * O que se perde é só o que é ao vivo. Os horários dos expressos continuam a
 * sair dos ficheiros públicos (GTFS), e as estações de bicicletas continuam no
 * mapa e na página do modo, sem a contagem — nenhuma secção fica vazia.
 *
 * LIGAR UMA É UM COMMIT, e não uma variável de ambiente: tem de ficar escrito
 * no histórico, ao lado do acordo que a autoriza — citado aqui e registado na
 * fonte, no `sources.yaml` da raiz da região. Uma variável mudava-se num painel
 * de alojamento sem ninguém saber porquê.
 */
export const LEITURAS_AUTORIZADAS = Object.freeze({
  bicicletas: false,
  expressos: false,
});

/** A frase que as rotas devolvem, e o contentor escreve, quando a leitura está desligada. */
export const RAZAO_DA_LEITURA_DESLIGADA =
  'desligada: lê um sistema de terceiros sem acordo escrito publicado ' +
  '(disponibilidade/autorizacao.mjs)';
