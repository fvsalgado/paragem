/**
 * O núcleo da disponibilidade: ler a página, e montar o GBFS.
 *
 * Está separado dos invólucros de propósito. O mesmo trabalho tem de correr em
 * dois sítios muito diferentes — uma função da Vercel, para quem aloja o sítio
 * lá, e um contentor, para quem licencie o produto e o queira alojar onde
 * quiser (CLAUDE.md §7: o produto não se amarra a uma plataforma com funções).
 * Duas cópias desta lógica divergiam, e a divergência aparecia como uma
 * contagem certa num alojamento e errada no outro.
 *
 * Aqui não há nada de rede nem de HTTP para além do `fetch` da página: quem
 * responde ao navegador é o invólucro.
 */

import { analisar, chave } from './analisar.mjs';

/** Quanto tempo esperamos pela página antes de desistir de uma leitura. */
const ESPERA_MS = 15000;

/**
 * A configuração, lida do ambiente. Igual nos dois invólucros.
 *
 * NADA AQUI DIZ A MARCA DE NENHUM SISTEMA (§11.1): o endereço da página é um
 * valor, não código.
 */
export function configuracao(env = {}) {
  return {
    url: env.PARAGEM_PAINEL_URL || '',
    origem: env.PARAGEM_ORIGEM || '',
    cacheS: Number.parseInt(env.PARAGEM_CACHE_S || '60', 10),
    // A página pode listar mais do que um sistema; isto deixa servir só parte.
    excluir: (env.PARAGEM_EXCLUIR || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * O que falta na configuração para isto poder sequer arrancar.
 *
 * SÓ O ENDEREÇO DA PÁGINA É OBRIGATÓRIO. A origem não é, e a omissão dela é
 * a mais fechada que há: sem `PARAGEM_ORIGEM` não se manda cabeçalho de CORS
 * nenhum, e então só a MESMA origem pode ler isto — que é o caso normal,
 * quando a função é servida ao lado do sítio. É preciso declará-la quando o
 * serviço vive noutro domínio (o contentor), e aí é ela que diz qual.
 *
 * Nunca `*`: um `*` deixava qualquer página do mundo gastar isto e a fonte.
 */
export function faltaNaConfiguracao(cfg) {
  const falta = [];
  if (!cfg.url) falta.push('PARAGEM_PAINEL_URL (o endereço da página de estações)');
  return falta;
}

/**
 * Uma leitura da página: as estações com as contagens, e a hora em que se leu.
 *
 * A hora é a DA LEITURA, e não da página: a página não se carimba. É a única
 * honesta, e é a que o navegador mostra («há 40 s»).
 */
export async function lerPainel(cfg, buscar = fetch) {
  const resposta = await buscar(cfg.url, {
    headers: { 'user-agent': 'paragem-pt/1.0 (+disponibilidade)' },
    signal: AbortSignal.timeout(ESPERA_MS),
  });
  if (!resposta.ok) throw new Error(`a página respondeu ${resposta.status}`);
  let estacoes = analisar(await resposta.text());
  if (cfg.excluir.length) {
    estacoes = estacoes.filter((e) => !cfg.excluir.some((x) => e.nome.includes(x)));
  }
  // Zero estações é uma leitura falhada, não uma rede sem bicicletas: a página
  // mudou de forma, ou veio outra coisa. Rebenta em vez de publicar vazio.
  if (estacoes.length === 0) throw new Error('a página não trouxe estação nenhuma');
  return { gerado: Date.now(), estacoes };
}

/** O GBFS `station_status`, com a hora da leitura em cada estação. */
export function stationStatus(dados, ttlS) {
  const segundos = Math.floor(dados.gerado / 1000);
  return {
    last_updated: segundos,
    ttl: ttlS,
    version: '2.3',
    data: {
      stations: dados.estacoes.map((e) => ({
        station_id: chave(e.nome),
        // Um número que se leu é um número; um que faltou fica de fora, e o
        // cliente mostra a estação sem contagem em vez de mostrar um palpite.
        ...(e.bicicletas != null ? { num_bikes_available: e.bicicletas } : {}),
        ...(e.docas != null ? { num_docks_available: e.docas } : {}),
        is_installed: 1,
        is_renting: 1,
        is_returning: 1,
        last_reported: segundos,
      })),
    },
  };
}

/** O ficheiro de descoberta. Anuncia SÓ o que existe. */
export function descoberta(base, ttlS) {
  return {
    last_updated: Math.floor(Date.now() / 1000),
    ttl: ttlS,
    version: '2.3',
    data: { pt: { feeds: [{ name: 'station_status', url: `${base}/station_status.json` }] } },
  };
}

/**
 * Uma leitura guardada, partilhada por quem pedir ao mesmo tempo.
 *
 * Serve os dois invólucros: no contentor dura enquanto o processo viver, e na
 * função dura enquanto a instância estiver quente. Em qualquer dos casos faz a
 * mesma promessa — ser GENTIL com a fonte: cem pedidos no mesmo minuto são uma
 * leitura da página, e zero quando ninguém está a ver.
 *
 * E a fonte em baixo não derruba isto: enquanto houver uma leitura boa, é essa
 * que se serve, com a hora dela. Quem decide se ainda vale é o navegador, pelo
 * prazo de validade.
 */
export function criarCache(cfg, buscar = fetch) {
  let guardado = null;
  let aLer = null;
  return {
    get ultima() {
      return guardado;
    },
    async obter() {
      const agora = Date.now();
      if (guardado && agora - guardado.gerado < cfg.cacheS * 1000) return guardado;
      if (!aLer) {
        aLer = lerPainel(cfg, buscar)
          .then((d) => (guardado = d))
          .finally(() => (aLer = null));
      }
      try {
        return await aLer;
      } catch (e) {
        if (guardado) return guardado;
        throw e;
      }
    },
  };
}
