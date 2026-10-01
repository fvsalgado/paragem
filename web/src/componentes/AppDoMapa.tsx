'use client';

import { useEffect, useRef, useState } from 'react';
import Mapa, { type Marca } from '@/componentes/Mapa';
import EscolherPonto from '@/componentes/EscolherPonto';
import Direccoes, { type Percurso } from '@/componentes/Direccoes';
import { NOME_DOS_MODOS, type Partida, type Ponto } from '@/lib/formato';
import { calendarioDe, horaDoRelogio, proximas, type Calendario } from '@/lib/dias';
import ASeguir from '@/componentes/ASeguir';
import { camadasDe } from '@/lib/pontos-no-mapa';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
} from '@/componentes/DisponibilidadeBicicletas';
import Link from 'next/link';
import MenuDoMapa from '@/componentes/MenuDoMapa';
import { DoModo, Hamburguer } from '@/componentes/Icones';
import { enderecoDosDados } from '@/lib/dados-do-navegador';

/**
 * A aplicação: o mapa ocupa o ecrã, a procura flutua em cima, e tocar num
 * ponto faz subir um cartão de baixo.
 *
 * É a gramática do Google Maps, e é de propósito — quem já sabe usar aquilo
 * não devia ter de aprender isto. O que muda é o que está por baixo: horários
 * publicados, transporte a pedido, e o que é incerto dito às claras.
 *
 * **O «Como chegar» não sai daqui.** Levava a um formulário noutra página, e
 * isso é meia dúzia de segundos e uma mudança de contexto entre a pergunta e a
 * resposta; no Maps as direções sobem no mesmo sítio onde se estava. O
 * `/viagem/` continua a existir — é a ligação direta, e é o caminho de quem
 * chega de fora ou não tem mapa.
 *
 * **O que não se copia do Maps é a acessibilidade.** Nada aqui acontece só no
 * mapa: a procura é um combobox a sério, o cartão é HTML com ligações, e a
 * lista de paragens continua a existir em `/rede/`. O mapa é uma vista dos
 * dados — a melhor para quem vê, e nunca a única.
 */
const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');

/** O que sobe do fundo por cima do mapa. A folha das direções numa página própria não conta. */
const FOLHAS = '.folha-de-abertura, .cartao-de-baixo, .folha:not(.em-pagina)';

/** O que flutua no alto do mapa: a procura, a fila das camadas, o cartão de cima das direções. */
const NO_ALTO = '.app-procura, .app-camadas, .cartao-de-cima';

/**
 * A caixa do que flutua no alto — e, da fila das camadas, só o troço com pílulas.
 *
 * A fila tem a largura toda, mas é transparente e deixa passar o dedo
 * (`pointer-events: none`): o que tapa são as pílulas. Numa janela larga
 * acabam a meio, e o canto da direita não tem nada por cima; num telemóvel
 * não cabem e seguem até à borda, e aí a fila tapa-a toda.
 */
function caixaNoAlto(e: HTMLElement): DOMRect {
  const q = e.getBoundingClientRect();
  if (!e.classList.contains('app-camadas') || !e.children.length) return q;
  const fim = Math.max(...[...e.children].map((f) => f.getBoundingClientRect().right));
  return new DOMRect(q.left, q.top, Math.min(q.right, fim) - q.left, q.height);
}

/** Os dois cantos de baixo do MapLibre, e a variável que diz a cada um quanto subir. */
const CANTOS = [
  ['left', '--tapado-a-esquerda'],
  ['right', '--tapado-a-direita'],
] as const;

/**
 * O que é este ponto, por extenso.
 *
 * Oito das nove praças de táxi não têm nome no OpenStreetMap, e um cartão com
 * o título em branco não diz nada a ninguém. O rótulo do modo é a resposta
 * honesta: não se lhes inventa um nome próprio (§4.4), diz-se o que são.
 */
function rotuloDe(p: Ponto): string {
  if (p.tipo === 'paragem') return 'Paragem de autocarro';
  if (p.tipo === 'estacao') return 'Estação de comboio';
  return NOME_DOS_MODOS[p.tipo] ?? p.tipo;
}

/**
 * Para onde leva o «ver mais» de cada ponto.
 *
 * As paragens e as estações têm ficha própria no catálogo. Os outros modos não
 * têm — e não é falta: o que se sabe de uma praça de táxi ou de uma estação de
 * bicicletas está na página do modo, inteiro. Uma ligação para uma ficha que
 * não existe era pior do que não haver ligação.
 */
function paginaDe(regiao: string, p: Ponto): { href: string; texto: string } {
  if (p.tipo === 'paragem' || p.tipo === 'estacao') {
    const pasta = p.tipo === 'estacao' ? 'estacoes' : 'paragens';
    return { href: `/rede/${pasta}/${seguro(p.id)}/`, texto: 'Horário completo' };
  }
  return { href: `/modos/${seguro(p.tipo)}/`, texto: 'Ver este serviço' };
}

export default function AppDoMapa({
  regiao,
  centro,
  pontos,
  mosaicos,
  temMapa,
  nomeDaRegiao,
  deDaRegiao,
  emDaRegiao,
  modos,
  temAPedido,
  modosDesligados = [],
  motorDaRegiao = '',
  disponibilidadeDaRegiao = '',
  servicosSemDatas = 0,
}: {
  regiao: string;
  /** «Serra da Pedra Alta», sem artigo — o que o menu põe ao lado da marca. */
  nomeDaRegiao: string;
  /** «da Serra da Pedra Alta», «do Baixo Sável» — para o título do mapa. */
  deDaRegiao: string;
  /** «na Serra da Pedra Alta», «no Baixo Sável» — escrito pela região, não colado aqui. */
  emDaRegiao: string;
  centro: [number, number];
  pontos: Ponto[];
  mosaicos: string;
  temMapa: boolean;
  modos: { id: string; nome: string; href: string }[];
  temAPedido: boolean;
  /** Os módulos que o painel desligou — o planeador não propõe as linhas deles. */
  modosDesligados?: string[];
  motorDaRegiao?: string;
  disponibilidadeDaRegiao?: string;
  /** Quantos serviços ainda não têm os dias em que circulam — ver `Direccoes`. */
  servicosSemDatas?: number;
}) {
  const [menu, setMenu] = useState(false);

  // O MAPA PASSA A OCUPAR O ECRÃ TODO, e a faixa do sítio sai da frente.
  //
  // Eram 120 px de um telemóvel gastos a repetir «Paragem.pt · <a região> ·
  // Mapa» a quem já está no mapa. A navegação não desapareceu: mudou-se para
  // o menu, a um toque do canto — e continua em texto no HTML de todas as
  // outras páginas, que são as que os motores de busca leem.
  //
  // A classe vai no `body` porque o cabeçalho e o rodapé são irmãos deste
  // componente, não filhos: daqui não se lhes toca de outra maneira.
  useEffect(() => {
    document.body.classList.add('ecra-de-mapa');
    return () => document.body.classList.remove('ecra-de-mapa');
  }, []);
  const [escolhido, setEscolhido] = useState<Marca | null>(null);

  // AS CAMADAS COMEÇAM TODAS LIGADAS, e derivam do que há nos dados: uma
  // região sem bicicletas não ganha um botão que não liga a nada.
  const camadas = camadasDe(pontos.map((p) => p.tipo));
  const [visiveis, setVisiveis] = useState<Set<string>>(() => new Set(camadas.map((c) => c.tipo)));

  // A FILA DAS CAMADAS TEM DE DIZER QUE CONTINUA.
  //
  // São seis pílulas e num telemóvel cabem duas e meia. A fila desliza — e
  // deslizava em silêncio: sem barra (que tapava o mapa) e sem sinal nenhum,
  // «Táxi», «Bicicleta partilhada» e «Expresso» ficavam a existir para quem
  // calhasse arrastar ali o dedo. Quem não arrastasse concluía que o mapa não
  // tinha táxis.
  //
  // Mede-se, não se adivinha: o esbatido só aparece do lado que TEM mais, e
  // some quando se chega ao fim. Um esbatido fixo à direita mentia nas duas
  // pontas — dizia que havia mais quando já não havia.
  const fila = useRef<HTMLDivElement>(null);
  const [maisNaFila, setMaisNaFila] = useState({ antes: false, depois: false });
  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    const medir = () => {
      const folga = el.scrollWidth - el.clientWidth - el.scrollLeft;
      setMaisNaFila({ antes: el.scrollLeft > 4, depois: folga > 4 });
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => {
      el.removeEventListener('scroll', medir);
      observador.disconnect();
    };
    // As camadas mudam com a região; sem isto a medida ficava da anterior.
  }, [camadas.length]);
  /**
   * As partidas do ponto escolhido: `null` enquanto chegam, e `'falhou'`
   * quando NÃO chegaram — que não é o mesmo que a paragem não ter partidas.
   * Com a rede a falhar na paragem (o caso normal no interior), a folha dizia
   * «Sem partidas registadas» de uma paragem com 186; quem lê vai-se embora.
   */
  const [partidas, setPartidas] = useState<Partida[] | null | 'falhou'>(null);
  /**
   * Em que dias anda cada serviço. `undefined` enquanto se pergunta, `null`
   * quando não se conseguiu saber — e as duas coisas não se confundem com
   * «hoje não anda nada», que é uma resposta (`lib/dias.ts`).
   */
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);
  // AS CORES DAS LINHAS, do índice que o sítio já publica.
  //
  // Vêm de um ficheiro à parte e não dentro de cada partida, e a razão é
  // de tamanho: são 27 558 partidas nesta região, e a cor repetir-se-ia
  // milhares de vezes por linha. O índice inteiro são 21 KB, lidos uma vez
  // e servidos da cache a partir daí.
  const [cores, setCores] = useState<Record<string, string>>({});
  const [aIr, setAIr] = useState<Ponto | null>(null);
  const [percurso, setPercurso] = useState<Percurso | null>(null);
  // O PAINEL DESCE PARA SE VER O MAPA. No Maps arrasta-se a folha para baixo;
  // aqui é um botão, que faz o mesmo e funciona com teclado, com comando de
  // voz e com leitor de ecrã — coisas que um arrasto não faz.
  const [encolhido, setEncolhido] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // O MAPA OCUPA O QUE SOBRA DO ECRÃ, medido e não adivinhado. O cabeçalho
  // deste sítio passa a duas linhas num telemóvel, e qualquer subtração
  // cravada no CSS erra por essa segunda linha: o mapa fica mais comprido do
  // que o ecrã e a folha de baixo acaba por baixo da dobra.
  useEffect(() => {
    const ajustar = () => {
      const el = caixa.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top + window.scrollY;
      const alto = Math.max(320, window.innerHeight - topo);
      el.style.setProperty('--alto-do-mapa', `${alto}px`);
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);

  // OS CONTROLOS DO MAPA SOBEM COM A FOLHA, como no Maps.
  //
  // A folha de abertura, o cartão de um ponto e a folha das direções sobem do
  // fundo do ecrã, e é no fundo que o MapLibre põe a escala, o botão da
  // localização e a atribuição do OpenStreetMap. Ficavam todos por baixo da
  // folha: medido no ar, a 390 × 844 e a 1100 × 640, o que estava no centro da
  // atribuição era a nota «Ou escreve na caixa de cima». Um botão tapado não
  // se carrega, e a atribuição que a ODbL obriga não se lê.
  //
  // Mede-se, não se adivinha: a folha muda de altura com os modos da região,
  // com a largura do ecrã e com o que se escolhe. E cada canto sobe só o que
  // lhe tapam — numa janela larga o cartão de um ponto encosta à esquerda, e o
  // canto direito fica onde estava.
  //
  // E SÓ SOBE SE COUBER. Esse cartão da janela larga chega a ocupar a altura
  // quase toda, e a escala, empurrada para cima dele, ia parar atrás da barra
  // da procura. Um canto que não cabe entre a folha e o que flutua no alto
  // fica onde estava: tapado por uma folha que se fecha, e não perdido.
  //
  // E O CANTO DE CIMA DESCE. O MapLibre põe os botões de aproximar e afastar
  // no alto à direita, e num telemóvel a barra da procura vai de uma borda à
  // outra: medido no ar a 390 × 844, o de aproximar estava inteiro por baixo
  // dela e o de afastar quase todo. Num ecrã de mapa, com um dedo, são a única
  // maneira de afastar sem os dois dedos do gesto de pinça (WCAG 2.5.1). O
  // canto desce para baixo do que lhe fica por cima — a procura, a fila das
  // camadas, o cartão das direções — e só disso: numa janela larga nada lhe
  // toca, e fica onde sempre esteve.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const base = el.getBoundingClientRect();
      const folhas = [...el.querySelectorAll<HTMLElement>(FOLHAS)]
        .map((f) => f.getBoundingClientRect())
        .filter((q) => q.height > 0);
      const emCima = [...el.querySelectorAll<HTMLElement>(NO_ALTO)]
        .map(caixaNoAlto)
        .filter((q) => q.height > 0);
      const alto = el.querySelector<HTMLElement>('.maplibregl-ctrl-top-right');
      if (alto) {
        // A posição de partida é a de sempre, encostada ao alto; desce até ao
        // fundo do que a cruzar, e volta a ver — por baixo da procura pode
        // estar a fila das camadas.
        const c = alto.getBoundingClientRect();
        const aoLado = (q: DOMRect) => q.left < c.right && q.right > c.left;
        let desce = 0;
        for (;;) {
          const topo = base.top + desce;
          const cruza = emCima.filter(
            (q) => aoLado(q) && q.top < topo + c.height && q.bottom > topo,
          );
          const abaixo = Math.max(0, ...cruza.map((q) => q.bottom - base.top));
          if (abaixo <= desce) break;
          desce = abaixo;
        }
        el.style.setProperty('--tapado-no-alto', `${Math.round(desce)}px`);
        // Para os cantos de baixo, o de cima passa a ser mais uma coisa no
        // alto: o da direita sobe com a folha até ele, e não por cima dele.
        emCima.push(new DOMRect(c.left, base.top + desce, c.width, c.height));
      }
      for (const [lado, variavel] of CANTOS) {
        const canto = el.querySelector<HTMLElement>(`.maplibregl-ctrl-bottom-${lado}`);
        if (!canto) continue;
        const c = canto.getBoundingClientRect();
        const aoLado = (q: DOMRect) => q.left < c.right && q.right > c.left;
        const tapa = Math.max(0, ...folhas.filter(aoLado).map((q) => base.bottom - q.top));
        const teto = Math.max(base.top, ...emCima.filter(aoLado).map((q) => q.bottom));
        const cabe = base.bottom - tapa - c.height >= teto;
        el.style.setProperty(variavel, `${cabe ? Math.round(tapa) : 0}px`);
      }
    };
    // Uma medição por imagem, por muitas mudanças que cheguem juntas.
    const pedir = () => {
      if (!pedido) pedido = requestAnimationFrame(medir);
    };
    // As folhas entram e saem, e mudam de altura — e o cartão das direções,
    // no alto, também; os cantos só existem quando o mapa acabar de
    // carregar. Vê-se tudo isso daqui.
    const tamanhos = new ResizeObserver(pedir);
    const vigiar = () => {
      tamanhos.disconnect();
      tamanhos.observe(el);
      el.querySelectorAll<HTMLElement>(FOLHAS).forEach((f) => tamanhos.observe(f));
      el.querySelectorAll<HTMLElement>(NO_ALTO).forEach((f) => tamanhos.observe(f));
      pedir();
    };
    const entradas = new MutationObserver(vigiar);
    entradas.observe(el, { childList: true, subtree: true });
    vigiar();
    return () => {
      entradas.disconnect();
      tamanhos.disconnect();
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, []);
  function encolher(sim: boolean) {
    setEncolhido(sim);
    if (!sim) return;
    // Ao descer, a folha rola até à OPÇÃO ESCOLHIDA — que é a que está
    // desenhada no mapa. Deixá-la onde estava mostrava um pedaço de outra
    // opção qualquer, e a barra deixava de dizer o que o mapa mostra.
    //
    // `scrollTop` e não `scrollIntoView`: este mexe também na janela, e a
    // janela tem o rodapé por baixo do mapa.
    requestAnimationFrame(() => {
      const folha = document.querySelector<HTMLElement>('.folha');
      const opcao = folha?.querySelector<HTMLElement>('.opcao.escolhida');
      if (folha && opcao) folha.scrollTop = opcao.offsetTop - folha.offsetTop;
    });
  }

  /**
   * As partidas de uma paragem, do ficheiro do concelho dela.
   *
   * **Três respostas, e não duas.** O ficheiro que existe e não traz a
   * paragem diz que ela não tem partidas; o que não existe (404, ou 400 na
   * porta do armazém) diz o mesmo do concelho inteiro. O que NÃO CHEGOU — a
   * rede caiu, o servidor respondeu 500 — não diz nada, e a folha tem de o
   * dizer assim, com uma maneira de tentar outra vez. A tabela dos dias, se
   * também tiver faltado, volta a ser pedida no mesmo gesto.
   */
  function carregarPartidas(p: Marca | Ponto) {
    setPartidas(null);
    const c = (p.concelho || 'fora-da-regiao').replace(/[^a-zA-Z0-9\-_]/g, '-');
    fetch(enderecoDosDados(regiao, `partidas/${c}.json`))
      .then((r) => {
        if (r.ok) return r.json();
        if (r.status === 404 || r.status === 400) return {};
        throw new Error(`partidas: HTTP ${r.status}`);
      })
      .then((mapa: Record<string, Partida[]>) => setPartidas(mapa[p.id] ?? []))
      .catch(() => setPartidas('falhou'));
    if (calendario === null) calendarioDe(regiao).then(setCalendario);
  }

  function abrir(p: Marca | Ponto) {
    setEscolhido(p as Marca);
    setPartidas(null);
    setAIr(null);
    setPercurso(null);
    setEncolhido(false);
    if (p.tipo !== 'paragem') return;
    carregarPartidas(p);
    // Uma vez por sessão. Sem isto o distintivo sai cinzento, que é o que
    // acontece também se o ficheiro faltar — e um distintivo cinzento continua
    // a dizer o número da linha.
    if (Object.keys(cores).length === 0) {
      fetch(enderecoDosDados(regiao, `cores-das-linhas.json`))
        .then((r) => (r.ok ? r.json() : {}))
        .then((m: Record<string, string>) => setCores(m ?? {}))
        .catch(() => {});
    }
  }

  function fechar() {
    setEscolhido(null);
    setAIr(null);
    setPercurso(null);
    setEncolhido(false);
  }

  // UM PONTO PELO ENDEREÇO: `/?ponto=<id>` abre o mapa já nele, com o cartão.
  //
  // É o «Ver no mapa» das páginas de paragem, de estação e das praças de
  // táxi. A página da paragem dizia onde ela fica com «39.463, -8.213525» —
  // coordenadas cruas, que não dizem nada a quem viaja —, e o sítio tem o seu
  // próprio mapa. Lê-se uma vez, ao abrir: é o endereço de chegada, não um
  // estado que o mapa vá escrevendo (isso é outra conversa, P2-027).
  //
  // Primeiro as paragens e as estações: os identificadores de modos
  // diferentes vêm de fontes diferentes, e se algum dia coincidirem, quem
  // chega de uma página de paragem quer a paragem.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ponto');
    if (!id) return;
    const p =
      pontos.find((x) => x.id === id && (x.tipo === 'paragem' || x.tipo === 'estacao')) ??
      pontos.find((x) => x.id === id);
    if (p) abrir(p);
    // Só ao abrir: os pontos são os da região, e não mudam depois disso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O DIA E A HORA SAEM DO MESMO RELÓGIO, o de quem está a ler.
  const instante = new Date();
  const agora = horaDoRelogio(instante);
  const aSeguir =
    Array.isArray(partidas) && partidas.length > 0 && calendario !== undefined
      ? proximas(partidas, instante, agora, calendario)
      : null;

  return (
    <DisponibilidadeBicicletas endereco={disponibilidadeDaRegiao}>
      <div className="app-mapa" ref={caixa}>
        {/* UM h1, INVISÍVEL — e não «nenhum h1 porque o Maps não tem».
          O Maps também não tem, e o Maps não é um serviço de uma autoridade
          pública portuguesa. Uma página sem h1 deixa quem usa leitor de ecrã
          sem saber onde está; um h1 que só se lê com leitor de ecrã resolve
          isso sem roubar ecrã ao mapa. O teste apanhou a falta.

          E é a primeira frase que quem usa leitor de ecrã ouve: dizia «Mapa a
          Serra da Pedra Alta». A contração vem feita da região. */}
        <h1 className="so-para-leitores">Mapa {deDaRegiao}</h1>

        {/* A procura por cima do mapa, como no Maps. É o mesmo combobox das
          direções — teclado, região viva, Escape e Enter incluídos. Com as
          direções abertas sai da frente: os campos «De» e «Para» estão dois
          centímetros abaixo, e três caixas de procura no mesmo ecrã é não
          saber em qual se escreve. */}
        {!aIr && (
          <div className="app-procura">
            <button
              type="button"
              className="botao-menu"
              onClick={() => setMenu(true)}
              aria-label="Abrir o menu"
              aria-haspopup="dialog"
            >
              <Hamburguer />
            </button>
            <EscolherPonto
              etiqueta="Procurar"
              sugestao="Procurar paragem ou sítio"
              pontos={pontos}
              valor={null}
              regiao={regiao}
              aoEscolher={(p) => p && abrir(p)}
            />
          </div>
        )}

        {/* O QUE APARECE NO MAPA — uma fila de botões, como as camadas do Maps.
         *
         * São `aria-pressed` e não caixas de seleção: cada um é um interruptor
         * que se carrega, e é assim que um leitor de ecrã o anuncia («ligado»,
         * «desligado»). Ligar e desligar não refaz os dados — só esconde a
         * camada —, por isso é imediato e não perde a posição do mapa.
         *
         * Desligar TUDO é uma escolha legítima: quem quer ver só as ruas tem
         * direito a um mapa sem pontos. */}
        {!aIr && temMapa && camadas.length > 1 && (
          <div
            ref={fila}
            className={`app-camadas${maisNaFila.antes ? ' ha-antes' : ''}${
              maisNaFila.depois ? ' ha-depois' : ''
            }`}
            role="group"
            aria-label="O que aparece no mapa"
          >
            {camadas.map((c) => {
              const ligada = visiveis.has(c.tipo);
              return (
                <button
                  key={c.tipo}
                  type="button"
                  className="pilula"
                  aria-pressed={ligada}
                  onClick={() =>
                    setVisiveis((antes) => {
                      const agora = new Set(antes);
                      if (agora.has(c.tipo)) agora.delete(c.tipo);
                      else agora.add(c.tipo);
                      return agora;
                    })
                  }
                >
                  <span className="pilula-cor" style={{ background: c.cor }} aria-hidden="true" />
                  {c.rotulo}
                </button>
              );
            })}
          </div>
        )}

        <MenuDoMapa
          regiao={regiao}
          nomeDaRegiao={nomeDaRegiao}
          temAPedido={temAPedido}
          aberto={menu}
          aoFechar={() => setMenu(false)}
        />

        {temMapa ? (
          <Mapa
            centro={centro}
            pontos={pontos as Marca[]}
            aoEscolher={abrir}
            mosaicos={mosaicos}
            foco={!percurso && escolhido ? { lat: escolhido.lat, lon: escolhido.lon } : null}
            percurso={percurso?.geo ?? null}
            alternativas={percurso?.outras ?? null}
            etiqueta={percurso?.meio ?? null}
            enquadrar={percurso?.caixa ?? null}
            margemInferior={aIr && !encolhido ? 430 : 210}
            modosVisiveis={visiveis}
          />
        ) : (
          <div className="mapa-caixa">
            <p className="mapa-aviso">
              Esta região ainda não tem mapa — falta o recorte do OpenStreetMap. A procura e as
              páginas de paragem funcionam na mesma.
            </p>
          </div>
        )}

        {/* AS DIREÇÕES: duas cartas, e o mapa entre elas — o cartão de cima com
          de onde e para onde, a folha de baixo com as opções. Não são filhas
          de um cartão só de propósito: é a separação que faz isto parecer o
          que as pessoas já sabem usar. */}
        {aIr && (
          <Direccoes
            key={aIr.id || aIr.nome}
            regiao={regiao}
            pontos={pontos}
            modosDesligados={modosDesligados}
            motorDaRegiao={motorDaRegiao}
            servicosSemDatas={servicosSemDatas}
            paraInicial={aIr}
            variante="mapa"
            encolhido={encolhido}
            aoEncolher={encolher}
            aoFechar={fechar}
            aoDesenhar={(p, origem) => {
              setPercurso(p);
              // Escolher uma opção é pedir para a VER: a folha desce. A
              // primeira, que se desenha sozinha, não desce — quem acabou de
              // procurar está a ler as opções.
              if (p && origem === 'escolha') encolher(true);
            }}
          />
        )}

        {/* A FOLHA DE ABERTURA: por onde se pode ir, antes de se perguntar nada.
         *
         * O Maps põe aqui «De carro · A pé · De bicicleta» em círculos grandes,
         * e por baixo os transportes públicos. A pergunta é a mesma; os modos é
         * que são outros — e são os que ESTA REGIÃO declara, não uma lista
         * escrita aqui. Uma região sem comboio não mostra comboio.
         *
         * É o que responde a quem abre isto sem saber o que aqui há. A procura
         * serve quem já sabe o nome; isto serve quem não sabe. */}
        {!aIr && !escolhido && modos.length > 0 && (
          <section className="folha-de-abertura" aria-labelledby="abertura">
            <h2 id="abertura">O que há {emDaRegiao}</h2>
            <ul className="circulos">
              {modos.map((m) => (
                <li key={m.id}>
                  <Link href={m.href} className={`circulo modo-${m.id}`}>
                    <span className="bolha" aria-hidden="true">
                      <DoModo modo={m.id} tamanho={26} />
                    </span>
                    <span className="nome">{m.nome}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="secundario abertura-nota">
              Ou escreve na caixa de cima de onde partes — e depois para onde vais.
            </p>
          </section>
        )}

        {/* O cartão que sobe de baixo quando se toca num ponto. */}
        {escolhido && !aIr && (
          <section className="cartao-de-baixo" aria-labelledby="escolhido">
            {/* A PEGA. Não arrasta nada — diz que isto é uma folha e que há
              mais por baixo. É o sinal que o Maps usa, e custa 4 px. */}
            <span className="pega" aria-hidden="true" />

            <div className="cartao-cabecalho">
              {/* Sem nome no mapa, o título é o que a coisa É. Oito das nove
                praças de táxi estão nesse caso, e um cartão com o título em
                branco não diz nada a ninguém. */}
              <h2 id="escolhido">{escolhido.nome || rotuloDe(escolhido)}</h2>
              {/* UM FECHO DISCRETO, E O ALVO CONTINUA A TER 44 px.
                Era um botão escuro do tamanho de um terço da largura, ao lado
                do nome da paragem — a coisa mais escura do ecrã era a que
                servia para sair. O × pesa menos aos olhos e o mesmo ao dedo:
                o `aria-label` mantém o nome para quem não vê o símbolo. */}
              <button type="button" className="fechar" onClick={fechar} aria-label="Fechar">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <p className="secundario">
              {escolhido.nome ? rotuloDe(escolhido) : 'Sem nome no mapa'}
              {/* AS CONTAGENS AO VIVO, na estação em que se tocou. Só aparecem
                se a leitura for recente: um número de há uma hora manda
                alguém a uma doca vazia, e isso é pior do que número nenhum. */}
              <ContagemDaEstacao id={escolhido.tipo === 'bicicleta' ? escolhido.id : null} />
            </p>

            {escolhido.tipo === 'paragem' &&
              (partidas === null || (Array.isArray(partidas) && calendario === undefined)) && (
                <p>A carregar as horas…</p>
              )}
            {partidas === 'falhou' && (
              <div className="faixa alerta" role="status">
                <p>
                  <strong>Não foi possível carregar as horas desta paragem.</strong> Pode ser da
                  ligação à Internet — não quer dizer que não haja autocarros.
                </p>
                <p>
                  <button
                    type="button"
                    className="botao"
                    onClick={() => carregarPartidas(escolhido)}
                  >
                    Tentar de novo
                  </button>
                </p>
              </div>
            )}
            {/* O «A SEGUIR» É O MESMO DA PÁGINA DA PARAGEM (`ASeguir.tsx`): o
              mesmo cálculo e os mesmos casos — hoje, o próximo dia com
              partidas, fora do período, sem a tabela dos dias. */}
            {aSeguir && (
              <ASeguir resultado={aSeguir} instante={instante} agora={agora} cores={cores} />
            )}
            {Array.isArray(partidas) && partidas.length === 0 && <p>Sem partidas registadas.</p>}

            <p className="cartao-accoes">
              {/* Um BOTÃO e não uma ligação: isto não muda de página, abre as
                direções aqui. Uma ligação que não navega mente ao clique do
                meio, ao «abrir num separador» e a quem lê a barra de estado. */}
              <button type="button" className="botao" onClick={() => setAIr(escolhido)}>
                Como chegar
              </button>{' '}
              <a href={paginaDe(regiao, escolhido).href}>{paginaDe(regiao, escolhido).texto}</a>
            </p>

            {/* A NOTA É SOBRE HORÁRIOS, e por isso só aparece onde há horários.
              Num cartão de uma praça de táxi não há horário nenhum a ser
              planeado, e a nota só confundia. */}
            {(escolhido.tipo === 'paragem' || escolhido.tipo === 'estacao') && (
              <p className="secundario">Horários planeados, não em tempo real.</p>
            )}
          </section>
        )}
      </div>
    </DisponibilidadeBicicletas>
  );
}
