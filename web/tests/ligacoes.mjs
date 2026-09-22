/**
 * SEGUE TODAS AS LIGAÇÕES INTERNAS DO SÍTIO A CORRER — anfitrião a anfitrião.
 *
 * Existe por causa de um erro caro. Ao mudar o catálogo para `/rede/`, as
 * ligações ficaram a apontar para onde ele estava, e **4 834 dos 4 854
 * destinos do sítio passaram a dar 404** — em produção, durante um dia, sem
 * um único teste a queixar-se. Os testes de acessibilidade visitavam dez
 * páginas e nenhuma ligação; o Lighthouse mede a página onde está; o `tsc`
 * não sabe o que é uma rota.
 *
 * É um RASTREIO: parte da raiz de cada anfitrião, pede cada página ao sítio a
 * correr, tira-lhe as ligações para dentro, e segue-as todas. Cada região
 * vive no seu domínio (CLAUDE.md §11.7), por isso rastreia-se cada anfitrião
 * por si — e o produto, que responde ao anfitrião que não é de ninguém. As
 * ligações para OUTRA origem não se seguem: não são deste anfitrião, e o
 * dele é que se está a provar.
 *
 * O pedido leva o `Host` à mão (`node:http`), porque `*.localhost` resolve no
 * navegador e não necessariamente no Node.
 *
 *     node tests/ligacoes.mjs [origem] [anfitrião…]
 *     node tests/ligacoes.mjs http://127.0.0.1:4321 prova.localhost prova-municipio.localhost
 */
import { request } from 'node:http';

const [origemBruta = process.env.PARAGEM_URL ?? 'http://127.0.0.1:4321', ...anfitrioes] =
  process.argv.slice(2);
const origem = new URL(origemBruta);
const PARALELO = Number(process.env.PARAGEM_RASTREIO_PARALELO ?? 12);

function interna(bruto) {
  // Só as ligações para dentro. O resto não é nosso para garantir.
  if (!bruto.startsWith('/') || bruto.startsWith('//')) return null;
  const alvo = bruto.split('#')[0].split('?')[0];
  if (!alvo) return null;
  // O `_next` é código, não páginas; os glifos não têm ligações.
  if (/^\/(_next|glifos)\//.test(alvo)) return null;
  return alvo;
}

/** Um GET a `origem`, com o `Host` pedido; devolve estado, tipo, corpo e destino. */
function pedir(host, caminho) {
  return new Promise((resolver, rejeitar) => {
    const r = request(
      {
        host: origem.hostname,
        port: origem.port || 80,
        path: caminho,
        method: 'GET',
        headers: {
          host: host ? `${host}:${origem.port || 80}` : origem.host,
          accept: 'text/html,*/*',
        },
      },
      (res) => {
        const pedacos = [];
        res.on('data', (p) => pedacos.push(p));
        res.on('end', () =>
          resolver({
            estado: res.statusCode ?? 0,
            tipo: res.headers['content-type'] ?? '',
            destino: res.headers.location ?? '',
            corpo: Buffer.concat(pedacos).toString('utf8'),
          }),
        );
      },
    );
    r.on('error', rejeitar);
    r.end();
  });
}

async function rastrear(host) {
  const rotulo = host ?? `${origem.host} (a montra)`;
  const porVisitar = ['/'];
  const vistos = new Set(['/']);
  const onde = new Map();
  const partidas = [];
  let paginas = 0;

  async function visitar(alvo) {
    let r;
    try {
      r = await pedir(host, alvo);
    } catch (e) {
      partidas.push([alvo, `sem resposta: ${e.message}`]);
      return;
    }
    if (r.estado >= 300 && r.estado < 400) {
      // Um redirecionamento para dentro segue-se; para outra origem não é nosso.
      let destino = null;
      try {
        const u = new URL(r.destino, `http://${host ?? origem.host}`);
        if (
          u.host === (host ? `${host}:${origem.port || 80}` : origem.host) ||
          u.hostname === host
        ) {
          destino = interna(u.pathname);
        }
      } catch {
        /* um destino que não é endereço: ignora-se */
      }
      if (destino && !vistos.has(destino)) {
        vistos.add(destino);
        porVisitar.push(destino);
      }
      return;
    }
    if (r.estado !== 200) {
      partidas.push([alvo, `HTTP ${r.estado}`]);
      return;
    }
    if (!r.tipo.includes('text/html')) return;
    paginas += 1;
    for (const m of r.corpo.matchAll(/href="([^"]+)"/g)) {
      const destino = interna(m[1].replace(/&amp;/g, '&'));
      if (!destino) continue;
      const lista = onde.get(destino) ?? [];
      if (lista.length < 3) lista.push(alvo);
      onde.set(destino, lista);
      if (!vistos.has(destino)) {
        vistos.add(destino);
        porVisitar.push(destino);
      }
    }
  }

  const inicio = Date.now();
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      while (porVisitar.length) {
        const alvo = porVisitar.pop();
        if (alvo) await visitar(alvo);
      }
    }),
  );
  const segundos = ((Date.now() - inicio) / 1000).toFixed(0);
  console.log(`${rotulo}: ${paginas} páginas, ${vistos.size} destinos distintos, ${segundos} s.`);
  for (const [alvo, razao] of partidas.slice(0, 40)) {
    console.error(`  ${alvo} — ${razao}\n      em ${(onde.get(alvo) ?? ['(raiz)']).join(', ')}`);
  }
  if (partidas.length > 40) console.error(`  … e mais ${partidas.length - 40}.`);
  return { paginas, partidas: partidas.length };
}

let total = 0;
let partidas = 0;
for (const host of [null, ...anfitrioes]) {
  const r = await rastrear(host);
  total += r.paginas;
  partidas += r.partidas;
}
if (partidas === 0) {
  console.log(`Nenhuma ligação interna partida em ${total} páginas.`);
  process.exit(0);
}
console.error(`\n${partidas} destinos NÃO RESPONDEM.`);
process.exit(1);
