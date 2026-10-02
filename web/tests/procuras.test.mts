/**
 * O relatório das procuras sem resposta (P4-030), na parte que não precisa da
 * medição: as consultas que se lhe mandam e o que se lê do que ela responde.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  consultaDasProcuras,
  consultaDosTotais,
  daRegiao,
  lerProcuras,
  lerTotais,
  literal,
  oQueFalta,
} from '../src/lib/painel/procuras-puro.ts';

test('a consulta é desta região — pelo identificador e pelos domínios dela', () => {
  const q = consultaDasProcuras('prova', ['prova.paragem.pt', 'www.prova.paragem.pt'], 90);
  assert.match(q, /event = 'viagem_sem_resposta'/);
  assert.match(q, /properties\.regiao = 'prova'/);
  assert.match(q, /properties\.\$host IN \('prova\.paragem\.pt', 'www\.prova\.paragem\.pt'\)/);
  assert.match(q, /INTERVAL 90 DAY/);
  assert.match(q, /GROUP BY ligacao/);
  // Agregado: nada que identifique quem procurou.
  assert.doesNotMatch(q, /distinct_id|person|\$ip/);
  assert.match(consultaDosTotais('prova', [], 30), /countIf\(event = 'viagem_procurada'\)/);
  assert.equal(daRegiao('prova', []), "(properties.regiao = 'prova')");
});

test('uma aspa no meio não abre a consulta', () => {
  assert.equal(literal("o'neil"), "'o\\'neil'");
  assert.equal(literal('a\\b'), "'a\\\\b'");
});

test('lê as ligações da resposta, e deixa de fora o que não se lê', () => {
  const linhas = lerProcuras({
    results: [
      ['Covas do Vento → Porto Ameno', 12, '2026-09-30T08:10:00Z'],
      ['A minha localização → Almeão', '3', null],
      [null, 5, 'x'],
      ['', 2, 'x'],
      ['Sem vezes', 0, 'x'],
      'lixo',
    ],
  });
  assert.deepEqual(linhas, [
    { ligacao: 'Covas do Vento → Porto Ameno', vezes: 12, ultima: '2026-09-30T08:10:00Z' },
    { ligacao: 'A minha localização → Almeão', vezes: 3, ultima: null },
  ]);
  assert.deepEqual(lerProcuras({}), []);
  assert.deepEqual(lerTotais({ results: [[120, 7]] }), { procuradas: 120, semResposta: 7 });
  assert.equal(lerTotais({ results: [] }), null);
});

test('sem as duas variáveis, diz quais faltam — e não pergunta nada', () => {
  assert.deepEqual(oQueFalta({}), ['POSTHOG_CHAVE_PESSOAL', 'POSTHOG_PROJETO']);
  assert.deepEqual(oQueFalta({ POSTHOG_CHAVE_PESSOAL: 'phx_x', POSTHOG_PROJETO: '1' }), []);
});
