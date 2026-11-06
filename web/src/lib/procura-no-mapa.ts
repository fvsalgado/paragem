import type { Ponto } from './formato.ts';
import { aUmaLetra } from './letras.ts';

/**
 * A PROCURA DA CAIXA DO MAPA E DOS CAMPOS «DE» E «PARA» (`EscolherPonto.tsx`),
 * sem React: o que se escreveu entra, as respostas saem, pela ordem em que se
 * mostram. Está aqui para se poder testar com dados inventados — a ordem das
 * respostas é a parte da caixa que mais se parte, e numa região real
 * partiu-se duas vezes sem que nenhum teste desse por isso
 * (`tests/procura-no-mapa.test.mts`).
 */

/** Uma linha da rede, tal como o `linhas.json` a publica. */
export type LinhaDaRede = { id: string; codigo: string; nome: string; cor?: string | null };

/** Quantos resultados que não são o nome exato chegam para ordenar e mostrar doze. */
const QUANTOS_BASTAM = 80;

/**
 * O MESMO SÍTIO ESCRITO DUAS VEZES É UMA ESCOLHA QUE NINGUÉM SABE FAZER.
 *
 * O terminal de uma cidade é a paragem da rede e é o cais dos expressos, a
 * dezanove metros um do outro — o mesmo passeio, o mesmo nome. Na lista
 * apareciam duas linhas idênticas, e quem escolhesse a de baixo ia parar à
 * página dos expressos quando queria as horas dos autocarros.
 *
 * Fica a PRIMEIRA, e a ordem já foi decidida acima: paragens, depois
 * estações, depois o resto. Exige o mesmo nome E a mesma vizinhança — há
 * «Igreja» em nove freguesias, e essas são mesmo nove respostas.
 *
 * E EXIGE A MESMA COISA. Juntava tudo o que tivesse o nome e a vizinhança, e
 * numa região real a estação de comboio de uma cidade sumia da procura: há
 * uma paragem com o mesmo nome a 125 m, e a paragem vinha primeiro. Quem
 * escreve o nome da cidade quer o comboio, a paragem e a cidade, e são três
 * respostas. Só se juntam duas do mesmo tipo — e a paragem com o cais dos
 * expressos, que é o mesmo passeio (`mesmaCoisa`).
 */
const PERTO_M = 150;

/** Uma paragem e o cais dos expressos com o mesmo nome são o mesmo passeio. */
const doPasseio = (tipo: string) => (tipo === 'expresso' ? 'paragem' : tipo);
const mesmaCoisa = (a: Ponto, b: Ponto) => doPasseio(a.tipo) === doPasseio(b.tipo);

export function semRepetir(lista: Ponto[]): Ponto[] {
  const ficam: Ponto[] = [];
  for (const p of lista) {
    const n = simples(p.nome);
    const repetido = ficam.some(
      (q) => mesmaCoisa(p, q) && simples(q.nome) === n && metros(p, q) < PERTO_M,
    );
    if (!repetido) ficam.push(p);
  }
  return ficam;
}

/** Equirretangular. A 150 metros, a curvatura da Terra não se nota. */
function metros(a: Ponto, b: Ponto): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6_371_000;
}

/** As classes do OpenStreetMap que são terras — o que se escreve primeiro. */
export const TERRAS = new Set(['place=city', 'place=town', 'place=village', 'place=hamlet']);

/**
 * AS RESPOSTAS A UMA PROCURA, pela ordem em que se mostram — doze, no máximo —
 * e se são PARECIDAS (nenhuma tem o que se escreveu, e estas estão a uma letra).
 */
export function procurarPontos({
  texto,
  pontos,
  sitios,
  opcaoEspecial,
  linhas = false,
  daRede = [],
}: {
  texto: string;
  /** As paragens, as estações e os pontos dos modos. */
  pontos: readonly Ponto[];
  /** Os sítios do OpenStreetMap, quando já chegaram. */
  sitios: readonly Ponto[] | null;
  opcaoEspecial?: Ponto;
  /** Se esta caixa também procura linhas. */
  linhas?: boolean;
  daRede?: readonly LinhaDaRede[];
}): { resultados: Ponto[]; parecidos: boolean } {
  const q = simples(texto);
  // UM NÚMERO SÓ PROCURA-SE, quando a caixa conhece as linhas: a linha 1
  // escreve-se com um algarismo, e a procura só começava ao segundo.
  const numeroDeLinha = !!linhas && /^\d{1,4}$/.test(q);
  // Com o campo vazio há uma coisa a mostrar: a opção especial. Sem ela, um
  // campo vazio não tem lista nenhuma para abrir.
  if (q.length < 2 && !numeroDeLinha)
    return {
      resultados: opcaoEspecial && q.length === 0 ? [opcaoEspecial] : [],
      parecidos: false,
    };
  const universo: readonly Ponto[] = sitios ? [...pontos, ...sitios] : pontos;

  // AS PALAVRAS PODEM VIR EM QUALQUER ORDEM, e isto é o que faz a caixa
  // deixar de parecer avariada.
  //
  // Quem escreve «hospital» e o nome da cidade está a dizer o nome que usa,
  // não o que está no OpenStreetMap — que ali traz o santo, o traço e o
  // centro hospitalar todo por extenso. Uma procura por pedaço contíguo
  // devolve ZERO sobre um dado que tem as duas palavras lá dentro.
  //
  // Os artigos saem da pergunta: «de», «da», «dos» aparecem em metade dos
  // topónimos portugueses e não distinguem nada.
  const palavras = q.split(/\s+/).filter((w) => w.length > 1 && !ARTIGOS.has(w));

  // AS LINHAS, pelo número ou pelo nome: «11», «circular».
  const dasLinhas: Ponto[] = linhas
    ? daRede
        .filter((l) => {
          const codigo = simples(l.codigo);
          const nome = simples(l.nome);
          return (
            codigo === q ||
            (palavras.length > 0 && palavras.every((w) => `${codigo} ${nome}`.includes(w)))
          );
        })
        .sort((a, b) => Number(simples(b.codigo) === q) - Number(simples(a.codigo) === q))
        .slice(0, 4)
        .map((l) => ({
          nome: l.nome,
          lat: NaN,
          lon: NaN,
          tipo: 'linha',
          id: l.id,
          concelho: '',
          descricao: l.codigo,
          classe: l.cor ?? '',
        }))
    : [];
  if (palavras.length === 0) return { resultados: dasLinhas, parecidos: false };
  const especial =
    opcaoEspecial && palavras.every((w) => simples(opcaoEspecial.nome).includes(w))
      ? [opcaoEspecial]
      : [];

  // Paragens e estações antes dos sítios: quem escreve numa aplicação de
  // transportes quer ir para lá, não para a pastelaria com o mesmo nome.
  // Entre os sítios, as terras antes do resto.
  const peso = (p: Ponto) =>
    p.tipo === 'paragem'
      ? 0
      : p.tipo === 'estacao'
        ? 1
        : p.tipo === 'sitio' && TERRAS.has(p.classe ?? '')
          ? 2
          : p.tipo === 'sitio'
            ? 4
            : 3;

  // O NOME EXATO PRIMEIRO (P2-008) — de uma paragem, de uma estação ou de
  // uma TERRA. Quem escreve o nome de uma terra quer a terra: escrevia-se o
  // nome da cidade, tal e qual, e ela não aparecia entre os doze primeiros —
  // a lista enchia-se de paragens que começavam por ele e de docas de
  // bicicletas. O café que se chame exatamente assim não salta à frente: vai
  // com os que começam pelo nome, depois das paragens.
  const exatos: Ponto[] = [];
  const comeca: Ponto[] = [];
  const todas: Ponto[] = [];
  //
  // O NOME EXATO PROCURA-SE NO UNIVERSO TODO, e o resto até ter que chegue.
  // Parava tudo aos 80 resultados, e os sítios vêm no fim do universo, depois
  // das paragens: numa região real, o nome de uma cidade enchia os 80 com as
  // paragens que começam por ele, e a cidade — o nome exato — nunca era vista.
  for (const p of universo) {
    const n = simples(p.nome);
    if (n === q && peso(p) <= 2) {
      exatos.push(p);
      continue;
    }
    if (comeca.length + todas.length >= QUANTOS_BASTAM) continue;
    // O TIPO também conta: quem escreve «farmácia» quer as farmácias, e há
    // farmácias cujo nome não tem a palavra.
    const procuravel = p.descricao ? `${n} ${simples(p.descricao)}` : n;
    if (n.startsWith(q)) comeca.push(p);
    else if (palavras.every((w) => procuravel.includes(w))) todas.push(p);
  }

  // ENTRE IGUAIS, A MAIS SERVIDA PRIMEIRO. «Santuário» dava à cabeça a
  // paragem de aldeia com o nome escrito por extenso, e não a do santuário
  // que toda a gente procura; quem escreve o princípio de um nome quer, na
  // dúvida, o sítio de onde parte mais gente.
  const servida = (a: Ponto, b: Ponto) => (b.partidas ?? 0) - (a.partidas ?? 0);
  exatos.sort((a, b) => peso(a) - peso(b) || servida(a, b));
  comeca.sort((a, b) => peso(a) - peso(b) || servida(a, b));
  todas.sort((a, b) => peso(a) - peso(b) || a.nome.length - b.nome.length);
  let achados = semRepetir([...exatos, ...comeca, ...todas]);
  // Onde acaba cada grupo, depois de tirar as repetições — que só tiram o
  // que vem DEPOIS, e por isso cada grupo continua a ser um prefixo.
  const nExatos = semRepetir(exatos).length;
  const nComeca = semRepetir([...exatos, ...comeca]).length;

  // UMA LETRA TROCADA NÃO É UM SÍTIO QUE NÃO EXISTE (P2-006). O nome de
  // uma cidade com uma letra a menos não devolvia nada, e a lista nem
  // abria. Só quando a procura exata não acha nada, e só nas palavras de
  // cinco letras ou mais — abaixo disso uma letra trocada já é outra palavra.
  //
  // E O MAIS PARECIDO PRIMEIRO. Por ordem, o que se aceita e quanto vale:
  // o nome inteiro a uma letra da pergunta (0 — a cidade); uma palavra do
  // nome a uma letra (1); o princípio de uma palavra a uma letra, e com a
  // mesma primeira letra (2) — sem esta condição, «comer» de «comercial»
  // passava por uma letra trocada de qualquer nome de cinco letras, e uma
  // zona comercial vinha à frente da cidade que se queria.
  let parecidos = false;
  if (!achados.length && !dasLinhas.length && palavras.some((w) => w.length >= 5)) {
    const notas = new Map<Ponto, number>();
    for (const p of universo) {
      const nome = simples(p.nome);
      if (aUmaLetra(nome, q)) {
        notas.set(p, 0);
        continue;
      }
      const doNome = nome.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      let pior = 0;
      for (const w of palavras) {
        const nota = nome.includes(w)
          ? 0
          : w.length < 5
            ? Infinity
            : doNome.some((n) => aUmaLetra(n, w))
              ? 1
              : doNome.some((n) => n[0] === w[0] && aUmaLetra(n.slice(0, w.length), w))
                ? 2
                : Infinity;
        pior = Math.max(pior, nota);
        if (pior === Infinity) break;
      }
      if (pior !== Infinity) notas.set(p, Math.max(1, pior));
    }
    const perto = [...notas.keys()].sort(
      (a, b) => notas.get(a)! - notas.get(b)! || peso(a) - peso(b) || a.nome.length - b.nome.length,
    );
    achados = semRepetir(perto);
    parecidos = achados.length > 0;
    return { resultados: [...especial, ...achados].slice(0, 12), parecidos };
  }
  // AS LINHAS ENTRAM NO MEIO, e não à cabeça. Quem escreve o número de uma
  // linha quer a linha, e ela vem logo a seguir a um nome exato; quem
  // escreve o princípio do nome de uma terra quer a terra, e as linhas que
  // a têm no nome vêm depois das paragens que começam assim.
  const peloCodigo = dasLinhas.filter((l) => simples(l.descricao ?? '') === q);
  const peloNome = dasLinhas.filter((l) => simples(l.descricao ?? '') !== q);
  return {
    resultados: [
      ...especial,
      ...achados.slice(0, nExatos),
      ...peloCodigo,
      ...achados.slice(nExatos, nComeca),
      ...peloNome,
      ...achados.slice(nComeca),
    ].slice(0, 12),
    parecidos,
  };
}

/** Aparecem em metade dos topónimos portugueses e não distinguem nada. */
export const ARTIGOS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'a',
  'o',
  'as',
  'os',
  'em',
  'no',
  'na',
]);

export function simples(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}
