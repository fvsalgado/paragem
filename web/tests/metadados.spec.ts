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
 *
 * A IMAGEM É DE QUEM É A PÁGINA (P4-008): a do produto na página do produto,
 * e numa região o cartão dela — nos tons do feixe dela, sem o vermelho do
 * produto —, com um cartão próprio na paragem e na linha.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { PORTA, PRODUTO, REGIAO, anfitriao, regioes } from './anfitrioes';
import {
  corDaMarca,
  linhaComMaisViagens,
  paragemComMaisPartidas,
  temModoLigado,
} from './dados-da-regiao';
import { seguro } from '../src/lib/formato.ts';
import { feixeDaRegiao } from '../src/lib/marca.ts';

/**
 * Um pedido pelo anfitrião de uma região, feito ao endereço local com o
 * `Host` dela: fora do navegador, os `*.localhost` resolvem no DNS da máquina,
 * e numa caixa sem `systemd-resolved` não resolvem (`playwright.config.ts`).
 */
function pedir(
  request: APIRequestContext,
  host: string | null,
  caminho: string,
  opcoes: { maxRedirects?: number } = {},
) {
  return request.get(`http://127.0.0.1:${PORTA}${caminho}`, {
    ...opcoes,
    headers: host ? { host: `${host}:${PORTA}` } : {},
  });
}

/** O `<head>` de uma página, tal como o servidor o manda, pelo anfitrião pedido. */
async function cabeca(request: APIRequestContext, host: string | null, caminho: string) {
  const r = await pedir(request, host, caminho);
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
  const daRegiao = `${anfitriao(id)}/cartao.png`;
  for (const [caminho, imagem] of [
    ['/', daRegiao],
    ['/rede/', daRegiao],
    [`/rede/paragens/${paragem.id}/`, `${anfitriao(id)}/cartao/paragens/${seguro(paragem.id)}.png`],
    [`/rede/linhas/${linha.id}/`, `${anfitriao(id)}/cartao/linhas/${seguro(linha.id)}.png`],
    ['/rede/tarifario/', daRegiao],
  ]) {
    const { meta, canonica } = await cabeca(request, host, caminho);
    // O título do cartão leva o nome da região, e não a marca do produto.
    expect(meta('og:title'), caminho).not.toMatch(/Paragem\.pt/);
    expect(meta('og:site_name'), caminho).toMatch(/· Paragem\.pt$/);
    expect(canonica, caminho).toBe(`${anfitriao(id)}${caminho}`);
    // A imagem é o cartão da região — ou o da paragem, ou o da linha —,
    // servido pelo domínio dela. A do produto não entra.
    expect(meta('og:image'), caminho).toBe(imagem);
    expect(meta('og:image:width'), caminho).toBe('1200');
    expect(meta('og:image:height'), caminho).toBe('630');
    expect(meta('og:image:alt'), caminho).toBeTruthy();
    expect(meta('twitter:image'), caminho).toBe(imagem);
    expect(meta('twitter:card'), caminho).toBe('summary_large_image');
    descricoes.add(meta('description') ?? '');
  }
  // Uma descrição por página — era a mesma em todas.
  expect(descricoes.size).toBe(5);
});

/** A largura e a altura de um PNG, lidas do cabeçalho (`IHDR`), sem o descodificar. */
function medidaDoPng(corpo: Buffer): { largura: number; altura: number } {
  expect(corpo.subarray(0, 8).toString('hex'), 'assinatura do PNG').toBe('89504e470d0a1a0a');
  expect(corpo.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) };
}

test('cada região responde o seu cartão, o da paragem e o da linha: 1200 × 630, e não para sempre', async ({
  request,
}) => {
  const corpos = new Set<string>();
  for (const id of regioes()) {
    const caminhos = ['/cartao.png'];
    if (temModoLigado('autocarro', id)) {
      caminhos.push(
        `/cartao/paragens/${seguro(paragemComMaisPartidas(id).id)}.png`,
        `/cartao/linhas/${seguro(linhaComMaisViagens(id).id)}.png`,
      );
    }
    for (const caminho of caminhos) {
      const r = await pedir(request, `${id}.localhost`, caminho);
      expect(r.status(), `${id} ${caminho}`).toBe(200);
      expect(r.headers()['content-type'], `${id} ${caminho}`).toBe('image/png');
      // Muda com os dados: o `immutable` por um ano do desenhador não serve.
      expect(r.headers()['cache-control'] ?? '', `${id} ${caminho}`).not.toMatch(/immutable/);
      const corpo = await r.body();
      expect(medidaDoPng(corpo), `${id} ${caminho}`).toEqual({ largura: 1200, altura: 630 });
      corpos.add(corpo.toString('base64'));
    }
  }
  // Nenhum cartão sai igual a outro: cada um diz de que região, paragem ou linha é.
  expect(corpos.size).toBe(
    regioes().reduce((n, id) => n + (temModoLigado('autocarro', id) ? 3 : 1), 0),
  );
});

test('um cartão do que não existe dá 404, e o anfitrião do produto não tem cartão de região', async ({
  request,
}) => {
  for (const caminho of [
    '/cartao/paragens/nao-existe.png',
    '/cartao/linhas/nao-existe.png',
    // Só `<id>.png`: uma paragem que existe, pedida com outra extensão, não.
    `/cartao/paragens/${seguro(paragemComMaisPartidas().id)}.jpg`,
  ]) {
    const r = await pedir(request, `${REGIAO}.localhost`, caminho, { maxRedirects: 0 });
    expect(r.status(), caminho).toBe(404);
  }
  const r = await pedir(request, null, '/cartao.png');
  expect(r.status()).toBe(404);
});

const VERMELHOS_DO_PRODUTO = ['#c2281c', '#f2573f'];

test('o cartão de uma região leva os tons do feixe dela sobre o papel, e nem um píxel do vermelho do produto', async ({
  page,
}) => {
  for (const id of regioes()) {
    await page.goto(`${anfitriao(id)}/cartao.png`);
    const tons = feixeDaRegiao(corDaMarca(id)).claro;
    // Pinta-se a imagem numa tela, no mesmo domínio, e lê-se píxel a píxel.
    const { canto, contagens } = await page.evaluate(
      async (alvos) => {
        const img = document.querySelector('img')!;
        await img.decode();
        const tela = document.createElement('canvas');
        tela.width = img.naturalWidth;
        tela.height = img.naturalHeight;
        const ctx = tela.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
        const rgb = alvos.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
        const contagens = alvos.map(() => 0);
        for (let i = 0; i < data.length; i += 4) {
          rgb.forEach(([r, g, b], k) => {
            if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 24)
              contagens[k]++;
          });
        }
        const hex = (i: number) =>
          '#' + [0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, '0')).join('');
        return { canto: hex((8 * tela.width + 8) * 4), contagens };
      },
      [...tons, ...VERMELHOS_DO_PRODUTO],
    );
    // O papel do sítio, como o cabeçalho: o logótipo só se vê a cores sobre claro.
    expect(canto, id).toBe('#f5f7f4');
    // Os três tons da região, cada um pelo menos numa régua de ponta a ponta
    // (1200 × 7 píxeis), e o logótipo por cima.
    tons.forEach((tom, k) => {
      expect(contagens[k], `${id}: ${tom}`).toBeGreaterThan(1200 * 7 * 0.9);
    });
    expect(contagens.slice(3), id).toEqual([0, 0]);
  }
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
