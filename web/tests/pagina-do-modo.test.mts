/** O que a página de um modo decide antes de desenhar (`lib/pagina-do-modo.ts`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percursosSemHorario, regrasENotas } from '../src/lib/pagina-do-modo.ts';
import type { HorarioDeModo, PercursoDeModo } from '../src/lib/formato.ts';

const percurso = (nome: string, rede: string | null = 'TV'): PercursoDeModo => ({
  nome,
  rede,
  operador: 'Câmara',
  cor: null,
});
const horario = (nome: string) => ({ nome }) as HorarioDeModo;

test('um percurso que já tem horário na página não se lista outra vez', () => {
  const ps = [percurso('Linha Verde'), percurso('Linha Verde Express'), percurso('Linha Roxa')];
  // Com a rede à frente, ou sem ela; sem distinguir acentos nem maiúsculas.
  assert.deepEqual(
    percursosSemHorario(ps, [horario('TV — Linha Verde'), horario('linha verde express')]).map(
      (p) => p.nome,
    ),
    ['Linha Roxa'],
  );
  // Sem horários, ficam todos — é o que se sabe dessas linhas.
  assert.equal(percursosSemHorario(ps, []).length, 3);
  // Uma linha com o mesmo nome noutra rede é outra linha.
  assert.equal(
    percursosSemHorario([percurso('Linha Verde', 'XY')], [horario('TV — Linha Verde')]).length,
    1,
  );
});

test('as notas numeradas de um cartaz separam-se das regras da linha', () => {
  assert.deepEqual(
    regrasENotas([
      'Sábados até às 13:58',
      '(1) Realiza-se apenas no período escolar',
      ' (2) Termina na estação',
    ]),
    {
      regras: ['Sábados até às 13:58'],
      notas: ['(1) Realiza-se apenas no período escolar', ' (2) Termina na estação'],
    },
  );
});
