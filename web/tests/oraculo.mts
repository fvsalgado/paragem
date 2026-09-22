/**
 * O ORÁCULO: o planeador do navegador julgado pelo motor.
 *
 * O planeador de viagens deixou de correr num servidor e passou a correr no
 * telemóvel de quem pergunta. A troca vale a pena — 321 kB contra uma máquina
 * a manter — mas tem um risco que nenhum teste de interface apanha: **um
 * planeador que erra uma hora de partida manda alguém para a paragem à espera
 * de um autocarro que não vem.** Uma página pode estar perfeita e a resposta
 * estar errada.
 *
 * Por isso o OpenTripPlanner não desapareceu. Mudou de papel: deixou de servir
 * quem viaja e passou a JULGAR quem o substituiu. Em cada construção responde
 * às mesmas perguntas, e as duas respostas comparam-se.
 *
 * O QUE SE COMPARA, E PORQUÊ ESTAS TRÊS COISAS
 * ---------------------------------------------
 * Não a igualdade: dois planeadores desempatam de maneiras diferentes e nunca
 * devolveriam a mesma lista. Compara-se o que importa a quem viaja:
 *
 * 1. **Concordam em haver viagem.** Um diz que há e o outro que não é o erro
 *    mais caro dos três — ou se manda alguém a pé, ou se lhe esconde o único
 *    autocarro do dia.
 * 2. **A melhor chegada não é muito pior.** Se o motor chega às 10:09 e nós às
 *    11:30, perdemos uma ligação que existe.
 * 3. **Chegamos antes do motor?** Isso PODE ser um transbordo inventado — o
 *    erro que manda alguém correr atrás de um autocarro que já saiu. Mas pode
 *    também ser uma ligação que o motor não vê.
 *
 *    Aconteceu à primeira corrida, duas vezes. A primeira era erro nosso: as
 *    horas dos expressos vêm em UTC e nós líamo-las como se fossem locais,
 *    103 minutos adiantadas. A segunda não era: uma viagem de expresso que
 *    passa em duas paragens da região com 35 minutos entre elas existe no
 *    ficheiro, corre nesse dia e vai naquele sentido — e o motor não a
 *    devolve, nem pedindo-lhe vinte itinerários.
 *
 *    Por isso chegar antes fica como AVISO com o caminho todo escrito, e a
 *    verificação a sério é outra: cada perna que sai daqui é conferida contra
 *    o GTFS em bruto, que é a fonte, pelo `test_oraculo.py`. Um oráculo que
 *    só sabe comparar com outro programa herda os buracos desse programa.
 *
 * Corre-se assim, com o motor levantado:
 *
 *     node web/tests/oraculo.mts --motor http://127.0.0.1:8801 --regiao <região>
 */
import fs from 'node:fs';
import path from 'node:path';
import { prepararRede, planearLocal } from '../src/lib/viagens.ts';

const arg = (nome: string, omissao = '') => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : omissao;
};

const RAIZ = path.resolve(import.meta.dirname, '..', '..');

/**
 * Que região se julga: a que se pedir, ou a que esta raiz construiu e não é de
 * demonstração (§11.6) — as demonstrações não têm motor a que perguntar,
 * porque se constroem sem rede.
 */
const DEMONSTRACOES = ['prova', 'prova-municipio'];
function aRegiaoDaRaiz(): string {
  const build = path.join(RAIZ, 'build');
  const construidas = fs.existsSync(build)
    ? fs
        .readdirSync(build, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(build, e.name, 'oraculo.json')))
        .map((e) => e.name)
        .sort()
    : [];
  return construidas.find((r) => !DEMONSTRACOES.includes(r)) ?? construidas[0] ?? '';
}

const REGIAO = arg('regiao') || aRegiaoDaRaiz();
const MOTOR = arg('motor', 'http://127.0.0.1:8801');
const BASE = path.join(RAIZ, 'build', REGIAO);

if (!REGIAO) {
  console.error('Não há nenhuma região construída em build/ — não há o que julgar.');
  process.exit(2);
}

/** Quanto pior pode a nossa melhor chegada ser, antes de ser uma ligação perdida. */
const ATRASO_TOLERADO_MIN = 20;

/** E quanto mais cedo podemos chegar sem que seja um transbordo inventado. */
const ADIANTO_TOLERADO_MIN = 5;

const CONSULTA = `query V($de: InputCoordinates!, $para: InputCoordinates!, $data: String!, $hora: String!) {
  plan(from: $de, to: $para, date: $data, time: $hora, numItineraries: 5, searchWindow: 43200,
       transportModes: [{mode: WALK}, {mode: BUS}, {mode: RAIL}]) {
    itineraries { duration startTime endTime legs { mode route { shortName } } }
  }
}`;

async function peloMotor(de: any, para: any, data: string, hora: string) {
  const r = await fetch(`${MOTOR.replace(/\/$/, '')}/otp/gtfs/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: CONSULTA,
      variables: {
        de: { lat: de.lat, lon: de.lon },
        para: { lat: para.lat, lon: para.lon },
        data,
        hora,
      },
    }),
  });
  const d = await r.json();
  return (d?.data?.plan?.itineraries ?? []) as { startTime: number; endTime: number }[];
}

/** O dia em que se pergunta: o primeiro da grelha que tenha serviço a sério. */
function diaComServico(g: any): string {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const dias = Object.keys(g.datas).sort();
  // O dia de mais serviço a partir de hoje — um dia útil de período escolar.
  // Num dia fraco as duas respostas são «nada» e o teste não prova nada.
  const futuros = dias.filter((d) => d >= hoje);
  const escolhido = (futuros.length ? futuros : dias)
    .map((d) => [d, g.datas[d].length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return `${escolhido.slice(0, 4)}-${escolhido.slice(4, 6)}-${escolhido.slice(6)}`;
}

function ler(relativo: string, comoObter: string) {
  const caminho = path.join(BASE, relativo);
  if (!fs.existsSync(caminho)) {
    console.error(`Falta ${caminho}.\n  Corre primeiro: ${comoObter}`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(caminho, 'utf8'));
}

// A ORDEM IMPORTA, e é fácil de esquecer: o `sitio` limpa a pasta antes de
// escrever, e os transbordos vivem lá dentro. Correr `sitio` depois de
// `transbordos` apaga-os, e o erro que isso dava era um ENOENT sem contexto.
const g = ler('sitio/viagens.json', `uv run pipeline sitio --regiao ${REGIAO}`);
const t = ler(
  'sitio/transbordos.json',
  `uv run pipeline transbordos --regiao ${REGIAO}  (DEPOIS do sitio, e com o motor levantado)`,
);
const decl = ler('oraculo.json', `uv run pipeline sitio --regiao ${REGIAO}`);
const rede = prepararRede(g, t);
const dia = diaComServico(g);

console.log(`O oráculo — ${REGIAO}, a ${dia}, contra ${MOTOR}`);
console.log(
  `  ${rede.padroes.length} padrões · ${rede.precisao.pelo_motor} transbordos de rua, ` +
    `${rede.precisao.em_linha_reta} em linha reta\n`,
);

const hhmm = (ms: number) =>
  new Intl.DateTimeFormat('pt-PT', {
    timeZone: decl.fuso,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));

/**
 * As linhas cujo horário se lê noutro relógio.
 *
 * Um feed pan-europeu pode declarar `UTC` — o dos expressos declara — e o GTFS
 * manda ler as horas dele no fuso da agência. Nós lemos; o motor lê-as como
 * locais, e fica uma hora à frente no verão.
 *
 * QUEM ESTÁ CERTO MEDE-SE NO PRÓPRIO FICHEIRO: Lisboa→Madrid e Madrid→Lisboa
 * demoram as duas 8,3 h no feed. Madrid está uma hora à frente de Lisboa; se
 * as horas fossem locais em cada paragem, um sentido leria mais uma hora do
 * que o outro. Lêem iguais, logo o ficheiro está num só relógio — o que
 * declara.
 *
 * Por isso uma opção do motor que dependa destas linhas não serve de padrão:
 * não é uma ligação que nos escape, é o mesmo autocarro a uma hora diferente.
 * Fica dito, e não conta como falha.
 */
const NOUTRO_FUSO = new Set<string>(
  (g.linhas ?? [])
    .filter((l: any[]) => (g.fusos ?? [])[l[4]] && g.fusos[l[4]] !== (g.fuso ?? decl.fuso))
    .map((l: any[]) => String(l[0])),
);

function usaOutroFuso(itinerario: any): boolean {
  return (itinerario.legs ?? []).some((l: any) =>
    NOUTRO_FUSO.has(String(l?.route?.shortName ?? '')),
  );
}

let falhas = 0;
const saida: unknown[] = [];
for (const v of decl.viagens) {
  const nossos = planearLocal(rede, { ...v.de }, { ...v.para }, dia, '09:00', 5);
  const deles = await peloMotor(v.de, v.para, dia, '09:00');

  const nossaChegada = nossos.length ? Math.min(...nossos.map((i) => i.endTime)) : null;
  const comparaveis = deles.filter((i) => !usaOutroFuso(i));
  const postas_de_lado = deles.length - comparaveis.length;
  const delesChegada = comparaveis.length ? Math.min(...comparaveis.map((i) => i.endTime)) : null;

  const queixas: string[] = [];
  const avisos: string[] = [];
  if (postas_de_lado) {
    avisos.push(
      `${postas_de_lado} de ${deles.length} opções do motor usam linhas de um feed que ` +
        'declara outro fuso, e ele lê-as como locais. Não servem de padrão.',
    );
  }
  if (!!nossaChegada !== !!delesChegada) {
    queixas.push(
      delesChegada
        ? `o motor acha caminho (chega às ${hhmm(delesChegada)}) e nós não`
        : 'nós achamos caminho e o motor não',
    );
  } else if (nossaChegada && delesChegada) {
    const diferenca = (nossaChegada - delesChegada) / 60000;
    if (diferenca > ATRASO_TOLERADO_MIN) {
      queixas.push(
        `chegamos ${Math.round(diferenca)} min depois do motor ` +
          `(${hhmm(nossaChegada)} contra ${hhmm(delesChegada)}) — há uma ligação que nos escapa`,
      );
    }
    if (-diferenca > ADIANTO_TOLERADO_MIN) {
      avisos.push(
        `chegamos ${Math.round(-diferenca)} min antes do motor ` +
          `(${hhmm(nossaChegada)} contra ${hhmm(delesChegada)}). ` +
          'Confere-se contra o ficheiro no `test_oraculo.py`.',
      );
    }
  }

  const marca = queixas.length ? '✗' : '✓';
  const resumo = nossaChegada
    ? `${nossos.length} opções, melhor chegada ${hhmm(nossaChegada)}`
    : 'sem caminho';
  const motorResumo = delesChegada ? hhmm(delesChegada) : 'sem caminho';
  console.log(`  ${marca} ${v.nome}`);
  console.log(`      nós: ${resumo}   ·   motor: ${motorResumo}`);
  for (const q of queixas) {
    console.log(`      ✗ ${q}`);
    falhas++;
  }
  for (const a of avisos) console.log(`      ~ ${a}`);

  // O que saiu daqui fica escrito, para o `test_oraculo.py` o conferir contra
  // o GTFS em bruto. É essa a verificação que não depende de outro programa.
  saida.push({
    nome: v.nome,
    dia,
    itinerarios: nossos.map((i) => ({
      startTime: i.startTime,
      endTime: i.endTime,
      legs: i.legs.map((l) => ({
        mode: l.mode,
        startTime: l.startTime,
        endTime: l.endTime,
        linha: l.route?.shortName ?? null,
        de: l.from.name,
        para: l.to.name,
      })),
    })),
  });
}

fs.writeFileSync(
  path.join(BASE, 'oraculo-saida.json'),
  JSON.stringify({ regiao: REGIAO, dia, fuso: decl.fuso, viagens: saida }, null, 1),
);

console.log();
if (falhas) {
  console.error(`${falhas} divergências. O planeador do navegador não pode ir assim.`);
  process.exit(1);
}
console.log('As duas respostas batem certo.');
