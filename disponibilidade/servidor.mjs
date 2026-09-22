/**
 * O que é ao vivo, como serviço próprio, para quem o aloja onde quiser.
 *
 * É um INVÓLUCRO FINO sobre o `nucleo.mjs` e o `expressos.mjs`, irmão das
 * funções da plataforma em `api/`. Existe porque o produto não se pode
 * amarrar a uma plataforma com funções (CLAUDE.md §7): uma câmara que
 * licencie isto tem de o poder levantar numa máquina sua, ao lado do motor de
 * viagens, com um `docker compose up`.
 *
 * A diferença para as funções é só onde vive a cache. Aqui o processo dura,
 * por isso a leitura guarda-se em memória; lá é a rede da plataforma que a
 * guarda. A promessa é a mesma: ser gentil com a fonte, e não deixar que a
 * fonte em baixo derrube o serviço.
 *
 * ## DUAS CAPACIDADES, E CADA UMA É OPCIONAL
 *
 * Um contentor, dois trabalhos — as contagens das estações de bicicletas e os
 * preços dos expressos —, porque duplicar o alojamento para duas leituras
 * pequenas é peso a mais para quem licencia.
 *
 * Mas nem toda a região tem as duas: há quem tenha bicicletas e nenhum
 * expresso, e o contrário. Por isso **basta uma** para isto arrancar, e cada
 * caminho responde `501` se a capacidade dele não estiver configurada. Exigir
 * as duas obrigava a inventar um endereço para a que não existe, e um
 * endereço inventado é uma leitura errada à espera de acontecer.
 */

import { createServer } from 'node:http';
import { configuracao, criarCache, descoberta, faltaNaConfiguracao, stationStatus } from './nucleo.mjs';
import {
  configuracao as configExpressos,
  criarCache as criarCacheExpressos,
  faltaNaConfiguracao as faltaExpressos,
  pedidoInvalido,
} from './expressos.mjs';

const cfg = configuracao(process.env);
const cfgX = configExpressos(process.env);
const PORTA = Number.parseInt(process.env.PARAGEM_PORTA || '8080', 10);

const temBicicletas = faltaNaConfiguracao(cfg).length === 0;
const temExpressos = faltaExpressos(cfgX).length === 0;

if (!temBicicletas && !temExpressos) {
  process.stderr.write(
    'falta configuração: nenhuma capacidade está declarada.\n' +
      `  ${faltaNaConfiguracao(cfg).join('\n  ')}\n` +
      `  ${faltaExpressos(cfgX).join('\n  ')}\n`,
  );
  process.exit(2);
}

const cache = temBicicletas ? criarCache(cfg) : null;
const cacheX = temExpressos ? criarCacheExpressos(cfgX) : null;

const servidor = createServer(async (req, res) => {
  // CORS preso à origem declarada, nunca `*`. No contentor ela é quase sempre
  // precisa: o serviço vive noutro domínio que não o do sítio.
  if (cfg.origem) res.setHeader('access-control-allow-origin', cfg.origem);
  res.setHeader('vary', 'origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }

  const caminho = (req.url || '/').split('?')[0];
  if (caminho === '/saude') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    return;
  }

  // --- os expressos -------------------------------------------------------
  //
  // Vem antes das bicicletas porque leva parâmetros e tem de os validar ANTES
  // de tocar na fonte: isto é aberto a quem abre a página.
  if (caminho === '/expressos.json' || caminho === '/expressos') {
    if (!temExpressos) {
      responder(res, 501, { erro: 'os expressos não estão configurados neste serviço' });
      return;
    }
    const q = new URL(req.url || '/', 'http://local').searchParams;
    const pedido = { de: q.get('de'), para: q.get('para'), data: q.get('data') || undefined };
    const mau = pedidoInvalido(pedido);
    if (mau) {
      responder(res, 400, { erro: mau });
      return;
    }
    const r = await cacheX.obter(pedido);
    // UMA FALHA NÃO É UM ERRO PARA QUEM PERGUNTOU: devolve-se 200 com a lista
    // vazia e `falhou: true`, e a página fica com o horário planeado. Um 503
    // aqui punha uma mensagem de avaria à frente de quem só queria um horário.
    responder(res, 200, r, r.falhou ? 'no-store' : `public, max-age=${cfg.cacheS}`);
    return;
  }

  if (!temBicicletas) {
    responder(res, 501, { erro: 'as bicicletas não estão configuradas neste serviço' });
    return;
  }

  try {
    const dados = await cache.obter();
    const idade = Math.round((Date.now() - dados.gerado) / 1000);
    let corpo;
    if (caminho === '/gbfs.json') {
      corpo = descoberta(`http://${req.headers.host || ''}`, cfg.cacheS);
    } else if (caminho === '/station_status.json' || caminho === '/') {
      corpo = stationStatus(dados, cfg.cacheS);
    } else {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      // Não faz sentido pedir isto mais vezes do que a fonte muda.
      'cache-control': `public, max-age=${Math.max(0, cfg.cacheS - idade)}`,
    });
    res.end(JSON.stringify(corpo));
  } catch (e) {
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        erro: 'sem leitura da página de estações',
        detalhe: String(e?.message || e),
      }),
    );
  }
});

/** Uma resposta JSON, que é a única forma que isto tem. */
function responder(res, estado, corpo, cache = 'no-store') {
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cache,
  });
  res.end(JSON.stringify(corpo));
}

servidor.listen(PORTA, () => {
  const capacidades = [
    temBicicletas ? `bicicletas (cache ${cfg.cacheS}s)` : null,
    temExpressos ? `expressos (cache ${cfgX.cacheS}s)` : null,
  ].filter(Boolean);
  process.stdout.write(
    `a servir na porta ${PORTA} · ${capacidades.join(' · ')} · origem ${cfg.origem || '(mesma)'}\n`,
  );
});
