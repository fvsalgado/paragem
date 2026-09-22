'use client';

import { useId, useMemo, useRef, useState } from 'react';

// O `Ponto` é o do `formato.ts`, e não um local com os campos que davam
// jeito aqui. Dois tipos com o mesmo nome e campos diferentes divergem, e
// a divergência aparece como um ponto que o mapa abre e a procura não.
export type { Ponto } from '@/lib/formato';
import type { Ponto } from '@/lib/formato';
import { enderecoDosDados } from '@/lib/dados-do-navegador';

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

export default function EscolherPonto({
  etiqueta,
  sugestao,
  pontos,
  valor,
  aoEscolher,
  descricao,
  regiao,
  opcaoEspecial,
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
  pontos: Ponto[];
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
  className?: string;
}) {
  const id = useId();
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
  const [valorAnterior, setValorAnterior] = useState(valor);
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (valor) {
      setTexto(valor.nome);
      setAberto(false);
      setActivo(-1);
    }
  }

  // OS SÍTIOS DO OPENSTREETMAP CHEGAM À PRIMEIRA TECLA, não com a página.
  //
  // São 28 mil contra 2 419 paragens: trazê-los ao abrir multiplicava por dez
  // o que o telemóvel descarrega, e quem só quer ver o mapa não escreve nada.
  // Assim, quem procura paga um pedido; quem não procura não paga nada.
  //
  // Enquanto não chegam, a procura responde com as paragens — que é melhor do
  // que uma caixa que não responde enquanto espera.
  const [sitios, setSitios] = useState<Ponto[] | null>(null);
  const aPedir = useRef(false);

  function pedirSitios() {
    if (aPedir.current || sitios || !regiao) return;
    aPedir.current = true;
    fetch(enderecoDosDados(regiao, `sitios.json`))
      .then((r) => (r.ok ? r.json() : { sitios: [] }))
      .then((d: { sitios: [string, number, number, string, string][] }) =>
        setSitios(
          (d.sitios ?? []).map(([nome, lat, lon, tipo, classe]) => ({
            nome,
            lat,
            lon,
            tipo: 'sitio',
            id: '',
            concelho: '',
            descricao: tipo,
            classe,
          })),
        ),
      )
      .catch(() => setSitios([]));
  }

  const resultados = useMemo(() => {
    const q = simples(texto);
    // Com o campo vazio há uma coisa a mostrar: a opção especial. Sem ela, um
    // campo vazio não tem lista nenhuma para abrir.
    if (q.length < 2) return opcaoEspecial && q.length === 0 ? [opcaoEspecial] : [];
    // Quem começa pelo que se escreveu primeiro: a terra antes da «Estrada
    // da» terra. É a ordem que quem escreve espera.
    //
    // E as PARAGENS antes dos sítios: quem escreve numa aplicação de
    // transportes e escolhe o nome de uma terra quer ir para lá, não para a
    // pastelaria com o mesmo nome. O sítio continua na lista, mais abaixo.
    const universo: Ponto[] = sitios ? [...pontos, ...sitios] : pontos;

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
    if (palavras.length === 0) return [];
    const especial =
      opcaoEspecial && palavras.every((w) => simples(opcaoEspecial.nome).includes(w))
        ? [opcaoEspecial]
        : [];

    const comeca: Ponto[] = [];
    const todas: Ponto[] = [];
    for (const p of universo) {
      const n = simples(p.nome);
      // O TIPO também conta: quem escreve «farmácia» quer as farmácias, e há
      // farmácias cujo nome não tem a palavra.
      const procuravel = p.descricao ? `${n} ${simples(p.descricao)}` : n;
      if (n.startsWith(q)) comeca.push(p);
      else if (palavras.every((w) => procuravel.includes(w))) todas.push(p);
      if (comeca.length + todas.length >= 80) break;
    }

    // As paragens e as estações antes dos sítios: quem escreve numa aplicação
    // de transportes e escolhe o nome de uma terra quer ir para lá, não para a
    // pastelaria com o mesmo nome. O sítio continua na lista, mais abaixo.
    const peso = (p: Ponto) => (p.tipo === 'paragem' ? 0 : p.tipo === 'estacao' ? 1 : 2);
    comeca.sort((a, b) => peso(a) - peso(b));
    todas.sort((a, b) => peso(a) - peso(b) || a.nome.length - b.nome.length);
    return [...especial, ...semRepetir([...comeca, ...todas])].slice(0, 12);
  }, [texto, pontos, sitios, opcaoEspecial]);

  function escolher(p: Ponto) {
    aoEscolher(p);
    setTexto(p.nome);
    setAberto(false);
    setActivo(-1);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
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
          // pedido dos sítios, e só quem procura o paga.
          pedirSitios();
          setTexto(e.target.value);
          setAberto(true);
          setActivo(-1);
          aoEscolher(null);
        }}
        onKeyDown={aoTeclar}
        onFocus={() => opcaoEspecial && setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
      />

      {/* A lista aparecer em silêncio é a lista não existir para quem não a vê. */}
      <p aria-live="polite" className="so-para-leitores">
        {texto.length >= 2
          ? `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`
          : ''}
      </p>

      <ul
        id={`${id}-lista`}
        role="listbox"
        aria-label={`Resultados para ${etiqueta.toLowerCase()}`}
        hidden={!aberto || resultados.length === 0}
        className="sugestoes"
      >
        {resultados.map((p, i) => (
          <li
            key={`${p.nome}-${p.lat}`}
            id={`${id}-op-${i}`}
            role="option"
            aria-selected={i === activo}
            className={i === activo ? 'activo' : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              escolher(p);
            }}
          >
            {p.nome}
            {/* O que é, por baixo do nome — é o que distingue dois sítios com
                o mesmo nome, e a diferença entre uma lista de nomes e uma
                lista de respostas. */}
            {p.tipo === 'estacao' && <span className="secundario"> · comboio</span>}
            {p.tipo === 'paragem' && <span className="secundario"> · paragem</span>}
            {p.descricao && <span className="secundario"> · {p.descricao}</span>}
          </li>
        ))}
      </ul>
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
