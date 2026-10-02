'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Distintivo from './Distintivo';

// O `Ponto` é o do `formato.ts`, e não um local com os campos que davam
// jeito aqui. Dois tipos com o mesmo nome e campos diferentes divergem, e
// a divergência aparece como um ponto que o mapa abre e a procura não.
export type { Ponto } from '@/lib/formato';
import type { Ponto } from '@/lib/formato';
import type { PontosNoNavegador } from '@/lib/pontos-do-navegador';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { aUmaLetra } from '@/lib/letras';

/**
 * Escolher de onde e para onde, a escrever.
 *
 * Segue o padrão de combobox das práticas de ARIA, e não um `<div>` com um
 * `onClick`: quem usa leitor de ecrã precisa de saber que há uma lista, quantos
 * resultados tem, e onde está dentro dela. Nada disso se infere de um `div`.
 *
 * O que isso implica, em concreto:
 * - `role="combobox"` com `aria-expanded` e `aria-controls` no campo;
 * - `aria-activedescendant` a apontar à opção que as setas percorrem — o foco
 *   NÃO sai do campo, senão quem escreve perde o sítio onde estava;
 * - uma região viva que anuncia quantos resultados há, porque a lista aparecer
 *   em silêncio é a lista não existir para quem não a vê;
 * - Escape fecha, Enter escolhe, e clicar fora não escolhe nada à sorte.
 */
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
 */
const PERTO_M = 150;

function semRepetir(lista: Ponto[]): Ponto[] {
  const ficam: Ponto[] = [];
  for (const p of lista) {
    const n = simples(p.nome);
    const repetido = ficam.some((q) => simples(q.nome) === n && metros(p, q) < PERTO_M);
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

/**
 * O QUE CADA RESULTADO É, por baixo do nome — para TODOS os tipos (P2-007).
 *
 * Só as paragens e as estações levavam rótulo, e as docas de bicicletas
 * apareciam nuas no meio delas: «Estação Rodoviária», sem mais, lia-se como a
 * estação dos autocarros, e quem a escolhia ia parar a uma doca. O rótulo é o
 * que distingue dois resultados — e é a razão de haver rótulos.
 */
const ROTULO_DO_TIPO: Record<string, string> = {
  paragem: 'paragem',
  estacao: 'comboio',
  bicicleta: 'bicicletas partilhadas',
  taxi: 'praça de táxi',
  expresso: 'expresso',
  'urbano-municipal': 'urbano municipal',
  'a-pedido': 'transporte a pedido',
  linha: 'linha',
};

/** As classes do OpenStreetMap que são terras — o que se escreve primeiro. */
const TERRAS = new Set(['place=city', 'place=town', 'place=village', 'place=hamlet']);

/** Uma linha da rede, tal como o `linhas.json` a publica. */
type LinhaDaRede = { id: string; codigo: string; nome: string; cor?: string | null };

export default function EscolherPonto({
  etiqueta,
  sugestao,
  pontos,
  aoPrecisarDosPontos,
  aoTentarDeNovo,
  valor,
  aoEscolher,
  descricao,
  regiao,
  opcaoEspecial,
  linhas = false,
  className,
}: {
  etiqueta: string;
  /**
   * O texto fantasma dentro da caixa.
   *
   * A etiqueta continua a existir e continua a ser lida — um `placeholder`
   * não é uma etiqueta: desaparece mal se escreve a primeira letra, e quem
   * volta ao campo a meio já não sabe o que lá ia pôr. Isto é um ACRESCENTO
   * para quem vê a caixa a flutuar sobre o mapa sem nada escrito.
   */
  sugestao?: string;
  /**
   * As paragens, estações e pontos dos modos — `null` enquanto não chegaram, e
   * `falhou` quando não chegaram de todo. Já não vêm com a página (P3-006):
   * são um ficheiro à parte, pedido depois de ela se pintar.
   */
  pontos: PontosNoNavegador;
  /**
   * Chamado à primeira tecla, para quem só pede os pontos quando alguém vai
   * procurar — a caixa de «A rede» não paga o ficheiro a quem não escreve.
   */
  aoPrecisarDosPontos?: () => void;
  /** Volta a pedir os pontos que não chegaram. */
  aoTentarDeNovo?: () => void;
  valor: Ponto | null;
  aoEscolher: (p: Ponto | null) => void;
  descricao?: string;
  /** Sem isto a procura fica só com as paragens — e nunca com os sítios. */
  regiao?: string;
  /**
   * UMA OPÇÃO QUE VEM SEMPRE À FRENTE, mesmo com o campo vazio.
   *
   * É onde vive «A minha localização», e é o sítio certo para ela: no Maps
   * não há um botão ao lado do campo, há uma primeira sugestão dentro dele.
   * Quem carrega está a pedir a localização com as próprias mãos — que é a
   * única forma como este sítio alguma vez a pede.
   */
  opcaoEspecial?: Ponto;
  /**
   * AS LINHAS TAMBÉM SE PROCURAM, e escolher uma abre a página dela (P2-019).
   * O número da linha é o que está escrito no autocarro e no poste, e é por
   * ele que muita gente procura; «1001» não devolvia nada. Só na caixa de
   * procura — num campo de «De» ou «Para» ninguém vai para uma linha.
   */
  linhas?: boolean;
  className?: string;
}) {
  const id = useId();
  const router = useRouter();
  const [texto, setTexto] = useState(valor?.nome ?? '');
  const [aberto, setAberto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const campo = useRef<HTMLInputElement>(null);

  // O campo tem texto próprio — o que se está a escrever — mas o `valor` pode
  // mudar DE FORA: é o que o botão «trocar de e para» faz. Sem isto, o botão
  // trocava o estado e o campo continuava a mostrar o que estava lá antes.
  // Um botão que diz que troca e não troca é pior do que não haver botão.
  //
  // É o padrão que o React recomenda para ajustar estado quando uma prop muda:
  // compara-se durante a renderização, sem `useEffect`, e volta a renderizar
  // logo a seguir em vez de piscar o valor errado no ecrã.
  //
  // E O VAZIO TAMBÉM VEM DE FORA. Trocar com um dos lados por preencher manda
  // `null` a um campo que tinha um nome — e o campo continuava a mostrá-lo: os
  // dois lados com o mesmo nome, um deles vazio por dentro, e o leitor de ecrã
  // a ler o nome que lá não está. O único `null` que não apaga o texto é o
  // que o PRÓPRIO campo manda quando se começa a escrever — esse é o texto
  // novo a chegar, e apagá-lo comia a primeira letra.
  //
  // A marca liga-se no `onChange` e desliga-se depois de cada renderização
  // assente; durante a renderização só se lê.
  const limpeiEu = useRef(false);
  useEffect(() => {
    limpeiEu.current = false;
  });
  const [valorAnterior, setValorAnterior] = useState(valor);
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (valor) {
      setTexto(valor.nome);
      setAberto(false);
      setActivo(-1);
    } else if (!limpeiEu.current) {
      setTexto('');
      setAberto(false);
      setActivo(-1);
    }
  }

  // OS SÍTIOS DO OPENSTREETMAP CHEGAM À PRIMEIRA TECLA, não com a página.
  //
  // São 28 mil contra 2 419 paragens: trazê-los ao abrir multiplicava por dez
  // o que o telemóvel descarrega, e quem só quer ver o mapa não escreve nada.
  // Assim, quem procura paga um pedido; quem não procura não paga nada. Com
  // eles vêm os nomes dos concelhos — para separar dois sítios com o mesmo
  // nome — e, na caixa de procura, as linhas.
  const [sitios, setSitios] = useState<Ponto[] | null>(null);
  const [concelhos, setConcelhos] = useState<Record<string, string>>({});
  const [daRede, setDaRede] = useState<LinhaDaRede[]>([]);
  const aPedir = useRef(false);

  function pedirSitios() {
    if (aPedir.current || sitios || !regiao) return;
    aPedir.current = true;
    fetch(enderecoDosDados(regiao, `sitios.json`))
      .then((r) => (r.ok ? r.json() : { sitios: [] }))
      .then((d: { campos?: string[]; sitios: unknown[][] }) => {
        // Pelos CAMPOS que o ficheiro declara, e não pela posição: um
        // ficheiro de antes do concelho não o traz, e continua a servir.
        const campos = d.campos ?? ['nome', 'lat', 'lon', 'tipo', 'classe'];
        const i = (nome: string) => campos.indexOf(nome);
        setSitios(
          (d.sitios ?? []).map((s) => ({
            nome: String(s[i('nome')] ?? ''),
            lat: Number(s[i('lat')]),
            lon: Number(s[i('lon')]),
            tipo: 'sitio',
            id: '',
            concelho: i('concelho') >= 0 ? String(s[i('concelho')] ?? '') : '',
            descricao: String(s[i('tipo')] ?? ''),
            classe: String(s[i('classe')] ?? ''),
          })),
        );
      })
      .catch(() => setSitios([]));
    fetch(enderecoDosDados(regiao, 'concelhos.json'))
      .then((r) => (r.ok ? r.json() : []))
      .then((cs: { id: string; nome: string }[]) =>
        setConcelhos(Object.fromEntries((cs ?? []).map((c) => [c.id, c.nome]))),
      )
      .catch(() => {});
    if (linhas) {
      fetch(enderecoDosDados(regiao, 'linhas.json'))
        .then((r) => (r.ok ? r.json() : []))
        .then((ls: LinhaDaRede[]) => setDaRede(Array.isArray(ls) ? ls : []))
        .catch(() => {});
    }
  }

  const { resultados, parecidos } = useMemo(() => {
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
    const conhecidos = Array.isArray(pontos) ? pontos : [];
    const universo: Ponto[] = sitios ? [...conhecidos, ...sitios] : conhecidos;

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
    for (const p of universo) {
      const n = simples(p.nome);
      // O TIPO também conta: quem escreve «farmácia» quer as farmácias, e há
      // farmácias cujo nome não tem a palavra.
      const procuravel = p.descricao ? `${n} ${simples(p.descricao)}` : n;
      if (n === q && peso(p) <= 2) exatos.push(p);
      else if (n.startsWith(q)) comeca.push(p);
      else if (palavras.every((w) => procuravel.includes(w))) todas.push(p);
      if (exatos.length + comeca.length + todas.length >= 80) break;
    }

    exatos.sort((a, b) => peso(a) - peso(b));
    comeca.sort((a, b) => peso(a) - peso(b));
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
        (a, b) =>
          notas.get(a)! - notas.get(b)! || peso(a) - peso(b) || a.nome.length - b.nome.length,
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
  }, [texto, pontos, sitios, opcaoEspecial, linhas, daRede]);

  /**
   * DOIS SÍTIOS COM O MESMO NOME DIZEM DE QUE CONCELHO SÃO (P2-037). O mesmo
   * «<nome> · lugar», duas vezes, a 37 km uma da outra: não havia como saber
   * qual era qual, nem antes de escolher nem depois.
   */
  const repetidos = useMemo(() => {
    const vezes = new Map<string, number>();
    for (const p of resultados) vezes.set(simples(p.nome), (vezes.get(simples(p.nome)) ?? 0) + 1);
    return new Set([...vezes].filter(([, n]) => n > 1).map(([nome]) => nome));
  }, [resultados]);

  function escolher(p: Ponto) {
    if (p.tipo === 'linha') {
      // Uma linha não é um sítio: abre-se a página dela, com o horário.
      setAberto(false);
      router.push(`/rede/linhas/${p.id.replace(/[^a-zA-Z0-9\-_]/g, '-')}/`);
      return;
    }
    aoEscolher(p);
    setTexto(p.nome);
    setAberto(false);
    setActivo(-1);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // Uma lista aberta fecha-se, e a tecla fica gasta: quem está por fora
      // (o mapa, que fecha o cartão com o Esc) não fecha mais nada por ela.
      if (aberto && resultados.length) e.preventDefault();
      setAberto(false);
      setActivo(-1);
      return;
    }
    if (!resultados.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setActivo((i) => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAberto(true);
      setActivo((i) => (i <= 0 ? resultados.length - 1 : i - 1));
    } else if (e.key === 'Enter' && aberto && activo >= 0) {
      e.preventDefault();
      escolher(resultados[activo]);
    }
  }

  // NADA ENCONTRADO DIZ-SE, À VISTA (P2-006). A lista simplesmente não abria
  // — nem «sem resultados», nem a explicação de que a procura só conhece o
  // que é desta região. Quem escreve e não vê nada acontecer conclui que o
  // sítio está avariado. Só depois de os sítios E as paragens chegarem:
  // antes disso, o «nada» podia ser só «ainda não».
  const escreveu = simples(texto).length >= 2;
  const procurou = escreveu && (!regiao || sitios !== null) && Array.isArray(pontos);
  const nada = procurou && resultados.length === 0 && !(valor && valor.nome === texto);
  // AS PARAGENS QUE NÃO CHEGARAM NÃO SÃO «NADA COM ESSE NOME». Sem rede, a
  // procura dizia que não havia o que não pôde ver (P3-022).
  const semPontos = escreveu && pontos === 'falhou' && resultados.length === 0;
  const aEspera = escreveu && pontos === null && resultados.length === 0;

  return (
    <div className={className ? `escolher ${className}` : 'escolher'}>
      <label htmlFor={`${id}-campo`}>{etiqueta}</label>
      {descricao && (
        <p id={`${id}-desc`} className="secundario" style={{ margin: '0 0 0.25rem' }}>
          {descricao}
        </p>
      )}
      <input
        id={`${id}-campo`}
        ref={campo}
        type="text"
        role="combobox"
        placeholder={sugestao}
        autoComplete="off"
        // UM NOME DE PARAGEM NÃO É PROSA, e o corretor do telemóvel trata-o
        // como se fosse: «Sabacheira» ganha um sublinhado vermelho, «Pêro
        // Filho» vira «Pero Filho» à segunda letra e a primeira maiúscula
        // entra sozinha em cima de quem estava a escrever «da Ponte». O campo
        // é uma caixa de procura sobre uma lista fechada de nomes próprios —
        // quem corrige é a lista, não o teclado.
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        aria-expanded={aberto && resultados.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        aria-describedby={descricao ? `${id}-desc` : undefined}
        aria-activedescendant={activo >= 0 ? `${id}-op-${activo}` : undefined}
        value={texto}
        onChange={(e) => {
          // À PRIMEIRA TECLA, e não ao carregar a página: é aqui que se paga o
          // pedido dos sítios, e só quem procura o paga. O das paragens também,
          // onde quem usa a caixa ainda não o fez.
          pedirSitios();
          if (pontos === null) aoPrecisarDosPontos?.();
          setTexto(e.target.value);
          setAberto(true);
          setActivo(-1);
          limpeiEu.current = true;
          aoEscolher(null);
        }}
        onKeyDown={aoTeclar}
        onFocus={() => opcaoEspecial && setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
      />

      {/* O QUE SE ABRE POR BAIXO DO CAMPO, junto: a frase, a nota e a lista.
          Junto para poder descer como uma peça só — na cápsula do mapa desce
          por baixo dela, em vez de a esticar. */}
      <div className="sugestoes-caixa">
        {/* A lista aparecer em silêncio é a lista não existir para quem não a
          vê. E o «nada» lê-se também à vista: é a mesma frase. */}
        <p
          aria-live="polite"
          className={
            (nada || semPontos || aEspera) && aberto ? 'sem-resultados' : 'so-para-leitores'
          }
        >
          {semPontos
            ? 'Não foi possível carregar as paragens — pode ser da ligação à Internet.'
            : aEspera
              ? 'A carregar as paragens…'
              : nada
                ? `Nada com «${texto.trim()}» aqui. A procura conhece as paragens, as estações${
                    linhas ? ', as linhas' : ''
                  } e os sítios desta região.`
                : texto.trim().length >= 2 || (texto.trim().length === 1 && resultados.length > 0)
                  ? `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}${
                      parecidos ? ' com um nome parecido' : ''
                    }`
                  : ''}
        </p>

        {semPontos && aberto && aoTentarDeNovo && (
          <p className="sugestoes-nota">
            <button type="button" className="botao secundario" onClick={aoTentarDeNovo}>
              Tentar de novo
            </button>
          </p>
        )}
        {/* Quando o que se mostra é PARECIDO e não igual, diz-se — fora da
          lista, que só pode ter opções. */}
        {parecidos && aberto && resultados.length > 0 && (
          <p className="sugestoes-nota secundario">Nomes parecidos com «{texto.trim()}»:</p>
        )}
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label={`Resultados para ${etiqueta.toLowerCase()}`}
          hidden={!aberto || resultados.length === 0}
          className="sugestoes"
        >
          {resultados.map((p, i) => (
            <li
              key={`${p.tipo}-${p.id}-${p.nome}-${p.lat}`}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? 'activo' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(p);
              }}
            >
              {p.tipo === 'linha' && (
                <Distintivo codigo={p.descricao ?? ''} cor={p.classe || null} />
              )}
              {p.tipo === 'linha' ? ' ' : ''}
              {p.nome}
              {/* O que é, por baixo do nome — é o que distingue dois sítios com
                o mesmo nome, e a diferença entre uma lista de nomes e uma
                lista de respostas. */}
              {p.tipo !== 'aqui' && (
                <span className="secundario">
                  {' '}
                  ·{' '}
                  {p.tipo === 'sitio' ? p.descricao || 'sítio' : (ROTULO_DO_TIPO[p.tipo] ?? p.tipo)}
                  {repetidos.has(simples(p.nome)) && concelhos[p.concelho]
                    ? ` · ${concelhos[p.concelho]}`
                    : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Aparecem em metade dos topónimos portugueses e não distinguem nada. */
const ARTIGOS = new Set([
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

function simples(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}
