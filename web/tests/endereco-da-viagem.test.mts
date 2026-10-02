/**
 * A viagem no endereço: o que se lê, o que se escreve, e o que nunca se escreve.
 *
 * É a forma que quem liga de fora usa (`docs/ENDERECOS.md`), e a que o
 * «voltar» do telemóvel percorre. Partir-se aqui não dá erro nenhum: dá uma
 * ligação partilhada que abre o planeador vazio, ou — pior — uma paragem
 * inventada com o nome que veio no endereço.
 *
 * Os pontos são inventados, com a forma dos que a construção escreve.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoDe,
  comoProcura,
  dentroDaRegiao,
  diaValido,
  escreverViagem,
  horaValida,
  lerPonta,
  lerViagem,
  limparNome,
  MARGEM_GRAUS,
  type Caixa,
} from '../src/lib/endereco-da-viagem.ts';
import type { Ponto } from '../src/lib/formato.ts';

const CAIXA: Caixa = { lat_min: 40.0, lat_max: 40.5, lon_min: -9.5, lon_max: -9.0 };

const PONTOS: Ponto[] = [
  {
    nome: 'Vila Alta (Terminal)',
    lat: 40.2,
    lon: -9.2,
    tipo: 'paragem',
    id: 'va-1',
    concelho: 'va',
  },
  { nome: 'Vila Alta', lat: 40.21, lon: -9.21, tipo: 'estacao', id: 'est-va', concelho: 'va' },
  { nome: 'Praça da Vila Alta', lat: 40.2, lon: -9.2, tipo: 'taxi', id: 'va-1', concelho: 'va' },
  { nome: 'Miradouro', lat: 40.3, lon: -9.3, tipo: 'sitio', id: '', concelho: 'mi' },
];

test('as coordenadas são um ponto qualquer, com o nome que vem — e nunca uma paragem', () => {
  const r = lerPonta('40.25,-9.25', 'Feira do Livro', PONTOS, CAIXA);
  assert.equal(r?.tipo, 'ponto');
  if (r?.tipo !== 'ponto') return;
  assert.equal(r.ponto.nome, 'Feira do Livro');
  assert.equal(r.ponto.tipo, 'sitio', 'a pé até à paragem mais perto, como uma rua');
  assert.equal(r.ponto.id, '', 'sem identificador: não é uma paragem');
  assert.equal(r.ponto.lat, 40.25);
  assert.equal(r.ponto.lon, -9.25);
});

test('coordenadas sem nome mostram-se como ponto escolhido, e não como um número', () => {
  const r = lerPonta('40.25,-9.25', null, PONTOS, CAIXA);
  assert.equal(r?.tipo === 'ponto' && r.ponto.nome, 'Ponto escolhido');
});

test('coordenadas longe da região dizem-no, em vez de virarem «sem viagem»', () => {
  // Do outro lado do oceano: a ordem das coordenadas trocada dá isto.
  assert.deepEqual(lerPonta('-9.25,40.25', 'Concerto', PONTOS, CAIXA), {
    tipo: 'fora',
    nome: 'Concerto',
  });
  // Um nada fora da caixa ainda conta: há carreiras que atravessam a fronteira.
  const naMargem = lerPonta(`${40.5 + MARGEM_GRAUS / 2},-9.25`, 'Na vila do lado', PONTOS, CAIXA);
  assert.equal(naMargem?.tipo, 'ponto');
  const paraLa = lerPonta(`${40.5 + MARGEM_GRAUS * 2},-9.25`, 'Mais longe', PONTOS, CAIXA);
  assert.equal(paraLa?.tipo, 'fora');
  // E o que nem é coordenada da Terra não passa, mesmo sem caixa.
  assert.equal(dentroDaRegiao(95, -9, null), false);
  assert.equal(dentroDaRegiao(40, -190, null), false);
  assert.equal(dentroDaRegiao(40, -9, null), true);
});

test('o identificador encontra a paragem antes de outro ponto com o mesmo', () => {
  const r = lerPonta('va-1', null, PONTOS, CAIXA);
  assert.equal(r?.tipo === 'ponto' && r.ponto.tipo, 'paragem');
  const e = lerPonta('est-va', null, PONTOS, CAIXA);
  assert.equal(e?.tipo === 'ponto' && e.ponto.nome, 'Vila Alta');
});

test('o nome exato continua a valer, para não partir ligações que já andam por aí', () => {
  const r = lerPonta('Vila Alta (Terminal)', null, PONTOS, CAIXA);
  assert.equal(r?.tipo === 'ponto' && r.ponto.id, 'va-1');
  const s = lerPonta('Miradouro', null, PONTOS, CAIXA);
  assert.equal(s?.tipo === 'ponto' && s.ponto.tipo, 'sitio');
});

test('o que não se conhece fica por conhecer, e não se inventa', () => {
  assert.deepEqual(lerPonta('Terra Que Não Existe', null, PONTOS, CAIXA), {
    tipo: 'desconhecida',
    valor: 'Terra Que Não Existe',
  });
  assert.equal(lerPonta('', 'nome sem ponta', PONTOS, CAIXA), null);
  assert.equal(lerPonta(null, null, PONTOS, CAIXA), null);
});

test('o nome que vem de fora mostra-se limpo e curto', () => {
  assert.equal(limparNome('  Feira\u0000 do\n\tLivro  '), 'Feira do Livro');
  // Os carateres que viram o texto ao contrário não passam.
  assert.equal(limparNome('abc‮def'), 'abc def');
  const longo = limparNome('x'.repeat(200));
  assert.equal(longo.length, 80);
  assert.ok(longo.endsWith('…'));
  // O que parece HTML continua a ser texto: o React escapa-o ao mostrar.
  assert.equal(limparNome('<b>Festa</b>'), '<b>Festa</b>');
  assert.equal(limparNome(undefined), '');
});

test('o dia tem de existir no calendário, e a hora no relógio', () => {
  assert.equal(diaValido('2026-10-02'), '2026-10-02');
  assert.equal(diaValido('2026-02-31'), null, 'o 31 de fevereiro não passa');
  assert.equal(diaValido('2/10/2026'), null);
  assert.equal(horaValida('08:05'), '08:05');
  assert.equal(horaValida('24:00'), null);
  assert.equal(horaValida('8:05'), null);
});

test('um dia sem hora é o dia todo; uma hora sem dia é hoje, e não se lê', () => {
  const comDia = lerViagem(new URLSearchParams('dia=2026-10-02'), PONTOS, CAIXA);
  assert.equal(comDia.dia, '2026-10-02');
  assert.equal(comDia.hora, '00:00');
  const soHora = lerViagem(new URLSearchParams('hora=08:00'), PONTOS, CAIXA);
  assert.equal(soHora.dia, null);
  assert.equal(soHora.hora, '08:00');
});

test('o destino por coordenadas lê o nome de «nome», e a partida o de «nome_de»', () => {
  const q = new URLSearchParams({
    de: '40.1,-9.1',
    nome_de: 'Casa',
    para: '40.25,-9.25',
    nome: 'Feira do Livro',
  });
  const v = lerViagem(q, PONTOS, CAIXA);
  assert.equal(v.de?.tipo === 'ponto' && v.de.ponto.nome, 'Casa');
  assert.equal(v.para?.tipo === 'ponto' && v.para.ponto.nome, 'Feira do Livro');
});

test('ida e volta: o que se escreve é o que se lê', () => {
  const de = PONTOS[0];
  const para: Ponto = {
    nome: 'Feira do Livro',
    lat: 40.25,
    lon: -9.25,
    tipo: 'sitio',
    id: '',
    concelho: '',
  };
  const q = escreverViagem({ de, para, dia: '2026-10-03', hora: '08:00' });
  assert.equal(q.get('de'), 'va-1', 'uma paragem escreve-se pelo identificador');
  assert.equal(q.get('para'), '40.25000,-9.25000');
  assert.equal(q.get('nome'), 'Feira do Livro');
  const v = lerViagem(new URLSearchParams(q.toString()), PONTOS, CAIXA);
  assert.equal(v.de?.tipo === 'ponto' && v.de.ponto, de);
  assert.equal(v.para?.tipo === 'ponto' && v.para.ponto.nome, 'Feira do Livro');
  assert.equal(v.dia, '2026-10-03');
  assert.equal(v.hora, '08:00');
});

test('«a minha localização» nunca vai para o endereço', () => {
  const aqui: Ponto = {
    nome: 'A minha localização',
    lat: 40.123456,
    lon: -9.123456,
    tipo: 'aqui',
    id: '',
    concelho: '',
  };
  const q = escreverViagem({ de: aqui, para: PONTOS[0] });
  assert.equal(q.get('de'), null);
  assert.ok(!q.toString().includes('40.12'), `a coordenada saiu no endereço: ${q}`);
  assert.equal(comoProcura(q), '?para=va-1');
});

test('sem dia não se escreve hora: «agora» não é uma hora a guardar', () => {
  const q = escreverViagem({ de: PONTOS[0], para: PONTOS[1], dia: null, hora: '10:30' });
  assert.equal(q.get('hora'), null);
  assert.equal(comoProcura(escreverViagem({ de: null, para: null })), '');
});

test('o que o endereço pediu e não se pôde abrir diz-se numa frase', () => {
  const fora = lerPonta('-9.25,40.25', 'Concerto', PONTOS, CAIXA);
  const nenhuma = lerPonta('Terra Que Não Existe', null, PONTOS, CAIXA);
  const aviso = avisoDe(nenhuma, fora, 'na região de ensaio');
  assert.match(aviso!, /^O destino pedido, «Concerto», fica longe de mais/);
  assert.match(aviso!, /na região de ensaio\./);
  assert.match(aviso!, /A partida pedida, «Terra Que Não Existe», não é uma paragem/);
  assert.equal(avisoDe(null, lerPonta('va-1', null, PONTOS, CAIXA), 'aqui'), null);
});

test('o nome escrito à mão, sem acentos nem maiúsculas, encontra o ponto — se for de um só', () => {
  // É o que chega da caixa «Para onde vais?» que as câmaras põem nos sítios delas.
  const r = lerPonta('vila alta (terminal)', null, PONTOS, CAIXA);
  assert.equal(r?.tipo === 'ponto' && r.ponto.id, 'va-1');
  const s = lerPonta('  MIRADOURO ', null, PONTOS, CAIXA);
  assert.equal(s?.tipo, 'ponto');
});
