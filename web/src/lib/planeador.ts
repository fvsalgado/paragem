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
  type GrelhaCrua,
  type Rede,
  type TransbordosCrus,
} from './viagens';
import { descodificarLinha } from './otp';
import { enderecoDosDados } from './dados-do-navegador.ts';

export type { Itinerario, Modo };
export { MODOS };

/** O que uma região consegue responder, para a interface não oferecer o que não há. */
export type Capacidade = { modos: Modo[]; aPeExato: boolean; porque: string | null };

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
      try {
        const [g, t] = await Promise.all([
          fetch(enderecoDosDados(regiao, `viagens.json`)).then((r) => (r.ok ? r.json() : null)),
          fetch(enderecoDosDados(regiao, `transbordos.json`)).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!g) return null;
        // Sem transbordos ainda se responde: perde-se a mudança de autocarro,
        // não a viagem direta. É melhor do que não responder nada.
        return prepararRede(g as GrelhaCrua, (t ?? { pares: [] }) as TransbordosCrus, semModos);
      } catch {
        return null;
      }
    })();
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
  const rede = await redeDe(regiao);
  if (!rede) {
    return { modos: [], aPeExato: false, porque: 'Não há horários carregados para esta região.' };
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
 */
const percursos = new Map<string, Promise<Record<string, string> | null>>();

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
      if (pol) l.legGeometry = { points: pol };
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
  if (motor) return planearComMotor(motor, de, para, data, hora, modo);

  const rede = await redeDe(regiao, semModos);
  if (!rede) throw new Error('sem horários para esta região');
  if (modo !== 'transporte') return [];
  return comEstradas(regiao, rede, planearLocal(rede, de, para, data, hora, 5));
}
