/**
 * O PLANEADOR, NUMA REDE INVENTADA ONDE EU SEI A RESPOSTA.
 *
 * O oráculo compara com o motor e com o ficheiro, sobre a rede a sério. Isto é
 * a outra metade: uma rede de brincar, pequena ao ponto de se conferir de
 * cabeça, onde cada teste isola UMA regra. Quando o oráculo acusa, é aqui que
 * se descobre porquê.
 *
 * A rede: três paragens em linha, duas linhas, e um par a pé entre B e B2.
 *
 *     A ──(linha 1)── B    B2 ──(linha 2)── C
 *                      └─ 300 s a pé ─┘
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararRede,
  planearLocal,
  codificarLinha,
  metros,
  type GrelhaCrua,
  type TransbordosCrus,
} from '../src/lib/viagens.ts';
import { descodificarLinha, diaDe } from '../src/lib/otp.ts';

const h = (hh: number, mm = 0) => hh * 3600 + mm * 60;

function rede(opcoes: { fusoDaLinha2?: string; semModos?: string[] } = {}) {
  const g: GrelhaCrua = {
    fuso: 'Europe/Lisbon',
    fusos: ['Europe/Lisbon', opcoes.fusoDaLinha2 ?? 'Europe/Lisbon'],
    paragens: [
      ['a', 39.5, -8.5, 'A'],
      ['b', 39.6, -8.5, 'B'],
      ['b2', 39.6005, -8.5, 'B2'],
      ['c', 39.7, -8.5, 'C'],
    ],
    linhas: [
      ['1', 'A para B', null, 'autocarro', 0],
      ['2', 'B2 para C', null, 'autocarro', 1],
    ],
    viagens: [
      // linha 1: A 09:00 → B 09:30
      [0, 0, [0, h(9), h(9), 1, h(9, 30), h(9, 30)]],
      // linha 2: B2 10:00 → C 10:30
      [1, 0, [2, h(10), h(10), 3, h(10, 30), h(10, 30)]],
    ],
    servicos: ['s'],
    datas: { '20260925': [0] },
  };
  const t: TransbordosCrus = {
    fator_de_desvio: 1.2,
    pelo_motor: 1,
    em_linha_reta: 0,
    pares: [[1, 2, 300]],
  };
  return prepararRede(g, t, opcoes.semModos ?? []);
}

const A = { nome: 'A', lat: 39.5, lon: -8.5 };
const C = { nome: 'C', lat: 39.7, lon: -8.5 };

test('a viagem com transbordo a pé sai inteira, e pela ordem certa', () => {
  const its = planearLocal(rede(), A, C, '2026-09-25', '08:00', 5);
  assert.ok(its.length >= 1, 'tinha de haver caminho');
  const linhas = its[0].legs.filter((l) => l.route).map((l) => l.route!.shortName);
  assert.deepEqual(linhas, ['1', '2']);
  // A pé de B para B2 pelo meio, com os 300 s que a tabela declara.
  const aPe = its[0].legs.filter((l) => l.mode === 'WALK' && l.from.name === 'B');
  assert.equal(aPe.length, 1);
  assert.equal(aPe[0].duration, 300);
});

test('não se apanha o seguinte antes de chegar', () => {
  const its = planearLocal(rede(), A, C, '2026-09-25', '08:00', 5);
  for (const it of its) {
    for (let i = 1; i < it.legs.length; i++) {
      assert.ok(
        it.legs[i].startTime >= it.legs[i - 1].endTime,
        `perna ${i} parte antes de a anterior chegar`,
      );
    }
  }
});

test('perguntar depois da última partida não devolve nada', () => {
  assert.equal(planearLocal(rede(), A, C, '2026-09-25', '11:00', 5).length, 0);
});

test('um dia sem serviço não inventa viagens', () => {
  assert.equal(planearLocal(rede(), A, C, '2026-09-26', '08:00', 5).length, 0);
});

test('UMA LINHA EM UTC LÊ-SE EM UTC, e isso desloca-a uma hora no verão', () => {
  /**
   * Foi o erro que o oráculo apanhou à primeira corrida: as horas dos
   * expressos vêm em UTC — um feed pan-europeu tem todo o direito a isso — e
   * estavam a ser lidas como se fossem de Lisboa. Em setembro são 103 minutos
   * de diferença numa viagem inteira, e um planeador adiantado manda alguém
   * correr atrás de um autocarro que ainda não chegou.
   *
   * Aqui: a linha 2 parte às 10:00 do seu fuso. Em Lisboa (UTC+1 em setembro)
   * isso são 11:00. A chegada tem de refletir a hora do relógio de quem
   * pergunta, e não a que está escrita no ficheiro.
   */
  const emLisboa = planearLocal(rede(), A, C, '2026-09-25', '08:00', 5);
  const emUtc = planearLocal(rede({ fusoDaLinha2: 'UTC' }), A, C, '2026-09-25', '08:00', 5);
  assert.ok(emLisboa.length && emUtc.length);
  const hora = (ms: number) =>
    new Intl.DateTimeFormat('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  assert.equal(hora(emLisboa[0].endTime), '10:30');
  assert.equal(hora(emUtc[0].endTime), '11:30');
});

test('a polilinha volta a ser a mesma linha', () => {
  const pontos: [number, number][] = [
    [39.5, -8.5],
    [39.60001, -8.49999],
    [39.7, -8.4],
  ];
  const volta = descodificarLinha(codificarLinha(pontos));
  assert.equal(volta.length, 3);
  volta.forEach(([lon, lat], i) => {
    // O GeoJSON vem em [lon, lat]; a polilinha é [lat, lon].
    assert.ok(Math.abs(lat - pontos[i][0]) < 1e-5, `lat ${i}`);
    assert.ok(Math.abs(lon - pontos[i][1]) < 1e-5, `lon ${i}`);
  });
});

test('a distância entre dois pontos é a que se mede no mapa', () => {
  // Um grau de latitude são uns 111 km em qualquer lado.
  assert.ok(Math.abs(metros([39.5, -8.5], [40.5, -8.5]) - 111_320) < 500);
  assert.equal(Math.round(metros([39.5, -8.5], [39.5, -8.5])), 0);
});

/**
 * AO FIM DA TARDE, A RESPOSTA É A CARREIRA DE AMANHÃ — E NÃO UM DESVIO.
 *
 * Medido numa região a sério a 21/09, e é o defeito que este teste guarda:
 * quem perguntasse um par de cidades às 18:45 recebia UMA opção, de 258
 * minutos, por fora da região, de comboio e autocarro — para um par que tem
 * carreira direta de 60 minutos. A direta seguinte partia às 06:50 do dia a
 * seguir e não aparecia.
 *
 * Eram duas causas a somar, e as duas estão neste teste:
 *
 * - **a janela era de doze horas.** Estava assim porque a página escrevia a
 *   hora sem o dia, e «07:30» sem dia lê-se como sendo já. Passou a escrever
 *   o dia (`diaDe`), e a janela a ser de vinte e quatro;
 * - **o `quantos` contava o que se ACHAVA, não o que sobrava.** Os candidatos
 *   «viajar à noite e dormir algures» gastavam a quota, o laço parava, e o
 *   corte da espera deitava-os fora no fim — sobrava um. O corte passou para
 *   dentro do laço, e uma opção recusada já não gasta a vez.
 *
 * A rede: uma direta de manhã, e um desvio à noite que demora quatro vezes
 * mais. Quem pergunta às 18:00 tem de receber as duas.
 */
test('à noite mostra-se a direta de amanhã, e não só o desvio de hoje', () => {
  const g: GrelhaCrua = {
    fuso: 'Europe/Lisbon',
    fusos: ['Europe/Lisbon'],
    paragens: [
      ['a', 39.5, -8.5, 'A'],
      ['c', 39.7, -8.5, 'C'],
      ['v', 39.0, -8.9, 'Volta'],
    ],
    linhas: [
      ['D', 'a direta', null, 'autocarro', 0],
      ['L', 'o desvio', null, 'autocarro', 0],
    ],
    viagens: [
      // A DIRETA, só de manhã: A 08:00 → C 09:00.
      [0, 0, [0, h(8), h(8), 1, h(9), h(9)]],
      // O DESVIO, ao fim da tarde: A 18:30 → Volta 20:30 → C 22:30.
      [1, 0, [0, h(18, 30), h(18, 30), 2, h(20, 30), h(20, 30), 1, h(22, 30), h(22, 30)]],
      // E SEIS PARTIDAS QUE NÃO LEVAM A LADO NENHUM NESSE DIA: levam à Volta
      // ao fim da tarde, e de lá só se sai na manhã seguinte. São estas que
      // gastavam a quota do `quantos` — cada uma é um candidato achado, com
      // uma espera de dez horas pelo meio, que o corte do fim deitava fora
      // DEPOIS de o laço já ter parado.
      ...([19, 19.5, 20, 20.5, 21, 21.5].map((t) => [
        1,
        0,
        [0, h(Math.floor(t), (t % 1) * 60), h(Math.floor(t), (t % 1) * 60), 2, h(23), h(23)],
      ]) as GrelhaCrua['viagens']),
      // A saída da Volta, só de manhã. É o que faz a espera ser absurda.
      [1, 0, [2, h(7), h(7), 1, h(7, 30), h(7, 30)]],
    ],
    servicos: ['s'],
    // Dois dias seguidos com o mesmo serviço, que é o que uma carreira faz.
    datas: { '20260925': [0], '20260926': [0] },
  };
  const r = prepararRede(g, { fator_de_desvio: 1.2, pelo_motor: 0, em_linha_reta: 0, pares: [] });
  const A2 = { nome: 'A', lat: 39.5, lon: -8.5 };
  const C2 = { nome: 'C', lat: 39.7, lon: -8.5 };

  const its = planearLocal(r, A2, C2, '2026-09-25', '18:00', 5);
  const linhas = its.map((it) => it.legs.filter((l) => l.route).map((l) => l.route!.shortName)[0]);

  assert.ok(linhas.includes('L'), 'o desvio de hoje é uma resposta legítima: chega hoje');
  assert.ok(
    linhas.includes('D'),
    `a direta de amanhã tem de aparecer, e não apareceu — vieram ${JSON.stringify(linhas)}`,
  );

  // E a de amanhã parte MESMO amanhã: o dia é o que a página vai escrever.
  const direta = its[linhas.indexOf('D')];
  const dia = (ms: number) =>
    new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric' }).format(
      new Date(ms),
    );
  assert.equal(dia(direta.startTime), '26');
});

/**
 * O DIA SÓ SE ESCREVE QUANDO NÃO É O DIA PERGUNTADO.
 *
 * Escrever «hoje» em todas as opções é ruído; não escrever nada quando é
 * amanhã é o engano que obrigava a janela a ser curta. E a referência é o dia
 * PERGUNTADO: quem marca para sábado tem de ler «domingo», não «amanhã».
 */
test('o dia aparece ao lado da hora, e só quando muda', () => {
  const q = Date.UTC(2026, 8, 25, 18, 0);
  assert.equal(diaDe(Date.UTC(2026, 8, 25, 23, 30), q), '', 'no mesmo dia não se escreve nada');
  assert.equal(
    diaDe(Date.UTC(2026, 8, 26, 0, 30), q),
    'amanhã',
    'trinta minutos depois, e é amanhã',
  );
  assert.equal(diaDe(Date.UTC(2026, 8, 24, 23, 0), q), 'ontem');
  assert.match(diaDe(Date.UTC(2026, 8, 28, 9, 0), q), /28/, 'mais longe, escreve-se a data');
});

// O interruptor do painel chega até aqui: as viagens das linhas de um modo
// desligado não entram na rede, e por isso nunca se propõem.
test('um módulo desligado tira as viagens das linhas dele da rede', () => {
  const g: GrelhaCrua = {
    fuso: 'Europe/Lisbon',
    fusos: ['Europe/Lisbon'],
    paragens: [
      ['a', 39.5, -8.5, 'A'],
      ['b', 39.6, -8.5, 'B'],
    ],
    linhas: [
      ['1', 'A para B de autocarro', null, 'autocarro', 0],
      ['IC', 'A para B de comboio', null, 'comboio', 0],
    ],
    viagens: [
      [0, 0, [0, h(9), h(9), 1, h(9, 30), h(9, 30)]],
      [1, 0, [0, h(8), h(8), 1, h(8, 20), h(8, 20)]],
    ],
    servicos: ['s'],
    datas: { '20260925': [0] },
  };
  const t: TransbordosCrus = { fator_de_desvio: 1.2, pelo_motor: 1, em_linha_reta: 0, pares: [] };
  const comTudo = prepararRede(g, t);
  assert.equal(
    comTudo.padroes.reduce((n, p) => n + p.viagens.length, 0),
    2,
    'sem nada desligado, as duas viagens entram',
  );
  const semComboio = prepararRede(g, t, ['comboio']);
  const viagens = semComboio.padroes.flatMap((p) => p.viagens);
  assert.equal(viagens.length, 1);
  assert.equal(viagens[0].linha, 0, 'fica a viagem de autocarro');
  // Desligar um modo que a grelha não tem não muda nada.
  assert.equal(
    prepararRede(g, t, ['expresso']).padroes.reduce((n, p) => n + p.viagens.length, 0),
    2,
  );
});
