/**
 * Os expressos ao vivo: o que custa hoje, e se ainda há lugar.
 *
 * O horário que o sítio publica é PLANEADO — sai do GTFS do operador e diz a
 * que horas o autocarro devia partir. Para um expresso isso não chega: quem
 * vai de uma cidade da região para a capital quer saber quanto custa a viagem
 * de amanhã e se ainda há lugares, e nenhuma das duas coisas está num GTFS.
 *
 * Isto vive ao lado da disponibilidade das bicicletas, e pela mesma razão: o
 * sítio é estático de propósito (CLAUDE.md §7), e um ficheiro parado não
 * consegue ir perguntar um preço no momento em que alguém abre a página.
 *
 * ## Três regras que valem mais do que o código
 *
 * **CONSULTAR NÃO É REPUBLICAR.** A resposta é atravessada e entregue a quem
 * perguntou; não se guarda, não se serve como dado nosso, não entra em feed
 * nenhum. A cache que existe é curta e é para ser gentil com a fonte — cem
 * pessoas no mesmo minuto fazem uma pergunta, não cem —, não para acumular
 * preços. Os termos de reutilização do operador estão por confirmar
 * (`data/sources.yaml`, `flixbus-pesquisa`), e até estarem é assim que fica.
 *
 * **A PEDIDO, UM PAR DE CADA VEZ.** O GTFS conhece 116 pares origem→destino a
 * partir desta região. Perguntar os 116 ao abrir uma página era martelar a
 * fonte para mostrar números que quase ninguém ia ler. Pergunta-se o par que
 * a pessoa escolheu, quando o escolhe.
 *
 * **DEGRADA EM SILÊNCIO.** A API não é documentada: pode mudar sem aviso e
 * nada nos é prometido. Quando não responde, ou responde outra coisa, isto
 * devolve uma lista vazia e o sítio fica exatamente como está hoje — com o
 * horário planeado. Nunca um erro à frente de quem só queria um horário.
 *
 * ## E os identificadores já batem certo
 *
 * O `stop_id` do GTFS do operador É o identificador que a pesquisa dele
 * aceita em `from_station_id`. Não há tabela de correspondência nenhuma para
 * manter — medido a 21/09/2026 com as quatro paragens da região.
 */

/** Quanto tempo esperamos pela fonte antes de desistir. */
const ESPERA_MS = 12000;

/** Um identificador de paragem do operador: UUID, e nada mais. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Uma data em ISO, que é como o sítio a escreve. */
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A configuração, lida do ambiente.
 *
 * O ENDEREÇO É UM VALOR E NÃO CÓDIGO, como no núcleo das bicicletas: uma
 * região servida por outro operador de expressos aponta isto a outro sítio
 * sem tocar aqui. O que este ficheiro sabe de específico é a FORMA da
 * resposta — e isso está no `normalizar`, que é onde se vai quando a fonte
 * mudar.
 */
export function configuracao(env = {}) {
  return {
    url: env.PARAGEM_EXPRESSOS_URL || '',
    origem: env.PARAGEM_ORIGEM || '',
    // Um preço não muda ao segundo, e a fonte agradece. Cinco minutos é curto
    // o bastante para não enganar ninguém e longo o bastante para uma página
    // partilhada não repetir a pergunta.
    cacheS: Number.parseInt(env.PARAGEM_EXPRESSOS_CACHE_S || '300', 10),
    moeda: env.PARAGEM_MOEDA || 'EUR',
  };
}

export function faltaNaConfiguracao(cfg) {
  const falta = [];
  if (!cfg.url) falta.push('PARAGEM_EXPRESSOS_URL (o endereço da pesquisa do operador)');
  return falta;
}

/**
 * O pedido é válido? E se não for, porquê.
 *
 * Isto corre ANTES de se tocar na fonte, e é de propósito: o serviço é
 * aberto a quem abre a página, e sem isto qualquer pessoa podia mandá-lo
 * buscar o que quisesse ao operador. Só passam dois UUID e uma data.
 */
export function pedidoInvalido({ de, para, data }) {
  if (!UUID.test(String(de || ''))) return 'a paragem de partida não é um identificador válido';
  if (!UUID.test(String(para || ''))) return 'a paragem de chegada não é um identificador válido';
  if (de === para) return 'a partida e a chegada são a mesma paragem';
  if (data && !DATA.test(String(data))) return 'a data não está em AAAA-MM-DD';
  return null;
}

/** Hoje, no fuso de quem usa o sítio — e não no do servidor. */
export function hoje(fuso = 'Europe/Lisbon', agora = new Date()) {
  // `en-CA` dá AAAA-MM-DD, que é a forma que entra e sai daqui.
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** AAAA-MM-DD → DD.MM.AAAA, que é como a fonte quer a data. */
export function dataDaFonte(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}.${m}.${a}`;
}

/** O endereço a perguntar, montado a partir do pedido. */
export function endereco(cfg, { de, para, data }) {
  const q = new URLSearchParams({
    from_station_id: de,
    to_station_id: para,
    departure_date: dataDaFonte(data),
    products: JSON.stringify({ adult: 1 }),
    currency: cfg.moeda,
    locale: 'pt',
    search_by: 'stations',
    include_after_midnight_rides: '1',
  });
  return `${cfg.url}?${q}`;
}

/**
 * A resposta da fonte reduzida ao que a página mostra.
 *
 * O NOME DA PARAGEM DE CADA PONTA NÃO É PORMENOR. «Lisboa (Oriente)» e
 * «Lisboa (Sete Rios)» não são o mesmo sítio para quem vai apanhar o
 * autocarro, e ficar só «para Lisboa» é mandar alguém para o lado errado da
 * cidade. A resposta traz um dicionário de paragens com os nomes a sério; é
 * daí que eles vêm.
 *
 * Tudo o que não se reconhece fica `null`, nunca inventado (§4.4): uma
 * viagem esgotada não tem preço, e `null` diz isso melhor do que um zero.
 */
export function normalizar(resposta) {
  const paragens = resposta?.stations || {};
  const nome = (id) => (id && paragens[id]?.name) || null;
  const bruto = Object.values((resposta?.trips || [])[0]?.results || {});
  return bruto
    .map((v) => ({
      partida: v?.departure?.date ?? null,
      chegada: v?.arrival?.date ?? null,
      paragemPartida: nome(v?.departure?.station_id),
      paragemChegada: nome(v?.arrival?.station_id),
      duracaoMin: v?.duration ? v.duration.hours * 60 + v.duration.minutes : null,
      preco: v?.price?.total_with_platform_fee ?? v?.price?.total ?? null,
      lugares: v?.available?.seats ?? null,
      // O `uid` marca com `direct:` as que não mudam de autocarro. Sem `uid`
      // não se afirma que há transbordo: fica por saber.
      direto: typeof v?.uid === 'string' ? v.uid.startsWith('direct:') : null,
      estado: v?.status ?? null,
    }))
    .filter((v) => v.partida)
    .sort((a, b) => String(a.partida).localeCompare(String(b.partida)));
}

/**
 * Uma consulta: pergunta à fonte, devolve as viagens e a hora a que se leu.
 *
 * A HORA É A DA LEITURA, como na disponibilidade das bicicletas. É a única
 * honesta — a resposta não vem carimbada — e é a que a página mostra.
 */
export async function consultar(cfg, pedido, buscar = fetch) {
  const data = pedido.data || hoje();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ESPERA_MS);
  try {
    const r = await buscar(endereco(cfg, { ...pedido, data }), {
      headers: {
        // Identifica-se, em vez de se disfarçar. Se a fonte quiser falar
        // connosco, tem por onde.
        'user-agent': 'Paragem.pt (+https://github.com/fvsalgado/paragem)',
        accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!r?.ok) return { data, viagens: [], lido: Date.now(), falhou: true };
    return { data, viagens: normalizar(await r.json()), lido: Date.now(), falhou: false };
  } catch {
    // DEGRADA EM SILÊNCIO: quem chamou mostra o horário planeado.
    return { data, viagens: [], lido: Date.now(), falhou: true };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Uma cache curta por pergunta, para ser gentil com a fonte.
 *
 * NÃO É UM ARQUIVO. Guarda a última resposta de cada par durante `cacheS`
 * segundos e esquece-a a seguir; uma resposta que falhou não se guarda, para
 * que a pergunta seguinte volte a tentar. O limite de tamanho existe porque
 * isto é aberto a quem abre a página: sem ele, pedidos variados enchiam a
 * memória do processo.
 */
export function criarCache(cfg, buscar = fetch, maximo = 200) {
  const guardadas = new Map();
  return {
    async obter(pedido) {
      const data = pedido.data || hoje();
      const chave = `${pedido.de}|${pedido.para}|${data}`;
      const antes = guardadas.get(chave);
      if (antes && Date.now() - antes.lido < cfg.cacheS * 1000) return antes;
      const nova = await consultar(cfg, { ...pedido, data }, buscar);
      if (!nova.falhou) {
        // O Map preserva a ordem de inserção: a primeira é a mais antiga.
        if (guardadas.size >= maximo) guardadas.delete(guardadas.keys().next().value);
        guardadas.set(chave, nova);
      }
      return nova;
    },
    get tamanho() {
      return guardadas.size;
    },
  };
}
