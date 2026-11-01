/**
 * «Sair do concelho» — os destinos que as viagens deste concelho alcançam sem
 * mudar, e a que horas saem daqui (`lib/concelho.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porLocalidade, quantosNoConcelho, saidasDoConcelho } from '../src/lib/concelho.ts';
import type { LinhaDetalhe, ModoDetalhe, Paragem } from '../src/lib/formato.ts';

const paragem = (id: string, concelho: string | null, partidas = 1): Paragem => ({
  id,
  nome: id.toUpperCase(),
  ordem: id,
  lat: 0,
  lon: 0,
  concelho,
  linhas: [],
  partidas,
});

const PARAGENS = [
  paragem('c1', 'cima', 50),
  paragem('c2', 'cima'),
  paragem('m1', 'centro'),
  paragem('b1', 'baixo', 9),
  paragem('b2', 'baixo', 30),
  paragem('f1', null),
  paragem('f2', null),
];
const NOMES = new Map([
  ['cima', 'Cima'],
  ['centro', 'Centro'],
  ['baixo', 'Baixo'],
]);

function linha(id: string, sentidos: LinhaDetalhe['sentidos']): LinhaDetalhe {
  return {
    id,
    codigo: id,
    nome: id,
    ordem: id,
    cor: null,
    cor_texto: null,
    modo: 'autocarro',
    viagens: 1,
    sentidos,
  };
}

test('os destinos são os concelhos a que a viagem chega depois, com a hora de saída', () => {
  const ps = ['c1', 'c2', 'm1', 'b1'].map((id) => ({ id, nome: id.toUpperCase() }));
  const l = linha('L1', [
    {
      sentido: '0',
      variantes: 1,
      viagens: 2,
      viagens_deste_percurso: 2,
      paragens: ps,
      quadro: {
        paragens: ps,
        viagens: [
          {
            servico_id: 'f:A-U',
            servico_nome: 'Dias úteis',
            destino: 'B1',
            horas: ['07:00', '07:05', '07:30', '08:00'],
            estimadas: [],
          },
          // Começa já no segundo cais do concelho: sai daqui às 09:10.
          {
            servico_id: 'f:A-S',
            servico_nome: 'Sábados',
            destino: 'M1',
            horas: ['', '09:10', '09:40', ''],
            estimadas: [],
          },
        ],
      },
    },
  ]);
  const s = saidasDoConcelho('cima', [l], PARAGENS, NOMES);
  assert.deepEqual(
    s.map((x) => [x.nome, x.viagens]),
    [
      ['Centro', 2],
      ['Baixo', 1],
    ],
  );
  const baixo = s.find((x) => x.chave === 'baixo')!;
  assert.equal(baixo.para, 'B2', 'o «Como chegar» vai para a paragem com mais partidas de lá');
  assert.deepEqual(baixo.porDia, [{ dia: 'Dias úteis', horas: ['07:00'] }]);
  const centro = s.find((x) => x.chave === 'centro')!;
  assert.deepEqual(
    centro.porDia.map((d) => [d.dia, d.horas]),
    [
      ['Dias úteis', ['07:00']],
      ['Sábados', ['09:10']],
    ],
  );
});

test('fora da região conta só onde a viagem acaba, e não cada aldeia pelo caminho', () => {
  const ps = ['c1', 'f1', 'f2'].map((id) => ({ id, nome: id.toUpperCase() }));
  const l = linha('L2', [
    { sentido: '0', variantes: 1, viagens: 3, viagens_deste_percurso: 3, paragens: ps },
  ]);
  const s = saidasDoConcelho('cima', [l], PARAGENS, NOMES);
  assert.deepEqual(
    s.map((x) => [x.chave, x.viagens, x.porDia.length]),
    [['fora:F2', 3, 0]],
    'sem horário, sabe-se o destino e não a hora',
  );
});

test('uma linha que não passa no concelho não é uma saída dele', () => {
  const ps = ['m1', 'b1'].map((id) => ({ id, nome: id.toUpperCase() }));
  const l = linha('L3', [
    { sentido: '0', variantes: 1, viagens: 1, viagens_deste_percurso: 1, paragens: ps },
  ]);
  assert.deepEqual(saidasDoConcelho('cima', [l], PARAGENS, NOMES), []);
});

test('as paragens juntam-se pela terra, e cada uma fica com o que a distingue', () => {
  const g = porLocalidade([
    { nome: 'Vila Alta (Terminal)' },
    { nome: 'Alto da Brisa' },
    { nome: 'Vila Alta (Câmara Municipal)' },
    { nome: 'Vila Alta' },
    { nome: 'Vale (Estação)' },
  ]);
  assert.deepEqual(
    g.map((x) => x.localidade),
    ['Alto da Brisa', 'Vale', 'Vila Alta'],
  );
  // A paragem com o nome da terra sozinho vem primeiro, e o resto por nome.
  assert.deepEqual(
    g[2].paragens.map((x) => x.dentro),
    ['', 'Câmara Municipal', 'Terminal'],
  );
});

test('o urbano que a rede opera conta como urbano do concelho dele, e só dele', () => {
  // A página de um concelho dizia «sem registo: urbano municipal» por cima
  // das linhas do urbano da cidade, que a concessão opera.
  const urbanos: ModoDetalhe = {
    modo: 'urbano-municipal',
    gerido_por: [],
    sistemas: [],
    pontos: [],
    percursos: [{ nome: 'Volta da câmara', concelhos: ['baixo'] }] as ModoDetalhe['percursos'],
    paragens: [],
    horarios: [],
    urbanos_da_rede: [
      {
        nome: 'Urbano de Cima',
        concelho: 'cima',
        linhas: ['11', '12'].map((codigo) => ({
          id: `R${codigo}`,
          codigo,
          nome: `Linha ${codigo}`,
          cor: null,
          cor_texto: null,
        })),
      },
    ],
    incompleto: false,
    notas: [],
    fontes: [],
    quantos: 3,
  };
  assert.equal(quantosNoConcelho(urbanos, 'cima'), 2, 'as duas linhas do urbano da rede');
  assert.equal(quantosNoConcelho(urbanos, 'baixo'), 1, 'o urbano da câmara, que não é da rede');
  assert.equal(quantosNoConcelho(urbanos, 'centro'), 0, 'e o concelho sem nenhum continua sem');
  // Dados de antes disto não trazem a chave: conta-se como dantes.
  const { urbanos_da_rede: _, ...antigo } = urbanos;
  assert.equal(quantosNoConcelho(antigo, 'cima'), 0);
});
