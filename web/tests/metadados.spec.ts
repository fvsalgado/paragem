/**
 * O QUE UMA LIGAÇÃO PARTILHADA MOSTRA.
 *
 * Nenhuma página tinha `og:*` nem `twitter:card`, e a descrição era a mesma
 * em todas as páginas de uma região (P3-003): «manda-me o horário da
 * paragem» chegava ao WhatsApp sem imagem e sem dizer de que paragem era.
 *
 * Lê-se o HTML tal como sai do servidor, e não a página depois de o navegador
 * a arrumar: os robôs das pré-visualizações não correm JavaScript, e só leem
 * o `<head>`.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { PORTA, PRODUTO, REGIAO, anfitriao } from './anfitrioes';
import { linhaComMaisViagens, paragemComMaisPartidas } from './dados-da-regiao';

/** O `<head>` de uma página, tal como o servidor o manda, pelo anfitrião pedido. */
async function cabeca(request: APIRequestContext, host: string | null, caminho: string) {
  const r = await request.get(`http://127.0.0.1:${PORTA}${caminho}`, {
    headers: host ? { host: `${host}:${PORTA}` } : {},
  });
  expect(r.status(), `${host ?? 'produto'} ${caminho}`).toBe(200);
  const html = await r.text();
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = (nome: string) => {
    const bruto = head.match(
      new RegExp(`<meta (?:property|name)="${nome}" content="([^"]*)"`),
    )?.[1];
    if (bruto === undefined) return null;
    return bruto
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  };
  const canonica = head.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;
  return { meta, canonica };
}

test('a página do produto leva o cartão inteiro, com a imagem de partilha', async ({ request }) => {
  const { meta, canonica } = await cabeca(request, null, '/');
  expect(meta('og:title')).toMatch(/^Paragem\.pt/);
  expect(meta('og:description')).toMatch(/comunidades intermunicipais/);
  expect(meta('og:locale')).toBe('pt_PT');
  expect(meta('og:type')).toBe('website');
  expect(meta('twitter:card')).toBe('summary_large_image');
  expect(canonica).toBe(`${PRODUTO}/`);
  const imagem = meta('og:image');
  expect(imagem).toBe(`${PRODUTO}/produto/partilha.png`);
  expect(meta('og:image:width')).toBe('1200');
  expect(meta('og:image:height')).toBe('630');
  const r = await request.get(imagem!);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toBe('image/png');
});

test('cada página de uma região diz o que é e de onde, no domínio dela', async ({ request }) => {
  const id = REGIAO;
  const host = `${id}.localhost`;
  const paragem = paragemComMaisPartidas();
  const linha = linhaComMaisViagens();
  const descricoes = new Set<string>();
  for (const caminho of [
    '/',
    '/rede/',
    `/rede/paragens/${paragem.id}/`,
    `/rede/linhas/${linha.id}/`,
    '/rede/tarifario/',
  ]) {
    const { meta, canonica } = await cabeca(request, host, caminho);
    // O título do cartão leva o nome da região, e não a marca do produto.
    expect(meta('og:title'), caminho).not.toMatch(/Paragem\.pt/);
    expect(meta('og:site_name'), caminho).toMatch(/· Paragem\.pt$/);
    expect(canonica, caminho).toBe(`${anfitriao(id)}${caminho}`);
    // A imagem é a do produto, servida pelo domínio da região.
    expect(meta('og:image'), caminho).toBe(`${anfitriao(id)}/produto/partilha.png`);
    expect(meta('twitter:card'), caminho).toBe('summary_large_image');
    descricoes.add(meta('description') ?? '');
  }
  // Uma descrição por página — era a mesma em todas.
  expect(descricoes.size).toBe(5);
});

test('a paragem diz de que paragem é o horário, e a linha quantas viagens tem', async ({
  request,
}) => {
  const host = `${REGIAO}.localhost`;
  const paragem = paragemComMaisPartidas();
  const p = await cabeca(request, host, `/rede/paragens/${paragem.id}/`);
  expect(p.meta('og:description')).toContain(`Horário planeado da paragem ${paragem.nome}`);
  const linha = linhaComMaisViagens();
  const l = await cabeca(request, host, `/rede/linhas/${linha.id}/`);
  expect(l.meta('og:description')).toMatch(/viage(m|ns) no horário/);
});
