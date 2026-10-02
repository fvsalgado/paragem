/**
 * As contas por pessoa do painel (0009), sem servidor nem base: quem pode o
 * quê, o limite de tentativas, como a chave vai em cada pedido, e as frases
 * que a base devolve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioDe, pode, regioesVisiveis, type Acesso } from '../src/lib/painel/papeis.ts';
import {
  verificarEntrada,
  contarFalhada,
  limparDepoisDeEntrar,
  type Chamar,
} from '../src/lib/painel/limite-puro.ts';
import {
  ErroDaBase,
  cabecalhosDaChave,
  dominioValido,
  ehEsquemaPorAplicar,
  normalizarDominio,
  traduzirErro,
} from '../src/lib/painel/base-pura.ts';
import { destinoSeguro, ehPublicaDoPainel } from '../src/lib/painel/guarda.ts';
import { limitesDoMes } from '../src/lib/painel/auditoria.ts';

const DONO: Acesso = { dono: true, papeis: {} };
const EDITORA_DA_A: Acesso = { dono: false, papeis: { a: 'editor' } };
const GESTORA: Acesso = { dono: false, papeis: { a: 'gestor', b: 'editor' } };

// --- os papéis ---------------------------------------------------------------

test('o dono pode tudo, em qualquer região', () => {
  assert.equal(pode(DONO, 'a', 'gestor'), true);
  assert.equal(pode(DONO, 'qualquer', 'editor'), true);
});

test('uma editora escreve os avisos da sua região, e mais nada', () => {
  assert.equal(pode(EDITORA_DA_A, 'a', 'editor'), true);
  assert.equal(pode(EDITORA_DA_A, 'a', 'gestor'), false);
  // A REGRA DESTE LOTE: uma pessoa da região A não mexe na B.
  assert.equal(pode(EDITORA_DA_A, 'b', 'editor'), false);
});

test('o gestor faz o que o editor faz, e só nas regiões onde o é', () => {
  assert.equal(pode(GESTORA, 'a', 'editor'), true);
  assert.equal(pode(GESTORA, 'a', 'gestor'), true);
  assert.equal(pode(GESTORA, 'b', 'gestor'), false);
  assert.equal(pode(GESTORA, 'c', 'editor'), false);
});

test('as listas filtram-se pelas regiões de cada um', () => {
  const regioes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(
    regioesVisiveis(DONO, regioes).map((r) => r.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    regioesVisiveis(GESTORA, regioes).map((r) => r.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    regioesVisiveis(GESTORA, regioes, 'gestor').map((r) => r.id),
    ['a'],
  );
  assert.deepEqual(
    regioesVisiveis(EDITORA_DA_A, regioes).map((r) => r.id),
    ['a'],
  );
});

test('quem entra vai para o que faz: a ficha a quem gere, os avisos a quem edita', () => {
  assert.equal(inicioDe(DONO), '/admin/');
  assert.equal(inicioDe(EDITORA_DA_A), '/admin/regioes/a/avisos/');
  assert.equal(inicioDe({ dono: false, papeis: { a: 'gestor' } }), '/admin/regioes/a/');
  // Com várias, a lista delas; sem nenhuma, a página que o diz.
  assert.equal(inicioDe(GESTORA), '/admin/');
  assert.equal(inicioDe({ dono: false, papeis: {} }), '/admin/');
});

// --- o limite de tentativas ----------------------------------------------------

/**
 * Uma base a fingir, com a semântica das três funções: `rate_limit_hit` conta
 * e diz se ainda cabe, `rate_limit_check` só lê, `rate_limit_clear` esquece.
 * Sem as duas novas (`semNovas`), responde como uma base sem a 0009.
 */
function baseAFingir(semNovas = false) {
  const contas = new Map<string, number>();
  const pedidos: string[] = [];
  const chamar: Chamar = async <T,>(funcao: string, args: Record<string, unknown>) => {
    pedidos.push(funcao);
    const balde = String(args.p_bucket);
    const limite = Number(args.p_limit);
    if (semNovas && funcao !== 'rate_limit_hit') {
      throw new ErroDaBase('Could not find the function', 404, 'PGRST202');
    }
    if (funcao === 'rate_limit_hit') {
      const n = (contas.get(balde) ?? 0) + 1;
      contas.set(balde, n);
      return [{ allowed: n <= limite, hits: n, reset_at: null }] as T;
    }
    if (funcao === 'rate_limit_check') {
      const n = contas.get(balde) ?? 0;
      return [{ allowed: n < limite, hits: n, reset_at: null }] as T;
    }
    contas.delete(balde);
    return null as T;
  };
  return { chamar, contas, pedidos };
}

async function tentar(
  base: ReturnType<typeof baseAFingir>,
  baldes: string[],
  certa: boolean,
): Promise<boolean> {
  const limite = await verificarEntrada(base.chamar, baldes, 900, 5);
  if (!limite.permitido) return false;
  if (certa) await limparDepoisDeEntrar(base.chamar, baldes, limite.modo);
  else await contarFalhada(base.chamar, baldes, limite.modo, 900, 5);
  return true;
}

test('entradas CERTAS não trancam ninguém — vinte seguidas da mesma origem', async () => {
  const base = baseAFingir();
  for (let i = 0; i < 20; i++) {
    assert.equal(await tentar(base, ['ip:x', 'email:ana'], true), true, `a ${i + 1}.ª entrou`);
  }
});

test('cinco falhadas trancam a origem, e o mesmo email de outra origem', async () => {
  const base = baseAFingir();
  for (let i = 0; i < 5; i++) await tentar(base, ['ip:x', 'email:ana'], false);
  assert.equal(await tentar(base, ['ip:x', 'email:outra'], true), false, 'a mesma origem');
  assert.equal(await tentar(base, ['ip:y', 'email:ana'], true), false, 'o mesmo email');
  assert.equal(
    await tentar(base, ['ip:y', 'email:outra'], true),
    true,
    'outra origem, outro email',
  );
});

test('uma entrada certa limpa a contagem da origem e do email com que entrou', async () => {
  const base = baseAFingir();
  for (let i = 0; i < 4; i++) await tentar(base, ['ip:x', 'email:ana'], false);
  await tentar(base, ['ip:x', 'email:ana'], true);
  assert.equal(base.contas.has('ip:x'), false);
  assert.equal(base.contas.has('email:ana'), false);
  // E volta a ter as cinco.
  for (let i = 0; i < 4; i++) await tentar(base, ['ip:x', 'email:ana'], false);
  assert.equal(await tentar(base, ['ip:x', 'email:ana'], true), true);
});

test('sem a migração 0009, conta como contava: todas, só pela origem', async () => {
  const base = baseAFingir(true);
  for (let i = 0; i < 5; i++) assert.equal(await tentar(base, ['ip:x', 'email:ana'], true), true);
  assert.equal(await tentar(base, ['ip:x', 'email:ana'], true), false);
  assert.ok(!base.pedidos.includes('rate_limit_clear'));
  assert.equal(base.contas.has('email:ana'), false, 'o balde do email não existia antes');
});

test('sem base, ou com o limitador em baixo, deixa passar', async () => {
  assert.equal((await verificarEntrada(null, ['ip:x'], 900, 5)).permitido, true);
  const emBaixo: Chamar = async () => {
    throw new ErroDaBase('fetch failed', 0);
  };
  assert.deepEqual(await verificarEntrada(emBaixo, ['ip:x'], 900, 5), {
    permitido: true,
    modo: 'sem-limite',
  });
});

// --- a chave em cada pedido ------------------------------------------------------

test('uma chave nova (sb_…) vai só no apikey; a antiga, um JWT, vai nos dois', () => {
  assert.deepEqual(cabecalhosDaChave('sb_secret_abc123'), { apikey: 'sb_secret_abc123' });
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura';
  assert.deepEqual(cabecalhosDaChave(jwt), { apikey: jwt, authorization: `Bearer ${jwt}` });
});

// --- o que a base diz ------------------------------------------------------------

test('uma tabela ou função que não existe é uma migração por aplicar, não uma avaria', () => {
  assert.equal(ehEsquemaPorAplicar(new ErroDaBase('x', 404, '42P01')), true);
  assert.equal(ehEsquemaPorAplicar(new ErroDaBase('x', 404, 'PGRST205')), true);
  assert.equal(ehEsquemaPorAplicar(new ErroDaBase('x', 404, 'PGRST202')), true);
  assert.equal(ehEsquemaPorAplicar(new ErroDaBase('x', 500, '42P01')), false);
  assert.equal(ehEsquemaPorAplicar(new ErroDaBase('x', 401, '42501')), false);
  assert.equal(ehEsquemaPorAplicar(new Error('x')), false);
});

test('a restrição de uma tabela chega em português, a dizer o que fazer (P4-012)', () => {
  const cru = new ErroDaBase(
    'new row for relation "region_domain_aliases" violates check constraint "region_domain_aliases_domain_check"',
    400,
    '23514',
  );
  const frase = traduzirErro(cru);
  assert.match(frase, /só o domínio/);
  assert.doesNotMatch(frase, /violates|constraint|relation/);
  // O que já vem em português passa tal e qual.
  const daFuncao = new ErroDaBase('não se desliga a última região ligada', 400, 'P0001');
  assert.equal(traduzirErro(daFuncao), 'não se desliga a última região ligada');
});

test('um domínio colado da barra do navegador fica só o domínio', () => {
  assert.equal(normalizarDominio('https://www.Exemplo.pt/horarios/'), 'www.exemplo.pt');
  assert.equal(normalizarDominio('  transportes.exemplo.pt:443 '), 'transportes.exemplo.pt');
  assert.equal(normalizarDominio('http://a.exemplo.pt/?x=1#y'), 'a.exemplo.pt');
  assert.equal(normalizarDominio('exemplo.pt.'), 'exemplo.pt');
  assert.equal(dominioValido('www.exemplo.pt'), true);
  assert.equal(dominioValido('sem-ponto'), false);
  assert.equal(dominioValido('com espaço.pt'), false);
  assert.equal(dominioValido('-hifen.pt'), false);
});

// --- as portas sem sessão ------------------------------------------------------------

test('a entrada e a ativação abrem-se sem sessão; o resto do painel não', () => {
  assert.equal(ehPublicaDoPainel('/admin/entrar/'), true);
  assert.equal(ehPublicaDoPainel('/admin/ativar/'), true);
  assert.equal(ehPublicaDoPainel('/admin/ativar'), true);
  assert.equal(ehPublicaDoPainel('/admin/pessoas/'), false);
  assert.equal(ehPublicaDoPainel('/admin/ativarx/'), false);
  // Depois de entrar não se volta a uma ligação já gasta.
  assert.equal(destinoSeguro('/admin/ativar/?t=abc'), '/admin/');
});

// --- o mês da auditoria ------------------------------------------------------------

test('o mês da auditoria conta-se na hora de Portugal, e não em UTC (P4-020)', () => {
  // Outubro de 2026 começa à meia-noite de Lisboa — 23h de 30 de setembro em
  // UTC, porque é verão — e acaba à meia-noite de 1 de novembro, já no inverno.
  assert.deepEqual(limitesDoMes('2026-10'), {
    desde: '2026-09-30T23:00:00.000Z',
    ate: '2026-11-01T00:00:00.000Z',
  });
  assert.deepEqual(limitesDoMes('2026-12'), {
    desde: '2026-12-01T00:00:00.000Z',
    ate: '2027-01-01T00:00:00.000Z',
  });
  assert.equal(limitesDoMes('2026-13'), null);
});
