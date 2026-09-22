/**
 * Serve `build/` com a FORMA DO ARMAZÉM, para o sítio se testar sem rede.
 *
 * Em produção o sítio lê `<armazém>/<regiao>/<ficheiro>` da porta pública do
 * balde `sitio`, onde o `pipeline publicar` põe `build/<regiao>/sitio/**` e os
 * mosaicos. Isto serve a mesma coisa, da pasta `build/`, com a mesma forma:
 *
 *     /<regiao>/inventario.json   → calculado daqui, como o pipeline o faria
 *     /<regiao>/regiao.pmtiles    → build/<regiao>/mosaicos/regiao.pmtiles
 *     /<regiao>/<o resto>         → build/<regiao>/sitio/<o resto>
 *
 * É a razão de haver UM caminho de código para ler dados, e não dois: o que
 * o CI testa contra isto é o que a produção faz contra o armazém. Um leitor
 * de disco «só para os testes» era o que divergia sem ninguém dar por isso.
 *
 * Responde a intervalos de bytes (`Range`), porque o mapa lê os mosaicos aos
 * pedaços, e abre a origem a toda a gente (`*`), como a porta pública do
 * balde faz — o navegador dos testes está noutra porta.
 *
 *     node scripts/servir-dados.mjs [pasta=../build] [porta=4322]
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(process.argv[2] ?? path.join(process.cwd(), '..', 'build'));
const PORTA = Number(process.argv[3] ?? 4322);

const TIPOS = {
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.pmtiles': 'application/vnd.pmtiles',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
  '.pdf': 'application/pdf',
};

const regioes = () =>
  existsSync(RAIZ)
    ? readdirSync(RAIZ, { withFileTypes: true })
        .filter(
          (e) => e.isDirectory() && existsSync(path.join(RAIZ, e.name, 'sitio', 'regiao.json')),
        )
        .map((e) => e.name)
        .sort()
    : [];

function* ficheirosDe(pasta, prefixo = '') {
  for (const e of readdirSync(pasta, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relativo = prefixo ? `${prefixo}/${e.name}` : e.name;
    if (e.isDirectory()) yield* ficheirosDe(path.join(pasta, e.name), relativo);
    else yield [relativo, path.join(pasta, e.name)];
  }
}

/** O inventário como o `pipeline publicar` o escreve, menos o MD5 — não faz falta aqui. */
function inventario(regiao) {
  const ficheiros = {};
  for (const [relativo, absoluto] of ficheirosDe(path.join(RAIZ, regiao, 'sitio'))) {
    ficheiros[relativo] = { bytes: statSync(absoluto).size };
  }
  const mosaicos = path.join(RAIZ, regiao, 'mosaicos', 'regiao.pmtiles');
  if (existsSync(mosaicos)) ficheiros['regiao.pmtiles'] = { bytes: statSync(mosaicos).size };
  return { regiao, publicado_em: new Date().toISOString(), ficheiros };
}

function ondeEsta(regiao, resto) {
  if (resto === 'regiao.pmtiles') return path.join(RAIZ, regiao, 'mosaicos', 'regiao.pmtiles');
  const absoluto = path.resolve(path.join(RAIZ, regiao, 'sitio'), resto);
  // Nunca sair da pasta da região: `..` no caminho fica fora.
  return absoluto.startsWith(path.join(RAIZ, regiao, 'sitio') + path.sep) ? absoluto : null;
}

const COMUNS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
  'accept-ranges': 'bytes',
  'cache-control': 'no-store',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const partes = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...COMUNS, 'access-control-allow-headers': 'range' });
    return res.end();
  }
  if (partes.length === 0) {
    res.writeHead(200, { ...COMUNS, 'content-type': 'text/plain; charset=utf-8' });
    return res.end(`dados de ${regioes().join(', ') || 'nenhuma região'} em ${RAIZ}\n`);
  }
  const [regiao, ...resto] = partes;
  if (!regioes().includes(regiao)) {
    res.writeHead(404, COMUNS);
    return res.end();
  }
  const relativo = resto.join('/');
  if (relativo === 'inventario.json') {
    res.writeHead(200, { ...COMUNS, 'content-type': TIPOS['.json'] });
    return res.end(JSON.stringify(inventario(regiao)));
  }
  const absoluto = ondeEsta(regiao, relativo);
  if (!absoluto || !existsSync(absoluto) || !statSync(absoluto).isFile()) {
    res.writeHead(404, COMUNS);
    return res.end();
  }
  const tamanho = statSync(absoluto).size;
  const tipo = TIPOS[path.extname(absoluto)] ?? 'application/octet-stream';
  const intervalo = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (intervalo && tamanho > 0) {
    const inicio =
      intervalo[1] === '' ? Math.max(0, tamanho - Number(intervalo[2])) : Number(intervalo[1]);
    const fim =
      intervalo[1] === '' || intervalo[2] === ''
        ? tamanho - 1
        : Math.min(Number(intervalo[2]), tamanho - 1);
    if (inicio > fim || inicio >= tamanho) {
      res.writeHead(416, { ...COMUNS, 'content-range': `bytes */${tamanho}` });
      return res.end();
    }
    res.writeHead(206, {
      ...COMUNS,
      'content-type': tipo,
      'content-length': fim - inicio + 1,
      'content-range': `bytes ${inicio}-${fim}/${tamanho}`,
    });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(absoluto, { start: inicio, end: fim }).pipe(res);
  }
  res.writeHead(200, { ...COMUNS, 'content-type': tipo, 'content-length': tamanho });
  if (req.method === 'HEAD') return res.end();
  createReadStream(absoluto).pipe(res);
}).listen(PORTA, '127.0.0.1', () => {
  console.log(
    `dados: ${regioes().join(', ') || 'nenhuma região'} de ${RAIZ} em http://127.0.0.1:${PORTA}`,
  );
});
