import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataPorExtenso, estadoDaLicenca } from '../src/lib/painel/licencas.ts';

const HOJE = '2026-09-22';

test('sem licença, diz-o sem alarme', () => {
  assert.deepEqual(estadoDaLicenca([], HOJE), { texto: 'Sem licença registada.', alerta: false });
});

test('uma licença sem prazo não alarma', () => {
  const estado = estadoDaLicenca([{ starts_on: '2026-01-01', ends_on: null, kind: 'demo' }], HOJE);
  assert.equal(estado.alerta, false);
  assert.match(estado.texto, /sem prazo, desde 01\/01\/2026/);
});

test('a 30 dias do fim acende; a 31 ainda não', () => {
  const aTrinta = estadoDaLicenca(
    [{ starts_on: '2026-01-01', ends_on: '2026-10-22', kind: 'contrato' }],
    HOJE,
  );
  assert.equal(aTrinta.alerta, true);
  assert.match(aTrinta.texto, /faltam 30 dias/);
  const aTrintaEUm = estadoDaLicenca(
    [{ starts_on: '2026-01-01', ends_on: '2026-10-23', kind: 'contrato' }],
    HOJE,
  );
  assert.equal(aTrintaEUm.alerta, false);
});

test('expirada fica em alarme, e diz desde quando', () => {
  const estado = estadoDaLicenca(
    [{ starts_on: '2025-01-01', ends_on: '2026-09-01', kind: 'piloto' }],
    HOJE,
  );
  assert.equal(estado.alerta, true);
  assert.match(estado.texto, /expirada desde 01\/09\/2026/);
});

test('a mais recente manda no estado', () => {
  const estado = estadoDaLicenca(
    [
      { starts_on: '2026-09-01', ends_on: '2027-08-31', kind: 'contrato' },
      { starts_on: '2025-09-01', ends_on: '2026-08-31', kind: 'piloto' },
    ],
    HOJE,
  );
  assert.equal(estado.alerta, false);
  assert.match(estado.texto, /«contrato»/);
});

test('as datas escrevem-se como cá se escrevem', () => {
  assert.equal(dataPorExtenso('2026-09-22'), '22/09/2026');
  assert.equal(dataPorExtenso('2026-09-22T10:00:00Z'), '22/09/2026');
});
