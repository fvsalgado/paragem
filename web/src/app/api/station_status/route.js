/**
 * A disponibilidade das bicicletas, servida ao lado do sítio.
 *
 * Vivia em `api/station_status.mjs`, na raiz do repositório, porque o sítio
 * era `output: 'export'` e um Next.js nesse modo não tem rotas de API. Deixou
 * de ser (CLAUDE.md §11.7), e a função entra para dentro do Next, onde a
 * plataforma a serve sem se copiar nada à mão — a cópia era o passo que, um
 * dia, deixou uma função escrita e testada a dar 404 em produção.
 *
 * É um INVÓLUCRO FINO: o trabalho está em `disponibilidade/nucleo.mjs`, na
 * raiz, partilhado com o contentor. Aqui só se responde a um pedido HTTP.
 * Está em JavaScript, como o núcleo que importa; os tipos do resto do sítio
 * não lhe tocam.
 *
 * **A cache é da rede, e é isso que a torna gentil.** Numa função não há
 * processo a viver entre pedidos — a instância aquece e arrefece. Por isso
 * quem guarda a resposta é a própria plataforma, pelo `s-maxage`: cem
 * visitantes no mesmo minuto são UMA leitura da página do operador, em vez
 * de cem. O `stale-while-revalidate` acrescenta que, se a leitura nova
 * demorar, ninguém fica à espera.
 */
import {
  configuracao,
  criarCache,
  faltaNaConfiguracao,
  stationStatus,
} from '../../../../../disponibilidade/nucleo.mjs';

export const dynamic = 'force-dynamic';

const cfg = configuracao(process.env);
const cache = criarCache(cfg);

/** CORS preso à origem declarada, nunca `*`. Sem origem, só a mesma origem lê. */
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

export async function GET() {
  // Uma função mal configurada tem de o DIZER, e não devolver uma lista vazia
  // que o sítio mostraria como «não há bicicletas».
  const falta = faltaNaConfiguracao(cfg);
  if (falta.length) {
    return Response.json(
      { erro: 'falta configuração', falta },
      { status: 500, headers: cabecalhos() },
    );
  }
  try {
    const dados = await cache.obter();
    const idade = Math.round((Date.now() - dados.gerado) / 1000);
    return Response.json(stationStatus(dados, cfg.cacheS), {
      headers: cabecalhos({
        'cache-control': `public, s-maxage=${Math.max(0, cfg.cacheS - idade)}, stale-while-revalidate=${cfg.cacheS * 2}`,
      }),
    });
  } catch (e) {
    // Sem leitura nenhuma não se inventa: 503, e o sítio mostra as estações
    // sem contagem, como quando o serviço não existe.
    return Response.json(
      { erro: 'sem leitura da página de estações', detalhe: String(e?.message || e) },
      { status: 503, headers: cabecalhos({ 'cache-control': 'no-store' }) },
    );
  }
}
