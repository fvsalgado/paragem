/**
 * Os contactos da declaração de acessibilidade e da privacidade (P4-024): o
 * que a página diz de quem responde pelos dados, com o artigo certo — e
 * «Por preencher» quando não se sabe, sem inventar.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  lerContactos,
  responsavelNaFrase,
  telefoneParaMarcar,
  type Contactos,
} from '../src/lib/contactos.ts';

const AUTORIDADE = 'a Comunidade Intermunicipal da Serra da Pedra Alta';

test('a autoridade leva o artigo que a região declara, já feito', () => {
  const c = { responsavel: 'autoridade', responsavel_nome: null, responsavel_artigo: '' } as const;
  assert.equal(responsavelNaFrase(c, AUTORIDADE), AUTORIDADE);
});

test('outra entidade leva o artigo escolhido, e sem ele vai sozinha', () => {
  assert.equal(
    responsavelNaFrase(
      {
        responsavel: 'outra',
        responsavel_nome: 'Transportes do Vale, S.A.',
        responsavel_artigo: 'a',
      },
      AUTORIDADE,
    ),
    'a Transportes do Vale, S.A.',
  );
  assert.equal(
    responsavelNaFrase(
      { responsavel: 'outra', responsavel_nome: 'Vale Digital, Lda.', responsavel_artigo: '' },
      AUTORIDADE,
    ),
    'Vale Digital, Lda.',
  );
});

test('sem declaração, não há frase — e a página diz «Por preencher»', () => {
  assert.equal(responsavelNaFrase(null, AUTORIDADE), null);
  assert.equal(
    responsavelNaFrase(
      { responsavel: 'por-preencher', responsavel_nome: null, responsavel_artigo: '' },
      AUTORIDADE,
    ),
    null,
  );
});

test('o telefone marca-se sem espaços', () => {
  assert.equal(telefoneParaMarcar('+351 800 000 000'), '+351800000000');
});

test('lê com a chave pública; sem base, sem tabela ou sem linha, não sabe', async () => {
  const linha: Contactos = {
    region_id: 'prova',
    acessibilidade_email: 'acessibilidade@exemplo.pt',
    acessibilidade_telefone: null,
    reclamacao_url: null,
    responsavel: 'autoridade',
    responsavel_nome: null,
    responsavel_artigo: '',
    privacidade_email: null,
    updated_at: '2026-10-02T12:00:00Z',
  };
  let pedido = '';
  let cabecalhos: Record<string, string> = {};
  const responde = (status: number, corpo: unknown) =>
    (async (url: string, init: RequestInit) => {
      pedido = url;
      cabecalhos = init.headers as Record<string, string>;
      return new Response(JSON.stringify(corpo), { status });
    }) as unknown as typeof fetch;

  const c = await lerContactos('prova', responde(200, [linha]), 'http://base', 'publica');
  assert.equal(c?.acessibilidade_email, 'acessibilidade@exemplo.pt');
  assert.match(pedido, /\/rest\/v1\/region_contactos\?select=\*&region_id=eq\.prova/);
  assert.equal(cabecalhos.apikey, 'publica');
  assert.equal('authorization' in cabecalhos, false);

  assert.equal(await lerContactos('prova', responde(200, []), 'http://base', 'k'), null);
  // A migração por aplicar: o PostgREST responde 404, e a página diz «Por preencher».
  assert.equal(
    await lerContactos('prova', responde(404, { code: 'PGRST205' }), 'http://base', 'k'),
    null,
  );
  assert.equal(await lerContactos('prova', responde(200, [linha]), undefined, 'k'), null);
  assert.equal(await lerContactos('../x', responde(200, [linha]), 'http://base', 'k'), null);
});
