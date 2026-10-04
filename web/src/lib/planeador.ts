/**
 * QUEM RESPONDE ÀS DIREÇÕES — o motor, ou o telemóvel de quem pergunta.
 *
 * Havia só uma resposta possível: um OpenTripPlanner num servidor. Enquanto
 * esse servidor não existiu, a caixa de procura aceitava a viagem e falhava
 * sempre. Agora há duas, e esta camada escolhe entre elas.
 *
 * **A escolha é da REGIÃO e não do código.** Uma região que declare um motor
 * usa-o e ganha as ruas: o troço a pé vem rua a rua, e a bicicleta também.
 * Uma região sem motor — que vai ser a maior parte delas — usa o planeador que
 * corre no navegador, com a grelha horária de 321 kB. A página não sabe a
 * diferença, porque as duas devolvem a mesma forma.
 *
 * **O que se perde sem motor, e a interface tem de o dizer:** o troço a pé
 * entre um ponto qualquer e a primeira paragem passa a ser uma estimativa em
 * linha reta, e as direções a pé e de bicicleta deixam de existir — essas são
 * a pergunta «por onde», e essa não se responde sem as ruas.
 */
import { MODOS, planear as planearComMotor, type Itinerario, type Modo } from './otp';
import {
  prepararRede,
  planearLocal,
  percursoDaPerna,
  limparPernas,
  procurarNosDias,
  semRepetidas,
  arrumarParaMostrar,
  type GrelhaCrua,
  type Rede,
  type TransbordosCrus,
} from './viagens';
import { descodificarLinha } from './otp';
import { enderecoDosDados } from './dados-do-navegador.ts';
import { dataDoCampo, horaDoRelogio } from './dias';

export type { Itinerario, Modo };
export { MODOS };

/**
 * O que uma região consegue responder, para a interface não oferecer o que não há.
 *
 * `falta` diz PORQUE é que não responde, quando não responde — e são duas
 * coisas que pedem frases opostas. `sem-horarios`: a região não publica a
 * grelha (o ficheiro não existe). `sem-ligacao`: a grelha existe e não chegou
 * — a rede caiu, o servidor tropeçou —, e a resposta certa é «tenta outra
 * vez», nunca «esta região não tem horários».
 */
export type Capacidade = {
  modos: Modo[];
  aPeExato: boolean;
  porque: string | null;
  falta?: 'sem-horarios' | 'sem-ligacao';
};

/**
 * A grelha existe e NÃO CHEGOU: uma falha de rede, ou o servidor a responder
 * com outra coisa que não «aqui está» ou «não existe». Quem a apanha diz que
 * não conseguiu, e oferece-se para tentar outra vez.
 */
export class SemLigacao extends Error {}

const redes = new Map<string, Promise<Rede | null>>();

/**
 * A grelha horária desta região, buscada UMA VEZ e guardada.
 *
 * Não vem com a página: só quem abre as direções é que paga os 321 kB. E o
 * navegador guarda-os, por isso a segunda procura não custa pedido nenhum.
 */
function redeDe(regiao: string, semModos: readonly string[] = []): Promise<Rede | null> {
  // Uma rede por região E por conjunto de módulos desligados: a grelha é a
  // mesma, o que muda é o que se deixa de propor.
  const chave = `${regiao}|${[...semModos].sort().join('+')}`;
  let p = redes.get(chave);
  if (!p) {
    p = (async () => {
      // «NÃO EXISTE» E «NÃO CHEGOU» SÃO RESPOSTAS DIFERENTES. As duas davam
      // `null`, e a página dizia «esta região ainda não tem horários» a quem
      // só tinha perdido a rede por um momento. O que não existe responde 404
      // num servidor de ficheiros e 400 na porta pública do armazém
      // (`dados.ts`); o resto — rede em baixo, um 500 — é falta de resposta.
      const [g, t] = await Promise.all([
        fetch(enderecoDosDados(regiao, `viagens.json`)).then((r) => {
          if (r.ok) return r.json();
          if (r.status === 404 || r.status === 400) return null;
          throw new SemLigacao(`viagens.json: HTTP ${r.status}`);
        }),
        fetch(enderecoDosDados(regiao, `transbordos.json`))
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (!g) return null;
      // Sem transbordos ainda se responde: perde-se a mudança de autocarro,
      // não a viagem direta. É melhor do que não responder nada.
      return prepararRede(g as GrelhaCrua, (t ?? { pares: [] }) as TransbordosCrus, semModos);
    })().catch((e) => {
      // Uma falha NÃO fica guardada: guardá-la era responder «não chegou» a
      // todas as perguntas seguintes, mesmo depois de a rede voltar.
      redes.delete(chave);
      throw e instanceof SemLigacao ? e : new SemLigacao(String(e));
    });
    redes.set(chave, p);
  }
  return p;
}

/**
 * O que esta região consegue responder.
 *
 * Com motor, tudo. Sem motor, só transportes públicos — e é deliberado não
 * oferecer «a pé» e «de bicicleta» com uma linha reta: um troço de 200 m até
 * à paragem estima-se sem enganar ninguém, mas desenhar oito quilómetros a
 * direito por cima de campos e dizer «a pé» é outra coisa.
 */
export async function capacidadeDe(regiao: string, motor = ''): Promise<Capacidade> {
  if (motor) return { modos: ['transporte', 'a-pe', 'bicicleta'], aPeExato: true, porque: null };
  let rede: Rede | null;
  try {
    rede = await redeDe(regiao);
  } catch {
    return {
      modos: [],
      aPeExato: false,
      porque: 'Não foi possível descarregar os horários.',
      falta: 'sem-ligacao',
    };
  }
  if (!rede) {
    return {
      modos: [],
      aPeExato: false,
      porque: 'Não há horários carregados para esta região.',
      falta: 'sem-horarios',
    };
  }
  return {
    modos: ['transporte'],
    aPeExato: false,
    porque:
      'As distâncias a pé são estimadas em linha reta. Para direções rua a rua ' +
      'era preciso um motor de viagens, e esta região não tem nenhum.',
  };
}

/**
 * O TRAÇADO DE CADA LINHA, buscado só quando se vai desenhar.
 *
 * São 122 ficheiros, mediana de 1,7 kB comprimidos e o maior com 5,2 kB. Uma
 * viagem toca duas ou três linhas, por isso desenhar custa uns poucos kB — em
 * vez dos 216 kB que seriam todos juntos.
 *
 * **E SÓ SE PEDEM OS QUE EXISTEM (P3-011).** Nem todas as linhas têm
 * traçado: o pipeline desenha as que os feeds trazem, e o comboio pelos carris
 * do recorte onde o ficheiro não traz nenhum — o resto fica sem ficheiro. O
 * planeador pedia-os na mesma — `percursos/209.json`, um 400 em cada procura,
 * um erro na consola por cada um, e os erros que importam escondidos por
 * baixo deles. O `percursos/indice.json` diz quais há, e lê-se uma vez.
 */
const percursos = new Map<string, Promise<Record<string, string> | null>>();
const indices = new Map<string, Promise<Set<number> | null>>();

/** Os índices das linhas que têm traçado — ou `null` se o índice não existir. */
function comTracado(regiao: string): Promise<Set<number> | null> {
  let p = indices.get(regiao);
  if (!p) {
    p = fetch(enderecoDosDados(regiao, 'percursos/indice.json'))
      .then((r) => (r.ok ? (r.json() as Promise<number[]>) : null))
      .then((lista) => (Array.isArray(lista) ? new Set(lista.map(Number)) : null))
      .catch(() => {
        // Uma falha não fica guardada: a próxima procura volta a perguntar.
        indices.delete(regiao);
        return null;
      });
    indices.set(regiao, p);
  }
  return p;
}

function percursosDaLinha(
  regiao: string,
  rede: Rede,
  indice: number,
): Promise<Record<string, string> | null> {
  const chave = `${regiao}/${indice}`;
  let p = percursos.get(chave);
  if (!p) {
    p = (async () => {
      try {
        // Sem índice publicado (dados de antes dele), não se pede nada: a
        // reta continua a ser o desenho, e a consola fica limpa.
        const existem = await comTracado(regiao);
        if (!existem?.has(indice)) return null;
        const r = await fetch(enderecoDosDados(regiao, `percursos/${indice}.json`));
        if (!r.ok) return null;
        const d = (await r.json()) as { linha: string; trocos: Record<string, string> };
        // O FICHEIRO DIZ DE QUE LINHA É, e confere-se. Os ficheiros são
        // nomeados pelo índice da linha na grelha, e um índice de outra
        // construção aponta para a linha errada — o que daria um autocarro
        // desenhado por cima do percurso de outro. Se não bater, desenha-se a
        // direito, que é o que já estava lá.
        if (d.linha !== rede.grelha.linhas[indice]?.[0]) return null;
        return d.trocos;
      } catch {
        return null;
      }
    })();
    percursos.set(chave, p);
  }
  return p;
}

/**
 * Troca a linha reta pelo traçado da estrada, onde ele existir.
 *
 * Corre depois de a viagem estar calculada, e não durante: o cálculo é
 * síncrono e instantâneo, e esperar por um pedido de rede para mostrar as
 * horas seria trocar a coisa depressa pela coisa bonita. Primeiro as horas,
 * depois o desenho.
 */
async function comEstradas(regiao: string, rede: Rede, its: Itinerario[]): Promise<Itinerario[]> {
  const linhas = new Set<number>();
  for (const it of its) for (const l of it.legs) if (l.traco) linhas.add(l.traco.linha);
  if (!linhas.size) return its;

  const tabela = new Map<number, Record<string, string> | null>();
  await Promise.all(
    [...linhas].map(async (n) => tabela.set(n, await percursosDaLinha(regiao, rede, n))),
  );
  for (const it of its) {
    for (const l of it.legs) {
      const trocos = l.traco && tabela.get(l.traco.linha);
      if (!l.traco || !trocos) continue;
      const pol = percursoDaPerna(rede, l.traco, trocos, descodificarLinha);
      if (pol) {
        l.legGeometry = { points: pol };
        l.aproximado = false;
      }
    }
  }
  return its;
}

/** De onde para onde. A mesma forma, venha de onde vier. */
export async function planear(
  regiao: string,
  de: { nome: string; lat: number; lon: number },
  para: { nome: string; lat: number; lon: number },
  data: string,
  hora: string,
  modo: Modo = 'transporte',
  /** Os módulos que o painel desligou nesta região — as linhas deles não se propõem. */
  semModos: readonly string[] = [],
  /** O endereço do motor, quando esta região tem um. */
  motor = '',
): Promise<Itinerario[]> {
  if (motor)
    return semRepetidas(
      (await planearComMotor(motor, de, para, data, hora, modo)).map(limparPernas),
    );

  const rede = await redeDe(regiao, semModos);
  if (!rede) throw new Error('sem horários para esta região');
  if (modo !== 'transporte') return [];
  const its = await comEstradas(regiao, rede, planearLocal(rede, de, para, data, hora, 5));
  return semRepetidas(its.map(limparPernas));
}

/**
 * A PRÓXIMA LIGAÇÃO, quando a janela pedida não tem nenhuma (P2-003).
 *
 * O laço dos dias está em `procurarNosDias` (`viagens.ts`), onde se testa sem
 * rede; aqui só se lhe diz como se planeia um dia.
 */
export function proximaLigacao(
  regiao: string,
  de: { nome: string; lat: number; lon: number },
  para: { nome: string; lat: number; lon: number },
  data: string,
  semModos: readonly string[] = [],
  motor = '',
  ate: string | null = null,
  dias = 7,
): Promise<{ its: Itinerario[]; dia: string } | null> {
  const serve = (its: Itinerario[]) => arrumarParaMostrar(its, { de, para }).opcoes.length > 0;
  return procurarNosDias(
    async (dia) => {
      // O DIA TODO, e não as primeiras cinco opções dele. As primeiras do dia
      // podiam ser todas voltas de madrugada — o expresso das quatro e meia
      // para a capital — e a carreira direta do meio-dia nem chegava a ser
      // vista. Pergunta-se outra vez a partir da última que veio, até haver
      // uma que sirva ou o dia acabar. As horas são as do relógio de quem
      // pergunta, como as da procura que trouxe aqui.
      let hora = '00:00';
      let its: Itinerario[] = [];
      for (let vez = 0; vez < 4; vez++) {
        its = await planear(regiao, de, para, dia, hora, 'transporte', semModos, motor);
        if (!its.length || serve(its)) return its;
        const seguinte = new Date(Math.max(...its.map((it) => it.startTime)) + 60_000);
        if (dataDoCampo(seguinte) !== dia) break;
        hora = horaDoRelogio(seguinte);
      }
      return its;
    },
    data,
    ate,
    dias,
    // Um dia conta quando tem uma opção que não é uma volta.
    serve,
  );
}
