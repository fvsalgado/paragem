/**
 * Os expressos ao vivo, servidos ao lado do sítio.
 *
 * Irmão de `api/station_status/route.js`, e pelas mesmas razões: vivia fora
 * do Next porque o sítio era exportação estática, e entrou quando deixou de
 * ser (CLAUDE.md §11.7). O trabalho está em `disponibilidade/expressos.mjs`,
 * partilhado com o contentor; aqui só se responde a um pedido HTTP.
 *
 * **UM 200 COM LISTA VAZIA, E NÃO UM 503.** Quando a fonte não responde, quem
 * está a ver a página não tem avaria nenhuma: tem o horário planeado, que é o
 * que o sítio mostra sempre. Um 503 aqui punha uma mensagem de erro à frente
 * de quem só queria saber a que horas passa o autocarro. O `falhou: true` vai
 * na resposta para quem o quiser usar, e a resposta falhada não se guarda.
 */
import {
  configuracao,
  criarCache,
  faltaNaConfiguracao,
  pedidoInvalido,
} from '../../../../../disponibilidade/expressos.mjs';

export const dynamic = 'force-dynamic';

const cfg = configuracao(process.env);
const cache = criarCache(cfg);

function cabecalhos(extra = {}) {
  const h = { vary: 'origin', ...extra };
  if (cfg.origem) h['access-control-allow-origin'] = cfg.origem;
  return h;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: cabecalhos({ 'access-control-allow-methods': 'GET, OPTIONS' }),
  });
}

export async function GET(pedido) {
  const falta = faltaNaConfiguracao(cfg);
  if (falta.length) {
    return Response.json(
      { erro: 'os expressos não estão configurados', falta },
      { status: 501, headers: cabecalhos({ 'cache-control': 'no-store' }) },
    );
  }

  // VALIDA ANTES DE TOCAR NA FONTE. Isto é aberto a quem abre a página; sem
  // isto, qualquer pessoa o mandava buscar o que quisesse ao operador.
  const q = new URL(pedido.url).searchParams;
  const consulta = {
    de: q.get('de') ?? undefined,
    para: q.get('para') ?? undefined,
    data: q.get('data') || undefined,
  };
  const mau = pedidoInvalido(consulta);
  if (mau) {
    return Response.json(
      { erro: mau },
      { status: 400, headers: cabecalhos({ 'cache-control': 'no-store' }) },
    );
  }

  const r = await cache.obter(consulta);
  // A cache da rede é o que torna isto gentil: cem visitantes no mesmo par e
  // no mesmo minuto são UMA pergunta ao operador, em vez de cem.
  return Response.json(r, {
    headers: cabecalhos({
      'cache-control': r.falhou
        ? 'no-store'
        : `public, s-maxage=${cfg.cacheS}, stale-while-revalidate=${cfg.cacheS}`,
    }),
  });
}
