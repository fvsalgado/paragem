'use client';

import { useEffect, useRef, useState } from 'react';
import Mapa, { type Marca } from '@/componentes/Mapa';
import EscolherPonto from '@/componentes/EscolherPonto';
import Direccoes, { type Percurso } from '@/componentes/Direccoes';
import { NOME_DOS_MODOS, type Partida, type Ponto } from '@/lib/formato';
import { calendarioDe, horaDoRelogio, proximas, type Calendario } from '@/lib/dias';
import ASeguir from '@/componentes/ASeguir';
import PertoDeTi from '@/componentes/PertoDeTi';
import { camadasDe, ordemDeApresentacao } from '@/lib/pontos-no-mapa';
import DisponibilidadeBicicletas, {
  ContagemDaEstacao,
} from '@/componentes/DisponibilidadeBicicletas';
import Link from '@/componentes/Ligacao';
import MenuDoMapa from '@/componentes/MenuDoMapa';
import { Chegada, DoModo, Hamburguer, Lista } from '@/componentes/Icones';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { usePontos } from '@/lib/pontos-do-navegador';
import AssinaturaDaRegiao from '@/componentes/AssinaturaDaRegiao';
import type { Marca as MarcaDaRegiao } from '@/lib/marca';
import {
  avisoDe,
  comoProcura,
  escreverViagem,
  lerViagem,
  type Caixa,
  type PontaLida,
} from '@/lib/endereco-da-viagem';

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

/** Uma lista vazia que é sempre a MESMA: o mapa compara-a, e uma nova a cada pintura refazia a fonte. */
const SEM_PONTOS: Ponto[] = [];

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
  // Um sítio da procura — uma terra, um hospital — diz o que é pela etiqueta
  // que a procura já lhe dá.
  if (p.tipo === 'sitio') return p.descricao || 'Sítio';
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
function paginaDe(regiao: string, p: Ponto): { href: string; texto: string } | null {
  if (p.tipo === 'paragem' || p.tipo === 'estacao') {
    const pasta = p.tipo === 'estacao' ? 'estacoes' : 'paragens';
    return { href: `/rede/${pasta}/${seguro(p.id)}/`, texto: 'Horário completo' };
  }
  // UM SÍTIO NÃO É UM SERVIÇO: levava a `/modos/sitio/`, que não existe. O
  // que se faz com um sítio é ir para lá, ou partir de lá — e os dois botões
  // estão no alto do cartão.
  if (p.tipo === 'sitio') return null;
  return { href: `/modos/${seguro(p.tipo)}/`, texto: 'Ver este serviço' };
}

/**
 * AS DIREÇÕES ABERTAS: as duas pontas, o dia e a hora pedidos, e o campo que
 * recebe o foco. A `vez` conta as aberturas — abrir outra vez é começar de
 * novo, e não herdar a pergunta de antes.
 */
type Direcoes = {
  de: Ponto | null;
  para: Ponto | null;
  dia: string | null;
  hora: string | null;
  foco: 'de' | 'para' | null;
  vez: number;
};

/**
 * A CAMADA QUE ESTA ENTRADA DO HISTÓRICO ABRIU, posta por nós.
 *
 * É o que deixa o «Fechar» e o Esc fazerem o mesmo que o «voltar» do
 * telemóvel: se fomos nós a empilhar a entrada, fechar é voltar atrás uma
 * vez. Se não fomos — quem chegou por uma ligação partilhada já com as
 * direções abertas —, fechar não pode voltar atrás, porque atrás está outro
 * sítio: substitui-se a entrada pela do mapa.
 */
type Camada = 'cartao' | 'direcoes';
const camadaNoHistorico = (): Camada | null =>
  (typeof window !== 'undefined' && (window.history.state?.camada as Camada | undefined)) || null;

/**
 * Escreve no histórico SEM navegar.
 *
 * `history.pushState` e não o `router.push` do Next: este pedia ao servidor a
 * página do endereço novo — a mesma página, com os pontos todos lá dentro —
 * para mudar uma coisa que só o navegador lê. O Next acompanha o histórico
 * nativo e não pede nada.
 */
function escrever(camada: Camada | null, endereco: string, empilhar: boolean): void {
  const estado = camada ? { camada } : {};
  if (empilhar) window.history.pushState(estado, '', endereco);
  else window.history.replaceState(estado, '', endereco);
}

export default function AppDoMapa({
  regiao,
  centro,
  caixa = null,
  tipos,
  contagens,
  mosaicos,
  atribuicaoDoMapa,
  marca,
  assinatura,
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
  /**
   * A marca da região e os nomes da assinatura (`marca.ts`): no alto da folha
   * de abertura e no menu. O ecrã do mapa esconde o cabeçalho, e o primeiro
   * ecrã ficava sem marca nenhuma — nem a da rede, nem a do produto (P1-008).
   */
  marca: MarcaDaRegiao;
  assinatura: { principal: string; secundario: string | null };
  /** «da Serra da Pedra Alta», «do Baixo Sável» — para o título do mapa. */
  deDaRegiao: string;
  /** «na Serra da Pedra Alta», «no Baixo Sável» — escrito pela região, não colado aqui. */
  emDaRegiao: string;
  centro: [number, number];
  /** A caixa da região: um ponto pedido por coordenadas tem de cair perto dela. */
  caixa?: Caixa | null;
  /**
   * Os tipos de ponto que a região tem — as camadas e as pílulas existem
   * desde o primeiro pixel, antes de os pontos chegarem.
   */
  tipos: string[];
  /** Quantas paragens e estações — para quem não vê o mapa, dito à entrada. */
  contagens: { paragens: number; estacoes: number };
  mosaicos: string;
  /**
   * De quem é o mapa de fundo, como o MapLibre o escreve no canto. Vem dos
   * dados da região: o de uma região real é do OpenStreetMap, e o de uma
   * inventada é desenhado por nós — e dizer «OpenStreetMap» por baixo de um
   * mapa que não é dele era atribuir-lhe o que não fez.
   */
  atribuicaoDoMapa?: string;
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

  // OS PONTOS CHEGAM DEPOIS DA PÁGINA (P3-006). Vinham embutidos no HTML —
  // 410 kB em bruto, numa página de 431 —, e o texto da folha de abertura
  // esperava por eles para se pintar. Agora pedem-se assim que a aplicação
  // acorda, e entretanto já se vê a procura, a folha e os modos.
  const { pontos: osPontos, tentar: tentarOsPontos } = usePontos(regiao, modosDesligados);
  const pontos = Array.isArray(osPontos) ? osPontos : SEM_PONTOS;

  // O MAPA OCUPA O ECRÃ TODO, e a faixa do sítio sai da frente — pelo CSS,
  // com `body:has(.app-mapa)`, e já no HTML que vem do servidor. Era uma
  // classe posta num efeito: o cabeçalho chegava, aparecia, e desaparecia na
  // hidratação, e a aplicação inteira subia por baixo do dedo de quem ia
  // tocar na procura (P3-023). A navegação não desapareceu: mudou-se para o
  // menu, a um toque do canto — e continua em texto no HTML de todas as
  // outras páginas, que são as que os motores de busca leem.
  const [escolhido, setEscolhido] = useState<Marca | null>(null);

  // AS CAMADAS COMEÇAM TODAS LIGADAS, e derivam do que há nos dados: uma
  // região sem bicicletas não ganha um botão que não liga a nada.
  //
  // E APRESENTAM-SE PELA ORDEM DA REGIÃO, que não é a ordem de desenho (P2-038,
  // P1-011). A fila abria com o expresso — o serviço menos usado, e privado —
  // porque seguia a ordem de empilhamento das camadas. A rede da autoridade
  // vem primeiro, os privados no fim, como na folha logo por baixo.
  const camadas = ordemDeApresentacao(
    camadasDe(tipos),
    modos.map((m) => m.id),
  );
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
  // A TABELA DOS DIAS PEDE-SE QUANDO É PRECISA — ao abrir o cartão de uma
  // paragem (`carregarPartidas`), e não ao abrir a aplicação (P3-006). Era
  // pedida logo à entrada: 1,9 MB de JSON a analisar no telemóvel de quem
  // talvez só quisesse ver o mapa.
  // AS CORES DAS LINHAS, do índice que o sítio já publica.
  //
  // Vêm de um ficheiro à parte e não dentro de cada partida, e a razão é
  // de tamanho: são 27 558 partidas nesta região, e a cor repetir-se-ia
  // milhares de vezes por linha. O índice inteiro são 21 KB, lidos uma vez
  // e servidos da cache a partir daí.
  const [cores, setCores] = useState<Record<string, string>>({});
  const [direcoes, setDirecoes] = useState<Direcoes | null>(null);
  /** O que o endereço pediu e não se pôde abrir — dito em vez de calado. */
  const [avisoDoEndereco, setAvisoDoEndereco] = useState<string | null>(null);
  const [percurso, setPercurso] = useState<Percurso | null>(null);
  // O PAINEL DESCE PARA SE VER O MAPA. No Maps arrasta-se a folha para baixo;
  // aqui é um botão, que faz o mesmo e funciona com teclado, com comando de
  // voz e com leitor de ecrã — coisas que um arrasto não faz.
  const [encolhido, setEncolhido] = useState(false);
  /**
   * ONDE ESTÁ QUEM PERGUNTA, quando o disse — pelo botão do mapa ou pelo
   * «Paragens perto de mim» da folha. A folha passa a responder «o que passa
   * aqui perto», que era o que a pessoa queria saber ao carregar no botão
   * (P2-016): o ponto azul sozinho só mexia o mapa.
   */
  const [aqui, setAqui] = useState<[number, number] | null>(null);
  const caixaApp = useRef<HTMLDivElement>(null);
  /**
   * QUANTO TAPAM OS PAINÉIS DA ESQUERDA, na secretária e com o telemóvel
   * deitado (P1-013, P3-021). Aí as folhas não sobem do fundo: são uma coluna
   * à esquerda, e é desse lado que o mapa tem de se afastar para o percurso e
   * o ponto escolhido não ficarem por baixo dela.
   */
  const [lateral, setLateral] = useState(0);
  /**
   * Quanto o cartão de cima das direções tapa do alto do mapa. O percurso
   * enquadrava-se como se o alto estivesse livre, e a ponta de partida ficava
   * por baixo do cartão — quem procurava via a chegada e não via de onde saía.
   */
  const [tapadoEmCima, setTapadoEmCima] = useState(0);
  /**
   * QUANTO A FOLHA DE BAIXO TAPA, MEDIDO. Era um número escrito à mão — 430
   * com as direções, 210 no resto —, e as folhas são mais altas do que isso
   * (até 56 % e 62 % do mapa): o fim do percurso caía por baixo da folha, e
   * quem procurava via de onde saía e não onde chegava. Só as que vão de uma
   * borda à outra contam: na secretária as folhas são um painel à esquerda,
   * e contam na margem desse lado.
   */
  const [tapadoEmBaixo, setTapadoEmBaixo] = useState(0);
  /**
   * SE AS FOLHAS JÁ FORAM MEDIDAS. Até lá não se sabe onde fica o fundo do que
   * se vê do mapa, e o aviso «A carregar o mapa…» aparecia no fundo da caixa e
   * saltava para cima da folha um instante depois — era metade do salto que o
   * ecrã de abertura dava sozinho (CLS 0,033 na região real).
   */
  const [medido, setMedido] = useState(false);
  useEffect(() => {
    const largo = window.matchMedia('(min-width: 64rem)');
    const deitado = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const medir = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      if (largo.matches) setLateral(26 * rem + 0.75 * rem * 2);
      else if (deitado.matches) setLateral(Math.min(22 * rem, window.innerWidth * 0.46) + rem);
      else setLateral(0);
    };
    medir();
    largo.addEventListener('change', medir);
    deitado.addEventListener('change', medir);
    return () => {
      largo.removeEventListener('change', medir);
      deitado.removeEventListener('change', medir);
    };
  }, []);
  const procura = useRef<HTMLDivElement>(null);
  const tituloDoCartao = useRef<HTMLHeadingElement>(null);
  /** O foco vai para o cartão quando ele abre por um gesto — não ao carregar a página. */
  const focarCartao = useRef(false);

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
    const el = caixaApp.current;
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
      const cartaoDeCima = el.querySelector<HTMLElement>('.cartao-de-cima');
      const emCimaDasDirecoes = cartaoDeCima
        ? Math.max(0, Math.round(cartaoDeCima.getBoundingClientRect().bottom - base.top))
        : 0;
      setTapadoEmCima((antes) =>
        Math.abs(antes - emCimaDasDirecoes) > 4 ? emCimaDasDirecoes : antes,
      );
      const deBordaABorda = folhas.filter((q) => q.width >= base.width * 0.6);
      const emBaixo = deBordaABorda.length
        ? Math.max(0, ...deBordaABorda.map((q) => Math.round(base.bottom - q.top)))
        : 0;
      // LOGO, E NÃO DEPOIS DE ASSENTAR. A folha cresce quando a procura
      // começa — o esqueleto das opções ocupa o lugar delas —, e a medida
      // chega ao mapa antes de haver percurso para enquadrar: enquadra-se uma
      // vez, já com a folha do tamanho final. Esperar que ela assentasse fazia
      // o contrário: o percurso enquadrava-se com a folha pequena, e outra vez
      // um segundo depois.
      setTapadoEmBaixo((antes) => (Math.abs(antes - emBaixo) > 8 ? emBaixo : antes));
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
      setMedido(true);
      // OS CONTROLOS SÓ SE MOSTRAM DEPOIS DE ESTAREM NO SÍTIO. O MapLibre
      // põe-nos no fundo do mapa, e esta medição sobe-os para cima da folha
      // na imagem seguinte: viam-se a nascer por baixo dela e a saltar — a
      // outra metade do salto do ecrã de abertura. Escondidos até aqui pelo
      // CSS, aparecem já onde ficam.
      if (alto) el.dataset.cantos = 'medidos';
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
    // A tabela pede-se uma vez por visita (`calendarioDe` guarda-a), e outra
    // vez se da primeira não chegou.
    if (!calendario) calendarioDe(regiao).then(setCalendario);
  }

  /**
   * Abre o cartão de um ponto, sem tocar no histórico — quem decide isso é
   * quem chama: um gesto empilha uma entrada, um «voltar» não.
   */
  function mostrarCartao(p: Marca | Ponto) {
    setEscolhido(p as Marca);
    setPartidas(null);
    setDirecoes(null);
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

  /** O cartão de um ponto, aberto por um gesto: fica no endereço e recebe o foco. */
  function abrir(p: Marca | Ponto) {
    focarCartao.current = true;
    mostrarCartao(p);
    // UM CARTÃO NO LUGAR DE OUTRO NÃO EMPILHA. Quem toca em cinco paragens
    // seguidas e carrega em «voltar» quer voltar ao mapa, e não percorrer as
    // cinco ao contrário.
    const endereco = p.id ? `/?ponto=${encodeURIComponent(p.id)}` : '/';
    escrever('cartao', endereco, camadaNoHistorico() !== 'cartao');
  }

  /** As direções, abertas por um gesto, com o foco no campo que falta. */
  function abrirDirecoes(de: Ponto | null, para: Ponto | null, foco: 'de' | 'para') {
    setAvisoDoEndereco(null);
    setDirecoes((antes) => ({ de, para, dia: null, hora: null, foco, vez: (antes?.vez ?? 0) + 1 }));
    setPercurso(null);
    setEncolhido(false);
    escrever('direcoes', `/${comoProcura(escreverViagem({ de, para }))}`, true);
  }

  /**
   * Fechar é voltar atrás uma camada — quando a camada foi aberta aqui. Ver
   * `Camada`. O foco volta à procura, que é de onde se partiu; sem isto ia
   * para o `<body>`, e quem usa teclado perdia o sítio (P3-014).
   */
  function fechar() {
    if (camadaNoHistorico()) {
      window.history.back();
    } else {
      aplicarEndereco(new URLSearchParams());
      escrever(null, '/', false);
    }
  }
  function fecharDirecoes() {
    if (camadaNoHistorico() === 'direcoes') {
      window.history.back();
      return;
    }
    // Chegou-se com as direções já abertas (uma ligação partilhada): atrás
    // está outro sítio, e fechar deixa o mapa.
    setDirecoes(null);
    setPercurso(null);
    setEncolhido(false);
    escrever(
      escolhido ? 'cartao' : null,
      escolhido ? `/?ponto=${encodeURIComponent(escolhido.id)}` : '/',
      false,
    );
  }

  // O FOCO, QUANDO UMA CAMADA SE FECHA, VOLTA À PROCURA. A camada que tinha o
  // foco desapareceu; deixá-lo no `<body>` é largar quem usa teclado no meio do
  // nada. Só quando a camada fechou com o foco lá dentro: quem estava a
  // arrastar o mapa não quer o teclado do telemóvel a abrir.
  const tinhaFoco = useRef(false);
  useEffect(() => {
    if (escolhido || direcoes) return;
    if (!tinhaFoco.current) return;
    tinhaFoco.current = false;
    procura.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [escolhido, direcoes]);

  // O CARTÃO QUE SOBE DIZ QUE SUBIU. Aparecia em silêncio, e com o foco
  // deixado na caixa de procura (P3-014): quem usa leitor de ecrã não sabia
  // que havia horas para ler, e precisava de treze tabulações para chegar ao
  // «Como chegar». O título recebe o foco — e é lido —, e o cartão está logo
  // a seguir à procura na ordem do documento.
  useEffect(() => {
    if (!escolhido || direcoes || !focarCartao.current) return;
    focarCartao.current = false;
    tituloDoCartao.current?.focus();
  }, [escolhido, direcoes]);

  /**
   * O ENDEREÇO MANDA, e é lido à entrada e em cada «voltar».
   *
   * `?ponto=<id>` abre o cartão (é o «Ver no mapa» das páginas de paragem, de
   * estação e das praças de táxi); `?de=` e `?para=` abrem as direções, com
   * as pontas lidas como o `/viagem/` as lê (`lib/endereco-da-viagem.ts`).
   * Sem nada, o mapa sozinho.
   */
  function aplicarEndereco(q: URLSearchParams) {
    const v = lerViagem(q, pontos, caixa);
    const ponto = (l: PontaLida | null) => (l?.tipo === 'ponto' ? l.ponto : null);
    if (v.de || v.para) {
      setEscolhido(null);
      setPercurso(null);
      setEncolhido(false);
      setAvisoDoEndereco(avisoDe(v.de, v.para, emDaRegiao));
      setDirecoes((antes) => ({
        de: ponto(v.de),
        para: ponto(v.para),
        dia: v.dia,
        hora: v.hora,
        foco: null,
        vez: (antes?.vez ?? 0) + 1,
      }));
      return;
    }
    setDirecoes(null);
    setAvisoDoEndereco(null);
    const id = q.get('ponto');
    // Primeiro as paragens e as estações: os identificadores de modos
    // diferentes vêm de fontes diferentes, e se algum dia coincidirem, quem
    // chega de uma página de paragem quer a paragem.
    const p = id
      ? (pontos.find((x) => x.id === id && (x.tipo === 'paragem' || x.tipo === 'estacao')) ??
        pontos.find((x) => x.id === id))
      : null;
    if (p) mostrarCartao(p);
    else {
      setEscolhido(null);
      setPercurso(null);
      setEncolhido(false);
    }
  }

  // O ENDEREÇO LÊ-SE QUANDO OS PONTOS CHEGAREM: `?ponto=` e `?para=<nome>`
  // procuram-se neles. Sem eles (não chegaram), as pontas por coordenadas
  // continuam a abrir-se, e as que precisavam de um nome dizem-no.
  const pontosLidos = osPontos !== null;
  const aplicar = useRef(aplicarEndereco);
  aplicar.current = aplicarEndereco;
  useEffect(() => {
    if (!pontosLidos) return;
    aplicar.current(new URLSearchParams(window.location.search));
    const aoVoltar = () => {
      // O foco estava numa camada que vai mudar: a que fica recebe-o.
      tinhaFoco.current = true;
      focarCartao.current = true;
      aplicar.current(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [pontosLidos]);

  // O ESC FECHA O QUE ESTÁ POR CIMA — as direções, ou o cartão. Não fechava
  // nada (P3-014). Uma lista de sugestões aberta fecha-se primeiro: a caixa de
  // procura trata do seu Esc e marca a tecla como usada. O menu é um
  // `<dialog>`, e o Esc dele é do navegador.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || menu) return;
      if (!direcoes && !escolhido) return;
      e.preventDefault();
      tinhaFoco.current = true;
      if (direcoes) fecharDirecoes();
      else fechar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  });

  // O DIA E A HORA SAEM DO MESMO RELÓGIO, o de quem está a ler.
  const instante = new Date();
  const agora = horaDoRelogio(instante);
  const aSeguir =
    Array.isArray(partidas) && partidas.length > 0 && calendario !== undefined
      ? proximas(partidas, instante, agora, calendario)
      : null;
  const aCarregarHoras =
    escolhido?.tipo === 'paragem' &&
    (partidas === null || (Array.isArray(partidas) && calendario === undefined));

  // O que o mapa mostra, contado, para quem não o vê (P3-018). Contado no
  // servidor, para estar no HTML antes de os pontos chegarem.
  const nParagens = contagens.paragens;
  const nEstacoes = contagens.estacoes;

  return (
    <DisponibilidadeBicicletas endereco={disponibilidadeDaRegiao}>
      <div className="app-mapa" ref={caixaApp}>
        {/* UM h1, INVISÍVEL — e não «nenhum h1 porque o Maps não tem».
          O Maps também não tem, e o Maps não é um serviço de uma autoridade
          pública portuguesa. Uma página sem h1 deixa quem usa leitor de ecrã
          sem saber onde está; um h1 que só se lê com leitor de ecrã resolve
          isso sem roubar ecrã ao mapa. O teste apanhou a falta.

          E é a primeira frase que quem usa leitor de ecrã ouve: dizia «Mapa a
          Serra da Pedra Alta». A contração vem feita da região. */}
        <h1 className="so-para-leitores">Mapa {deDaRegiao}</h1>
        {/* A ALTERNATIVA AO MAPA, DITA LOGO À ENTRADA (P3-018). Quem ouve a
            página não sabia que as mesmas paragens existem em lista. A ligação
            está à vista, no fim da folha de baixo — uma ligação escondida que
            recebe o foco é um foco que ninguém vê. */}
        <p className="so-para-leitores">
          O mapa mostra {nParagens === 1 ? '1 paragem' : `${nParagens} paragens`}
          {nEstacoes
            ? ` e ${nEstacoes === 1 ? '1 estação' : `${nEstacoes} estações`} de comboio`
            : ''}
          . A mesma informação está em lista, sem mapa, em «A rede» — no menu e no fim da folha de
          baixo.
        </p>

        {/* A procura por cima do mapa, como no Maps. É o mesmo combobox das
          direções — teclado, região viva, Escape e Enter incluídos. Com as
          direções abertas sai da frente: os campos «De» e «Para» estão dois
          centímetros abaixo, e três caixas de procura no mesmo ecrã é não
          saber em qual se escreve. */}
        {!direcoes && (
          <div className="app-procura" ref={procura}>
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
              pontos={osPontos}
              aoTentarDeNovo={tentarOsPontos}
              valor={null}
              regiao={regiao}
              linhas
              aoEscolher={(p) => p && abrir(p)}
            />
          </div>
        )}

        {/* O cartão que sobe de baixo quando se toca num ponto. Vem LOGO A
            SEGUIR À PROCURA no documento — o CSS põe-no em baixo na mesma —,
            para o tabulador ir da caixa ao cartão e não atravessar as camadas e
            os botões do mapa primeiro (P3-014). */}
        {escolhido && !direcoes && (
          <section
            className={`cartao-de-baixo${escolhido.tipo === 'paragem' ? ' com-horas' : ''}`}
            aria-labelledby="escolhido"
            onFocus={() => (tinhaFoco.current = true)}
          >
            {/* A PEGA. Não arrasta nada — diz que isto é uma folha e que há
              mais por baixo. É o sinal que o Maps usa, e custa 4 px. */}
            <span className="pega" aria-hidden="true" />

            <div className="cartao-cabecalho">
              {/* Sem nome no mapa, o título é o que a coisa É. Oito das nove
                praças de táxi estão nesse caso, e um cartão com o título em
                branco não diz nada a ninguém. */}
              <h2 id="escolhido" tabIndex={-1} ref={tituloDoCartao}>
                {escolhido.nome || rotuloDe(escolhido)}
              </h2>
              {/* UM FECHO DISCRETO, E O ALVO CONTINUA A TER 44 px.
                Era um botão escuro do tamanho de um terço da largura, ao lado
                do nome da paragem — a coisa mais escura do ecrã era a que
                servia para sair. O × pesa menos aos olhos e o mesmo ao dedo:
                o `aria-label` mantém o nome para quem não vê o símbolo. */}
              <button
                type="button"
                className="fechar"
                onClick={() => {
                  tinhaFoco.current = true;
                  fechar();
                }}
                aria-label="Fechar"
              >
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

            {/* OS DOIS GESTOS, À CABEÇA DO CARTÃO (P2-001, P3-024).
              Havia um só, «Como chegar», que punha este sítio no DESTINO — e
              a única instrução do ecrã inicial mandava escrever primeiro DE
              ONDE se parte. Quem seguia a página ficava com a viagem ao
              contrário. Com os dois, a pergunta deixa de poder sair trocada.

              E ficam no ALTO, onde não se mexem: estavam por baixo das horas,
              e desciam quando elas chegavam — no instante em que se ia tocar
              no «Como chegar». São botões e não ligações: não mudam de página,
              abrem as direções aqui. */}
            <p className="cartao-accoes">
              <button
                type="button"
                className="botao"
                onClick={() => abrirDirecoes(null, escolhido, 'de')}
              >
                Como chegar aqui
              </button>
              <button
                type="button"
                className="botao secundario"
                onClick={() => abrirDirecoes(escolhido, null, 'para')}
              >
                Partir daqui
              </button>
            </p>

            {/* AS HORAS TÊM O LUGAR GUARDADO enquanto chegam: cinco linhas
              fantasma, da altura das verdadeiras. Sem isto o cartão crescia
              ao chegarem, e com ele subia tudo o que estava em cima. */}
            {aCarregarHoras && (
              <div className="a-seguir-reservado" aria-busy="true">
                <p className="so-para-leitores">A carregar as horas…</p>
                <ul className="fantasma-das-partidas" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <li key={i}>
                      <span className="distintivo medio">&nbsp;</span>
                      <span className="destino">&nbsp;</span>
                      <span className="quando-passa">
                        <strong>&nbsp;</strong>
                        <span className="relogio">&nbsp;</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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
              <div className="a-seguir-reservado">
                <ASeguir resultado={aSeguir} instante={instante} agora={agora} cores={cores} />
              </div>
            )}
            {Array.isArray(partidas) && partidas.length === 0 && <p>Sem partidas registadas.</p>}

            {paginaDe(regiao, escolhido) && (
              <p className="cartao-accoes">
                <a href={paginaDe(regiao, escolhido)!.href}>{paginaDe(regiao, escolhido)!.texto}</a>
              </p>
            )}

            {/* A NOTA É SOBRE HORÁRIOS, e por isso só aparece onde há horários.
              Num cartão de uma praça de táxi não há horário nenhum a ser
              planeado, e a nota só confundia. */}
            {(escolhido.tipo === 'paragem' || escolhido.tipo === 'estacao') && (
              <p className="secundario">Horários planeados, não em tempo real.</p>
            )}
          </section>
        )}

        {/* AS DIREÇÕES: duas cartas, e o mapa entre elas — o cartão de cima com
          de onde e para onde, a folha de baixo com as opções. Não são filhas
          de um cartão só de propósito: é a separação que faz isto parecer o
          que as pessoas já sabem usar. */}
        {direcoes && (
          <Direccoes
            key={direcoes.vez}
            regiao={regiao}
            pontos={osPontos}
            aoTentarOsPontos={tentarOsPontos}
            modosDesligados={modosDesligados}
            motorDaRegiao={motorDaRegiao}
            servicosSemDatas={servicosSemDatas}
            temAPedido={temAPedido}
            deInicial={direcoes.de}
            paraInicial={direcoes.para}
            diaInicial={direcoes.dia}
            horaInicial={direcoes.hora}
            focoInicial={direcoes.foco}
            aviso={avisoDoEndereco}
            variante="mapa"
            encolhido={encolhido}
            aoEncolher={encolher}
            aoFechar={() => {
              tinhaFoco.current = true;
              fecharDirecoes();
            }}
            aoMudar={(v) => {
              // O QUE SE MUDA DENTRO DAS DIREÇÕES NÃO EMPILHA: o dia, a hora,
              // a outra ponta. Um «voltar» fecha as direções, e não desfaz a
              // última hora escolhida. A camada fica a que estava — se as
              // direções vieram de uma ligação, fechar não pode voltar atrás.
              escrever(camadaNoHistorico(), `/${comoProcura(escreverViagem(v))}`, false);
            }}
            aoDesenhar={(p, origem) => {
              setPercurso(p);
              // Escolher uma opção é pedir para a VER: a folha desce. A
              // primeira, que se desenha sozinha, não desce — quem acabou de
              // procurar está a ler as opções.
              if (p && origem === 'escolha') encolher(true);
            }}
          />
        )}

        {/* O QUE APARECE NO MAPA — uma fila de botões, como as camadas do Maps.
         *
         * São `aria-pressed` e não caixas de seleção: cada um é um interruptor
         * que se carrega, e é assim que um leitor de ecrã o anuncia («ligado»,
         * «desligado»). Ligar e desligar não refaz os dados — só esconde a
         * camada —, por isso é imediato e não perde a posição do mapa.
         *
         * Desligar TUDO é uma escolha legítima: quem quer ver só as ruas tem
         * direito a um mapa sem pontos.
         *
         * A marca é a mesma que o mapa desenha: comboio, expresso e táxi eram
         * três cinzentos quase iguais (P1-010), e só a forma os separa sem
         * pedir que se distingam cores — a placa com o pictograma no comboio
         * e no táxi, o anel no expresso. */}
        {!direcoes && camadas.length > 1 && (
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
                  className={`pilula pilula-${c.forma}${c.fundo === '#ffffff' ? ' pilula-clara' : ''}`}
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
                  <span
                    className="pilula-cor"
                    style={{ '--cor-da-camada': c.cor } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {c.forma === 'placa' && <DoModo modo={c.modo} tamanho={14} />}
                  </span>
                  {c.rotulo}
                </button>
              );
            })}
          </div>
        )}

        <MenuDoMapa
          regiao={regiao}
          marca={marca}
          assinatura={assinatura}
          temAPedido={temAPedido}
          aberto={menu}
          aoFechar={() => setMenu(false)}
        />

        {/* SÓ HÁ ESTE COMPONENTE ONDE HÁ MAPA. Uma região sem mosaicos abre
            na vista sem mapa (`CatalogoDaRegiao`), e não numa caixa cinzenta
            a dizer que falta o recorte — que era o primeiro ecrã das
            demonstrações (P2-041). */}
        <Mapa
          centro={centro}
          tipos={tipos}
          pontos={pontos as Marca[]}
          aoEscolher={abrir}
          aoLocalizar={(lat, lon) => setAqui([lat, lon])}
          mosaicos={mosaicos}
          atribuicao={atribuicaoDoMapa}
          foco={!percurso && escolhido ? { lat: escolhido.lat, lon: escolhido.lon } : null}
          percurso={percurso?.geo ?? null}
          alternativas={percurso?.outras ?? null}
          etiqueta={percurso?.meio ?? null}
          enquadrar={percurso?.caixa ?? null}
          // Na secretária, só o respiro dos botões do canto de baixo.
          margemInferior={lateral ? 48 : tapadoEmBaixo}
          margemEsquerda={lateral}
          margemSuperior={lateral ? 0 : tapadoEmCima}
          margensMedidas={medido}
          modosVisiveis={visiveis}
        />

        {/* A FOLHA DE ABERTURA: por onde se pode ir, antes de se perguntar nada.
         *
         * O Maps põe aqui «De carro · A pé · De bicicleta» em círculos grandes,
         * e por baixo os transportes públicos. A pergunta é a mesma; os modos é
         * que são outros — e são os que ESTA REGIÃO declara, não uma lista
         * escrita aqui. Uma região sem comboio não mostra comboio.
         *
         * É o que responde a quem abre isto sem saber o que aqui há. A procura
         * serve quem já sabe o nome; isto serve quem não sabe. */}
        {!direcoes && !escolhido && (
          <section className="folha-de-abertura" aria-labelledby="abertura">
            {/* A MARCA DA REDE NO PRIMEIRO ECRÃ (P1-008). O mapa ocupa o ecrã
              todo e o cabeçalho sai da frente; sem isto, quem abria o sítio
              da sua autoridade de transportes não via de quem ele era — e o
              primeiro ecrã é onde se confirma que se está no serviço oficial,
              e não numa aplicação qualquer. */}
            <p className="assinatura-da-folha">
              <AssinaturaDaRegiao
                regiao={regiao}
                marca={marca}
                principal={assinatura.principal}
                secundario={assinatura.secundario}
                altura={28}
                emLinha
              />
            </p>
            <h2 id="abertura" className="so-para-leitores">
              Por onde começar
            </h2>
            {/* «PARA ONDE VAIS?», ONDE O POLEGAR CHEGA (§6, P3-025).
              É a primeira pergunta da página inicial, e estava escrita numa
              nota pequena que mandava procurar «de onde partes» na caixa de
              cima — o contrário do que o cartão fazia (P2-001). Agora é um
              botão do tamanho de um campo, no fundo do ecrã: abre as direções
              com o foco no destino, e a primeira sugestão da partida é «A minha
              localização». */}
            <button
              type="button"
              className="para-onde-vais"
              onClick={() => abrirDirecoes(null, null, 'para')}
            >
              <Chegada />
              <span>Para onde vais?</span>
            </button>

            {/* PERTO DE TI, NO MAPA (P2-016). Vivia escondido em «A rede», e o
              botão da localização do mapa só punha um ponto azul. Agora as duas
              portas dão ao mesmo: o botão de texto, para quem não reconhece o
              ícone, e o do mapa — e a folha diz o que passa ali perto. */}
            <PertoDeTi
              regiao={regiao}
              pontos={pontos}
              variante="mapa"
              posicao={aqui}
              aoEscolher={abrir}
            />

            <h2 className="titulo-dos-modos">O que há {emDaRegiao}</h2>
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
              <Link href="/rede/">
                <Lista tamanho={18} />
                Tudo em lista, sem mapa
              </Link>
            </p>
          </section>
        )}
      </div>
    </DisponibilidadeBicicletas>
  );
}
