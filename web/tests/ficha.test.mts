/**
 * A ficha de uma região, nas duas decisões que tiram um sítio do ar por
 * engano: a confirmação pelo nome (P4-011) e o endereço novo que ainda não
 * responde (P4-013).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmacaoBate, dominioPublico, verificarEndereco } from '../src/lib/painel/ficha.ts';

test('a confirmação pede a região, e não a ortografia', () => {
  assert.equal(confirmacaoBate('Baixo Sável', 'Baixo Sável'), true);
  assert.equal(confirmacaoBate('  baixo   savel ', 'Baixo Sável'), true);
  assert.equal(confirmacaoBate('Serra da Pedra Alta', 'Baixo Sável'), false);
  assert.equal(confirmacaoBate('', 'Baixo Sável'), false);
  assert.equal(confirmacaoBate('Baixo', 'Baixo Sável'), false);
});

test('só se pergunta a domínios da rede pública — nunca à casa por dentro', () => {
  assert.equal(dominioPublico('transportes.exemplo.pt'), true);
  assert.equal(dominioPublico('localhost'), false);
  assert.equal(dominioPublico('prova.localhost'), false);
  assert.equal(dominioPublico('127.0.0.1'), false);
  assert.equal(dominioPublico('169.254.169.254'), false);
  assert.equal(dominioPublico('servidor.internal'), false);
  assert.equal(dominioPublico('sem-ponto'), false);
});

/** Um `fetch` a fingir, que responde o que se lhe disser. */
function resposta(status: number, location?: string): typeof fetch {
  return (async () =>
    new Response(null, {
      status,
      headers: location ? { location } : {},
    })) as unknown as typeof fetch;
}

test('o endereço novo responde a levar a esta região: pode mudar-se', async () => {
  const v = await verificarEndereco(
    'transportes.exemplo.pt',
    'serra.paragem.pt',
    resposta(308, 'https://serra.paragem.pt/'),
  );
  assert.deepEqual(v, { ok: true });
});

test('o endereço novo não responde: não se muda, e diz-se o que falta', async () => {
  const falha = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  const v = await verificarEndereco('transportes.exemplo.pt', 'serra.paragem.pt', falha);
  assert.equal(v.ok, false);
  assert.match(v.ok ? '' : v.porque, /ainda não responde — falta o DNS/);
});

test('responde, mas a outra coisa: também não', async () => {
  const outra = await verificarEndereco(
    'transportes.exemplo.pt',
    'serra.paragem.pt',
    resposta(308, 'https://outra.paragem.pt/'),
  );
  assert.equal(outra.ok, false);
  assert.match(outra.ok ? '' : outra.porque, /leva a outra\.paragem\.pt/);
  // Um 200 é a página do produto: o domínio chega à plataforma, e o mapa de
  // domínios ainda não o conhece.
  const produto = await verificarEndereco(
    'transportes.exemplo.pt',
    'serra.paragem.pt',
    resposta(200),
  );
  assert.equal(produto.ok, false);
  assert.match(produto.ok ? '' : produto.porque, /cinco minutos/);
});

test('um endereço que não é da rede pública nem se pergunta', async () => {
  let perguntou = false;
  const espiao = (async () => {
    perguntou = true;
    return new Response(null, { status: 308 });
  }) as unknown as typeof fetch;
  const v = await verificarEndereco('127.0.0.1', 'serra.paragem.pt', espiao);
  assert.equal(v.ok, false);
  assert.equal(perguntou, false);
});

test('a região numa frase leva o artigo que declara, e só esse', async () => {
  const { naFrase } = await import('../src/lib/painel/ficha.ts');
  const serra = naFrase({ name: 'Serra da Pedra Alta', article: 'a' });
  assert.equal(serra.com, 'a Serra da Pedra Alta');
  assert.equal(serra.de, 'da Serra da Pedra Alta');
  assert.equal(serra.Com, 'A Serra da Pedra Alta');
  const savel = naFrase({ name: 'Baixo Sável', article: 'o' });
  assert.equal(savel.de, 'do Baixo Sável');
  // E CONCORDA: «o Baixo Sável está desligado», e não «desligada».
  assert.equal(
    `${savel.Com} ${savel.esta} ${savel.adj('desligad')}`,
    'O Baixo Sável está desligado',
  );
  const terras = naFrase({ name: 'Terras do Ameno', article: 'as' });
  assert.equal(
    `${terras.Com} ${terras.esta} ${terras.adj('ligad')}`,
    'As Terras do Ameno estão ligadas',
  );
  // Sem artigo conhecido, não se inventa um.
  assert.equal(naFrase({ name: 'Lugar', article: '' }).com, 'Lugar');
});
