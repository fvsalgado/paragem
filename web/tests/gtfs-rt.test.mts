/**
 * O feed de avisos é codificado à mão — e DESCODIFICADO PELA IMPLEMENTAÇÃO DE
 * REFERÊNCIA.
 *
 * É esse o ponto destes testes, e a razão de a `gtfs-realtime-bindings` estar
 * nas dependências de desenvolvimento apesar de não entrar em produção.
 * Protobuf mal codificado não dá erro: dá um ficheiro que a aplicação do outro
 * lado lê ao contrário, em silêncio. Um teste que descodificasse com o nosso
 * próprio código provava que somos coerentes connosco, que é exatamente o que
 * não interessa saber.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

import { feedDeAvisos, type AvisoRT } from '../src/lib/gtfs-rt.ts';

const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

const ler = (bytes: Uint8Array) => FeedMessage.decode(bytes);

/** Os instantes DERIVAM-SE da data, não se decoram.
 *
 * Escrevi-os à mão na primeira versão e enganei-me num ano — e os testes
 * apanharam-me, que é para o que servem. Decorado, o número não prova mais do
 * que derivado: o que se quer provar é que o campo leva ESTE instante em
 * segundos, e não que eu sei somar. */
const seg = (iso: string) => Math.floor(Date.parse(iso) / 1000);

const UM: AvisoRT = {
  id: 'obra-ponte',
  titulo: 'Obra na ponte',
  texto: 'A ponte fecha ao trânsito entre as 9h e as 17h.',
  gravidade: 'SEVERE',
  causa: 'CONSTRUCTION',
  efeito: 'DETOUR',
  inicio: '2026-09-23T08:00:00Z',
  fim: '2026-09-26T20:00:00Z',
  linhas: ['10', '622'],
  paragens: ['tmr-0001'],
  url: 'https://exemplo.pt/obra',
};

test('a implementação de referência lê o que escrevemos', () => {
  const feed = ler(feedDeAvisos([UM], 'pt', new Date('2026-09-23T01:00:00Z')));

  assert.equal(feed.header?.gtfsRealtimeVersion, '2.0');
  assert.equal(Number(feed.header?.timestamp), seg('2026-09-23T01:00:00Z'));
  assert.equal(feed.entity?.length, 1);

  const e = feed.entity![0];
  assert.equal(e.id, 'obra-ponte');
  const a = e.alert!;
  assert.equal(a.headerText?.translation?.[0]?.text, 'Obra na ponte');
  assert.equal(a.headerText?.translation?.[0]?.language, 'pt');
  assert.equal(a.descriptionText?.translation?.[0]?.text, UM.texto);
  assert.equal(a.url?.translation?.[0]?.text, 'https://exemplo.pt/obra');
});

test('a gravidade, a causa e o efeito chegam como os nomes da especificação', () => {
  const a = ler(feedDeAvisos([UM])).entity![0].alert!;
  // Os enums voltam como NÚMEROS; comparar com o nome prova que o número que
  // escrevemos é o que a especificação dá a esse nome, e não outro qualquer.
  assert.equal(a.severityLevel, 4, 'SEVERE');
  assert.equal(a.cause, 10, 'CONSTRUCTION');
  assert.equal(a.effect, 4, 'DETOUR');
});

test('o período de vigência chega nos dois extremos', () => {
  const a = ler(feedDeAvisos([UM])).entity![0].alert!;
  assert.equal(a.activePeriod?.length, 1);
  assert.equal(Number(a.activePeriod![0].start), seg('2026-09-23T08:00:00Z'));
  assert.equal(Number(a.activePeriod![0].end), seg('2026-09-26T20:00:00Z'));
});

test('as linhas e as paragens chegam como entidades informadas', () => {
  const a = ler(feedDeAvisos([UM])).entity![0].alert!;
  assert.deepEqual(a.informedEntity?.map((x) => x.routeId).filter(Boolean), ['10', '622']);
  assert.deepEqual(a.informedEntity?.map((x) => x.stopId).filter(Boolean), ['tmr-0001']);
});

test('um aviso sem linhas nem paragens vale para a rede toda', () => {
  // A especificação diz que um alerta sem `informed_entity` se aplica a tudo.
  // Isto não é um descuido nosso: é a forma de dizer «a rede toda», e o painel
  // avisa quem deixar um aviso assim.
  const a = ler(feedDeAvisos([{ ...UM, linhas: [], paragens: [] }])).entity![0].alert!;
  assert.equal(a.informedEntity?.length ?? 0, 0);
});

test('um aviso sem fim declarado não inventa um', () => {
  // É o caso mais honesto numa avaria: não se sabe quando acaba.
  const p = ler(feedDeAvisos([{ ...UM, fim: null }])).entity![0].alert!.activePeriod![0];
  assert.equal(Number(p.start), seg('2026-09-23T08:00:00Z'));

  // PERGUNTA-SE PELA PRESENÇA DO CAMPO, não pelo seu valor — e a diferença
  // apanhou-me. Num campo `optional` do proto2, a biblioteca de referência
  // serve pelo protótipo um zero que é um objeto `Long`, e um objeto é
  // SEMPRE verdadeiro: `!p.end` dá falso mesmo quando não escrevemos byte
  // nenhum. Quem consome o feed a sério faz esta mesma pergunta, porque em
  // GTFS-RT um `end` ausente quer dizer «não se sabe quando acaba» e um
  // `end` a zero quer dizer «acabou em 1970».
  assert.equal(Object.prototype.hasOwnProperty.call(p, 'end'), false, 'não devia haver fim');
});

test('um aviso sem período nenhum não traz período nenhum', () => {
  const a = ler(feedDeAvisos([{ ...UM, inicio: null, fim: null }])).entity![0].alert!;
  assert.equal(a.activePeriod?.length ?? 0, 0);
});

test('sem avisos, o feed é válido e vazio — e não um erro', () => {
  // Uma região sem avisos é o estado NORMAL. Quem consome o feed tem de poder
  // distinguir «não há nada» de «não consegui ler», e um feed vazio bem
  // formado diz a primeira.
  const feed = ler(feedDeAvisos([]));
  assert.equal(feed.header?.gtfsRealtimeVersion, '2.0');
  assert.equal(feed.entity?.length ?? 0, 0);
});

test('vários avisos saem todos, pela ordem em que entram', () => {
  const feed = ler(feedDeAvisos([UM, { ...UM, id: 'greve', titulo: 'Greve' }]));
  assert.deepEqual(
    feed.entity?.map((e) => e.id),
    ['obra-ponte', 'greve'],
  );
});

test('um valor que não existe na especificação não corrompe o feed', () => {
  // Isto não devia chegar aqui — a base recusa-o por `check`. Mas se chegar,
  // vale mais um feed legível com «desconhecido» do que um feed partido.
  const a = ler(
    feedDeAvisos([{ ...UM, gravidade: 'GRAVISSIMO', causa: 'SEI-LÁ', efeito: 'TALVEZ' }]),
  ).entity![0].alert!;
  assert.equal(a.severityLevel, 1, 'UNKNOWN_SEVERITY');
  assert.equal(a.cause, 1, 'UNKNOWN_CAUSE');
  assert.equal(a.effect, 7, 'OTHER_EFFECT');
});

test('acentos e caracteres fora do ASCII sobrevivem à viagem', () => {
  const a = ler(
    feedDeAvisos([{ ...UM, titulo: 'Supressão em Ourém', texto: 'Ligação à Sertã — 3 €' }]),
  ).entity![0].alert!;
  assert.equal(a.headerText?.translation?.[0]?.text, 'Supressão em Ourém');
  assert.equal(a.descriptionText?.translation?.[0]?.text, 'Ligação à Sertã — 3 €');
});
