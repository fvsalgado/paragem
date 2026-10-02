/**
 * Onde cada região responde nos testes — e QUAL DELAS está a ser testada.
 *
 * Cada região vive no seu domínio (CLAUDE.md §11.7), e nos testes os domínios
 * são `*.localhost`, que o Chromium resolve para a própria máquina sem tocar
 * no DNS. O `next start` recebe o Host, o middleware traduz-o pelo mapa que
 * `PARAGEM_DOMINIOS` declara, e cada região é um anfitrião distinto — como em
 * produção.
 *
 * O produto responde ao anfitrião que não é de ninguém: `127.0.0.1`.
 *
 * NENHUM CLIENTE ESTÁ ESCRITO AQUI, e é o ponto deste ficheiro. Uma região
 * pode viver noutra raiz (§11.6) e esta suite é pública: um teste que diga o
 * nome do território de quem nos contrata só corre onde esse contrato está —
 * e, de caminho, escreve na suite pública o que o cliente tem. Por isso a
 * região em teste DESCOBRE-SE: é a que esta raiz construiu e não é de
 * demonstração; se não houver nenhuma, é a demonstração, e os casos que
 * precisam de uma rede a sério saltam com a razão escrita (ver
 * `dados-da-regiao.ts`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const PORTA = 4321;
export const PRODUTO = `http://127.0.0.1:${PORTA}`;

/** O anfitrião de uma região, nos testes. */
export const anfitriao = (id: string) => `http://${id}.localhost:${PORTA}`;

/**
 * As duas regiões de prova são do produto, não de um cliente: inventadas de
 * fio a pavio, constroem-se sem rede e estão sempre cá (§11.5). São as únicas
 * que esta suite nomeia — para o que só elas provam (um modo ausente, um
 * módulo desligado, a vista sem mapa).
 */
export const PROVA = anfitriao('prova');
export const PROVA_MUNICIPIO = anfitriao('prova-municipio');

/** Onde estão os dados construídos — `build/`, corra isto de onde correr. */
export const BUILD = (() => {
  const candidatos = [process.env.PARAGEM_BUILD, join('..', 'build'), 'build'].filter(
    Boolean,
  ) as string[];
  return resolve(candidatos.find((c) => existsSync(c)) ?? join('..', 'build'));
})();

/**
 * As regiões que respondem nesta corrida.
 *
 * Quem manda é `PARAGEM_DOMINIOS`, porque é o que o servidor do sítio recebeu
 * — declarar uma região que ele não serve dava um 404 difícil de ler. Sem ele
 * (correr os testes à mão), são as que esta raiz construiu.
 */
export function regioes(): string[] {
  const declarado = process.env.PARAGEM_DOMINIOS;
  if (declarado) {
    return declarado
      .split(',')
      .map((p) => p.split('=')[0]?.trim())
      .filter((id): id is string => !!id);
  }
  return existsSync(BUILD)
    ? readdirSync(BUILD, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(BUILD, e.name, 'sitio', 'regiao.json')))
        .map((e) => e.name)
        .sort()
    : [];
}

/** O que a região diz de si própria, do que o pipeline construiu. */
function declaracao(id: string): { demonstracao?: boolean } | null {
  const f = join(BUILD, id, 'sitio', 'regiao.json');
  try {
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch {
    return null;
  }
}

/** Quantas paragens a região tem — é por aqui que se escolhe a demonstração mais rica. */
function quantasParagens(id: string): number {
  const f = join(BUILD, id, 'sitio', 'paragens.json');
  try {
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as unknown[]).length : 0;
  } catch {
    return 0;
  }
}

/**
 * As regiões de demonstração — PELO QUE OS DADOS DIZEM (`demonstracao: true`
 * no `regiao.yaml`), e não por uma lista escrita aqui.
 *
 * Era uma lista com as duas provas, e a terceira demonstração entrou e passou
 * a ser tratada como a «região real» da suite: os testes julgavam uma região
 * inventada como se fosse a de um cliente. Uma demonstração nova entra sem
 * tocar neste ficheiro.
 */
export const DEMONSTRACOES: string[] = regioes().filter((id) => declaracao(id)?.demonstracao);

/** O que `PARAGEM_DOMINIOS` tem de dizer para isto tudo bater certo. */
export const DOMINIOS = regioes()
  .map((id) => `${id}=${id}.localhost:${PORTA}`)
  .join(',');

/**
 * A região com dados a sério, se esta raiz tiver alguma.
 *
 * Pela PROPRIEDADE, não pelo nome: é a que está construída e não é de
 * demonstração. Num repositório só com o produto não há nenhuma, e é isso que
 * `dados-da-regiao.ts` transforma num salto com a razão escrita.
 */
export const REGIAO_REAL: string | null =
  regioes().find((id) => declaracao(id) && !DEMONSTRACOES.includes(id)) ?? null;

/**
 * A demonstração mais rica: a que tem mais paragens. É a que tem os modos
 * todos — o comboio, o transporte a pedido, o mapa —, e uma suite que corresse
 * sobre a mais pequena saltava metade dos casos por falta de dados.
 */
export const DEMONSTRACAO: string | null =
  [...DEMONSTRACOES].sort(
    (a, b) => quantasParagens(b) - quantasParagens(a) || a.localeCompare(b),
  )[0] ?? null;

/**
 * A região sobre a qual esta suite corre.
 *
 * A de dados reais quando existe — é onde há uma rede grande, nomes do
 * OpenStreetMap e horários de verdade, e é a que se publica. Senão, a
 * demonstração mais rica: o produto tem de se provar sem pedir uma linha a
 * ninguém.
 */
export const REGIAO = process.env.PARAGEM_REGIAO_DE_TESTE ?? REGIAO_REAL ?? DEMONSTRACAO ?? 'prova';
export const BASE = anfitriao(REGIAO);
