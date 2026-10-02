'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from '@/componentes/Ligacao';
import EscolherPonto from './EscolherPonto';
import Distintivo from './Distintivo';
import {
  APe,
  Bicicleta as IconeBicicleta,
  Autocarro,
  Chegada,
  DoModo,
  Fechar as IconeFechar,
  Partida,
  Partilhar as IconePartilhar,
  Recarregar,
  Seta,
  Trocar,
} from './Icones';
import { viagemProcurada, viagemSemResposta, motorIndisponivel } from '@/lib/medicao';
import {
  calendarioDe,
  chaveDoDia,
  chaveMais,
  dataCompleta,
  dataDoCampo,
  diaCurto,
  diaDaSemana,
  horaDoRelogio,
  periodoDe,
  quandoE,
} from '@/lib/dias';
import { seguro, type APedido, type Ponto } from '@/lib/formato';
import {
  planear,
  capacidadeDe,
  proximaLigacao,
  SemLigacao,
  type Capacidade,
} from '@/lib/planeador';
import { arrumarParaMostrar, contarTransbordos } from '@/lib/viagens';
import { aPedidoNasPontas, type PropostaAPedido } from '@/lib/a-pedido';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { comoProcura, escreverViagem } from '@/lib/endereco-da-viagem';
import {
  MotorIndisponivel,
  minutos,
  horaDe,
  diaDe,
  percursoDe,
  caixaDe,
  MODOS,
  NOME_DO_MODO,
  CLASSE_DO_MODO,
  type Modo,
  type Itinerario,
  type Perna,
  type PercursoGeo,
} from '@/lib/otp';

/**
 * AS DIREÇÕES, na gramática que toda a gente já sabe usar.
 *
 * **Duas cartas, e o mapa entre elas.** Não é decoração: é o que faz uma
 * aplicação de mapa parecer uma aplicação de mapa. Em cima, sempre à vista,
 * de onde e para onde — com um ponto, um tracejado e um alfinete, que dizem
 * «partida» e «chegada» sem gastarem uma palavra. Em baixo, uma folha que
 * sobe com as opções e desce para se ver o mapa.
 *
 * O que está aqui dentro e não se vê ao primeiro olhar:
 *
 * - **«A minha localização» é a primeira sugestão do campo de partida**, e
 *   não um botão ao lado. Continua a exigir um toque — é a única forma como
 *   este sítio alguma vez pede a localização;
 * - **procura-se sozinho** assim que há duas pontas, e nos três modos ao
 *   mesmo tempo, para a fila de cima poder dizer quanto demora cada um;
 * - **cada opção é uma linha** — a pé 5 › 728 › 714, com o tempo em grande à
 *   direita — em vez de três parágrafos. Assim comparam-se cinco de relance;
 * - **«não há» é uma resposta e não um fim**: diz quando é a próxima
 *   ligação, e propõe o transporte a pedido onde ele serve as pontas.
 *
 * E o que NÃO se copia do Maps: os campos são comboboxes a sério, a pega da
 * folha é um botão (um arrasto não funciona com teclado nem com comando de
 * voz), os ícones são todos `aria-hidden` com o texto ao lado, e o resultado
 * é anunciado por uma região viva. A parte bonita não pode custar a legal.
 */

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'a-procurar' }
  /** `data` e `hora`: o que se perguntou, para o vazio poder dizer de quando é. */
  | { tipo: 'resultados'; data: string; hora: string }
  /**
   * PORQUE é que não se procurou — e cada razão pede uma frase diferente.
   * `sem-ligacao`: a grelha não chegou; `motor`: o motor de viagens não
   * respondeu; `outro`: o resto. Nenhuma delas mostra ao público o código
   * HTTP nem a mensagem do motor, em inglês: isso vai para a consola e para a
   * medição, que é onde serve a alguém.
   */
  | { tipo: 'erro'; motivo: 'sem-ligacao' | 'motor' | 'outro' };

type PorModo = Record<Modo, Itinerario[] | null>;
const VAZIO: PorModo = { transporte: null, 'a-pe': null, bicicleta: null };

/**
 * A localização de quem procura, como primeira sugestão do campo de partida.
 *
 * Tem `lat` a `NaN` de propósito: é um pedido, não um sítio. Quem o escolher
 * dispara a pergunta ao navegador, e só aí é que passa a ter coordenadas.
 * Vive fora do componente para ser sempre o MESMO objeto — a lista de
 * resultados é memorizada, e um objeto novo a cada renderização refá-la toda.
 */
const AQUI: Ponto = {
  nome: 'A minha localização',
  lat: NaN,
  lon: NaN,
  tipo: 'aqui',
  id: '',
  concelho: '',
};

const ehPedidoDeLocalizacao = (p: Ponto | null) => !!p && p.tipo === 'aqui' && Number.isNaN(p.lat);

export type Percurso = {
  geo: PercursoGeo;
  caixa: [[number, number], [number, number]] | null;
  /** Onde pousar a bolha com o tempo. */
  meio: { lat: number; lon: number; texto: string } | null;
  /** As outras opções, a cinzento por baixo. */
  outras: PercursoGeo;
};

/** A viagem como está agora — o que vai para o endereço. */
export type ViagemAgora = {
  de: Ponto | null;
  para: Ponto | null;
  dia: string | null;
  hora: string | null;
};

/** As opções de um dia que não é o pedido: a próxima ligação (P2-003). */
type Proxima = { dia: string; its: Itinerario[] } | null;

export default function Direccoes({
  pontos,
  regiao,
  deInicial = null,
  paraInicial = null,
  diaInicial = null,
  horaInicial = null,
  focoInicial = null,
  aviso = null,
  aoDesenhar,
  aoFechar,
  aoMudar,
  variante = 'pagina',
  encolhido = false,
  aoEncolher,
  modosDesligados = [],
  motorDaRegiao = '',
  servicosSemDatas = 0,
  temAPedido = false,
}: {
  pontos: Ponto[];
  regiao: string;
  /**
   * Quantos serviços desta região ainda não têm os dias em que circulam
   * (`lacunas.json`). O planeador não os conta — e só quando há algum é que
   * o vazio o pode dizer. Dizê-lo sempre culpava um calendário já transcrito.
   */
  servicosSemDatas?: number;
  /** Os módulos que o painel desligou: o planeador não propõe as linhas deles. */
  modosDesligados?: string[];
  /** O endereço do motor desta região, lido no servidor. '' quando não há. */
  motorDaRegiao?: string;
  deInicial?: Ponto | null;
  paraInicial?: Ponto | null;
  /** O dia e a hora pedidos (`AAAA-MM-DD`, `HH:MM`) — sem eles, é «agora». */
  diaInicial?: string | null;
  horaInicial?: string | null;
  /** O campo que recebe o foco ao abrir: o que falta preencher. */
  focoInicial?: 'de' | 'para' | null;
  /** O que o endereço pediu e não se pôde abrir — dito à cabeça. */
  aviso?: string | null;
  /** Se a região tem transporte a pedido — e se vale a pena perguntar-lhe. */
  temAPedido?: boolean;
  /** O mapa liga-se aqui; a página `/viagem/` não. */
  aoDesenhar?: (p: Percurso | null, origem: 'automatico' | 'escolha') => void;
  aoFechar?: () => void;
  /** Cada mudança na pergunta — para o endereço a acompanhar (P2-027). */
  aoMudar?: (v: ViagemAgora) => void;
  variante?: 'pagina' | 'mapa';
  encolhido?: boolean;
  aoEncolher?: (sim: boolean) => void;
}) {
  const agora = new Date();
  const [de, setDe] = useState<Ponto | null>(deInicial);
  const [para, setPara] = useState<Ponto | null>(paraInicial);
  const [quando, setQuando] = useState<'agora' | 'marcado'>(diaInicial ? 'marcado' : 'agora');
  // O DIA E A HORA DO MESMO RELÓGIO. O dia vinha do `toISOString()`, que é
  // UTC, e a hora do relógio de quem lê: no verão, entre a meia-noite e a uma,
  // o campo abria no dia de ontem (`dataDoCampo`, em `lib/dias.ts`).
  const [data, setData] = useState(diaInicial ?? dataDoCampo(agora));
  const [hora, setHora] = useState(horaInicial ?? horaDoRelogio(agora));
  const [abertoQuando, setAbertoQuando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [porModo, setPorModo] = useState<PorModo>(VAZIO);
  const [modo, setModo] = useState<Modo>('transporte');
  const [escolhido, setEscolhido] = useState(0);
  const [comDesvios, setComDesvios] = useState(false);
  const [proxima, setProxima] = useState<Proxima>(null);
  const [aProcurarProxima, setAProcurarProxima] = useState(false);
  /** O motor caiu, e quem respondeu foi o planeador do navegador (P2-040). */
  const [motorEmBaixo, setMotorEmBaixo] = useState(false);
  const [aPedidoDaRegiao, setAPedidoDaRegiao] = useState<APedido | null>(null);
  const [partilha, setPartilha] = useState<string | null>(null);
  const [localizacao, setLocalizacao] = useState<'parada' | 'a-perguntar' | 'recusada' | 'sem'>(
    'parada',
  );

  /** As pontas, quando há duas a sério: é contra elas que uma volta se mede. */
  const pontas =
    de && para && Number.isFinite(de.lat) && Number.isFinite(para.lat)
      ? {
          de: { nome: de.nome, lat: de.lat, lon: de.lon },
          para: { nome: para.nome, lat: para.lat, lon: para.lon },
        }
      : null;

  /**
   * O dia a partir do qual se conta «amanhã».
   *
   * É o dia PERGUNTADO e não o de hoje: quem marca uma viagem para sábado tem
   * de ler «domingo, 07:30» e não «amanhã, 07:30». Com `partir agora` os dois
   * coincidem, e é por isso que o engano passava despercebido.
   */
  const referencia = new Date(`${data}T${hora}:00`).getTime();

  function usarALocalizacao() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocalizacao('sem');
      return;
    }
    setLocalizacao('a-perguntar');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDe({ ...AQUI, lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocalizacao('parada');
      },
      () => setLocalizacao('recusada'),
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function escolherDe(p: Ponto | null) {
    if (ehPedidoDeLocalizacao(p)) {
      usarALocalizacao();
      return;
    }
    setDe(p);
  }

  function desenhar(lista: Itinerario[], i: number, origem: 'automatico' | 'escolha') {
    setEscolhido(i);
    const it = lista[i];
    if (!aoDesenhar) return;
    if (!it) {
      aoDesenhar(null, origem);
      return;
    }
    const geo = percursoDe(it);
    if (!geo.features.length) {
      aoDesenhar(null, origem);
      return;
    }
    const outras: PercursoGeo = {
      type: 'FeatureCollection',
      features: lista.flatMap((o, j) => (j === i ? [] : percursoDe(o).features)),
    };
    aoDesenhar({ geo, caixa: caixaDe(geo), meio: meioDe(it, geo), outras }, origem);
  }

  // PROCURA-SE SOZINHO ASSIM QUE HÁ DUAS PONTAS, e nos três modos ao mesmo
  // tempo — a fila de cima só pode dizer «a pé 1 h 4» se alguém tiver
  // perguntado. A `ultima` impede que uma renderização a mais conte como uma
  // pergunta nova; a `daVez` impede que uma resposta antiga tape uma recente.
  const ultima = useRef('');
  const daVez = useRef(0);

  async function procurar(forcar = false) {
    if (!de || !para || Number.isNaN(de.lat) || Number.isNaN(para.lat)) return;
    // «Agora» é agora À HORA DE PROCURAR, e não a hora a que a página abriu.
    const n = new Date();
    const d = quando === 'agora' ? dataDoCampo(n) : data;
    const h = quando === 'agora' ? horaDoRelogio(n) : hora;

    const chave = `${de.lat},${de.lon}|${para.lat},${para.lon}|${quando}|${data}|${hora}`;
    if (!forcar && chave === ultima.current) return;
    ultima.current = chave;

    const meu = ++daVez.current;
    setEstado({ tipo: 'a-procurar' });
    setPorModo(VAZIO);
    setProxima(null);
    setComDesvios(false);
    setPartilha(null);
    aoDesenhar?.(null, 'automatico');

    // O NOME VAI JUNTO, e não é enfeite: sem motor de ruas, a primeira e a
    // última perna são «a pé de <onde estás> até <a paragem>», e sem o nome
    // sairiam duas pernas a pé sem princípio nem fim.
    const pontaDe = { nome: de.nome, lat: de.lat, lon: de.lon };
    const pontaPara = { nome: para.nome, lat: para.lat, lon: para.lon };
    let motor = motorDaRegiao;
    const pedir = (m: Modo, comMotor = motor) =>
      planear(regiao, pontaDe, pontaPara, d, h, m, modosDesligados, comMotor);

    let its: Itinerario[];
    try {
      try {
        its = await pedir('transporte');
      } catch (err) {
        // O MOTOR CAIU, E A GRELHA ESTÁ AQUI (P2-040). Uma região com motor
        // passava de «responde, com o troço a pé estimado em linha reta» para
        // «não responde» no dia em que o contentor dele caísse — e o
        // planeador do navegador sabe responder sozinho, a partir dos mesmos
        // horários. Quem mantém o motor fica a saber pela medição.
        if (!(err instanceof MotorIndisponivel) || !motor) throw err;
        console.error('planeador: o motor não respondeu —', err.message);
        motorIndisponivel(err.message);
        motor = '';
        setMotorEmBaixo(true);
        its = await pedir('transporte', '');
      }
      if (meu !== daVez.current) return;
      setPorModo((v) => ({ ...v, transporte: its }));
      setModo('transporte');
      setEstado({ tipo: 'resultados', data: d, hora: h });
      // A RECOMENDADA desenha-se logo — e não a primeira da lista, que podia
      // ser o desvio de quatro horas (P2-009). Mostrar cinco cartões e um
      // mapa vazio é fazer a pergunta outra vez.
      const arrumadasAgora = arrumarParaMostrar(its, { de: pontaDe, para: pontaPara });
      desenhar(arrumadasAgora.opcoes, arrumadasAgora.recomendada, 'automatico');

      // O que se mede é a LIGAÇÃO procurada, pelo nome das duas paragens, e
      // nunca quem a procurou. Para planear uma rede faz falta saber o quê,
      // não quem: por isso a localização vai como «A minha localização», e a
      // coordenada de quem procura não sai do navegador.
      const comTransporte = its.filter((i) => i.legs.some((p) => p.mode !== 'WALK'));
      const melhor = comTransporte.length
        ? comTransporte.reduce((a, b) => (a.duration <= b.duration ? a : b))
        : null;
      viagemProcurada({
        de: de.nome,
        para: para.nome,
        data: d,
        hora: h,
        opcoes: its.length,
        minutosMelhor: melhor ? Math.round(melhor.duration / 60) : null,
        transbordosMelhor: melhor ? contarTransbordos(melhor) : null,
        linhas: melhor ? melhor.legs.map((p) => p.route?.shortName ?? '').filter(Boolean) : [],
      });
      // UMA PERGUNTA FORA DOS HORÁRIOS NÃO É UMA VIAGEM SEM RESPOSTA. O que
      // se mede aqui é para quem planeia a rede saber que ligações faltam; um
      // dia que já passou, ou para lá do que está carregado, não diz nada
      // sobre a rede.
      if (
        arrumadasAgora.opcoes.length === 0 &&
        !foraDosHorarios(d) &&
        d >= dataDoCampo(new Date())
      ) {
        if (its.length === 0) viagemSemResposta({ de: de.nome, para: para.nome, data: d, hora: h });
        // E A PRÓXIMA PROCURA-SE: o vazio passa a ser uma resposta (P2-003).
        // Também quando só há voltas: entre duas cidades vizinhas, ir à
        // capital e voltar não é a resposta — a próxima ligação direta é.
        setAProcurarProxima(true);
        proximaLigacao(regiao, pontaDe, pontaPara, d, modosDesligados, motor, periodo?.fim ?? null)
          .then((p) => {
            if (meu !== daVez.current) return;
            setProxima(p);
            if (p) {
              const a = arrumarParaMostrar(p.its, { de: pontaDe, para: pontaPara });
              desenhar(a.opcoes, a.recomendada, 'automatico');
            }
          })
          .catch(() => {})
          .finally(() => meu === daVez.current && setAProcurarProxima(false));
      }
    } catch (err) {
      if (meu !== daVez.current) return;
      if (err instanceof SemLigacao) {
        setEstado({ tipo: 'erro', motivo: 'sem-ligacao' });
        return;
      }
      const doMotor = err instanceof MotorIndisponivel;
      // O DETALHE VAI PARA QUEM O LÊ. «O motor de viagens respondeu 502» ou a
      // mensagem do GraphQL em inglês não dizem nada a quem está na paragem;
      // a quem mantém o motor dizem tudo — e chegam-lhe pela consola e pela
      // medição.
      console.error('planeador:', err instanceof Error ? err.message : err);
      if (doMotor) motorIndisponivel(err.message);
      setEstado({ tipo: 'erro', motivo: doMotor ? 'motor' : 'outro' });
      return;
    }

    // A pé e de bicicleta chegam depois e sem pressa: o separador aparece
    // quando a resposta chegar, e se não houver caminho não aparece nada — um
    // separador com um travessão não é informação, é ruído.
    for (const m of ['a-pe', 'bicicleta'] as const) {
      pedir(m)
        .then((r) => {
          if (meu === daVez.current && r.length) setPorModo((v) => ({ ...v, [m]: r }));
        })
        .catch(() => {});
    }
  }

  useEffect(() => {
    procurar();
    // De propósito só nestas: são as que mudam a pergunta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, para, quando, data, hora]);

  // O ENDEREÇO ACOMPANHA A PERGUNTA (P2-027): quem muda a hora ou a outra
  // ponta fica com um endereço que a repete, e que se pode partilhar.
  const mudou = useRef(aoMudar);
  mudou.current = aoMudar;
  useEffect(() => {
    mudou.current?.({
      de,
      para,
      dia: quando === 'marcado' ? data : null,
      hora: quando === 'marcado' ? hora : null,
    });
  }, [de, para, quando, data, hora]);

  // O formulário, para pôr o foco no campo que ficou por preencher.
  const formulario = useRef<HTMLFormElement>(null);
  const campos = () =>
    formulario.current?.querySelectorAll<HTMLInputElement>('input[role="combobox"]') ?? [];

  // O FOCO NO CAMPO QUE FALTA, quando as direções abrem por um gesto. Abriam
  // sem foco nenhum: o cartão desmontava e o foco caía no `<body>`, e quem usa
  // teclado ia parar à atribuição do mapa no Tab seguinte (P3-014).
  useEffect(() => {
    if (!focoInicial) return;
    campos()[focoInicial === 'de' ? 0 : 1]?.focus({ preventScroll: true });
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trocar() {
    setDe(para);
    setPara(de);
    // COM UM DOS LADOS VAZIO, O FOCO VAI PARA ELE. É o gesto de quem acabou
    // de pôr a paragem no lado certo: a seguir escreve o outro — e quem usa
    // leitor de ecrã ouve qual é o campo que falta.
    if (!de !== !para) {
      const vazio = de ? 0 : 1;
      requestAnimationFrame(() => campos()[vazio]?.focus());
    }
  }

  function mudarModo(m: Modo) {
    setModo(m);
    setComDesvios(false);
    if (m === 'transporte') desenhar(daTransporte.base, daTransporte.recomendada, 'escolha');
    else desenhar(porModo[m] ?? [], 0, 'escolha');
  }

  /**
   * PARTILHAR A VIAGEM (P2-027): o endereço do `/viagem/` com as pontas, o dia
   * e a hora — o que se partilha é a pergunta, e quem a recebe vê as opções
   * no dia dele. A folha de partilha do telemóvel quando existe; senão,
   * copia-se a ligação e diz-se que se copiou.
   */
  async function partilhar() {
    const q = escreverViagem({
      de,
      para,
      dia: quando === 'marcado' ? data : null,
      hora: quando === 'marcado' ? hora : null,
    });
    const endereco = `${window.location.origin}/viagem/${comoProcura(q)}`;
    const titulo = `Como chegar a ${para?.nome ?? ''}`.trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, url: endereco });
        setPartilha(null);
        return;
      }
      await navigator.clipboard.writeText(endereco);
      setPartilha('Ligação copiada. Quem a abrir vê esta viagem.');
    } catch (e) {
      // Fechar a folha de partilha sem escolher nada não é um erro.
      if (e instanceof Error && e.name === 'AbortError') return;
      setPartilha(`Não foi possível copiar. A ligação é: ${endereco}`);
    }
  }

  /**
   * NÃO HÁ MOTOR — e há duas maneiras de não haver.
   *
   * A primeira é não estar configurado: o endereço vem vazio, e sabe-se em
   * tempo de construção.
   *
   * A segunda custou uma procura falhada a quem abriu isto no telemóvel. O
   * endereço estava lá, e era `http://127.0.0.1:8801` — o OTP da máquina que
   * CONSTRUIU o sítio. Numa página servida por `https://`, o navegador nem
   * tenta: bloqueia `http://` como conteúdo misto. A caixa de procura estava
   * à vista, aceitava a viagem e falhava sempre.
   *
   * A causa foi corrigida onde nasce — a entrega reconstrói com o endereço
   * público —, e isto fica como segunda linha: um endereço que o navegador
   * não pode usar vale o mesmo que endereço nenhum, e mais vale dizê-lo antes
   * de alguém escrever para onde quer ir.
   *
   * Corre num efeito e não no render porque a resposta depende do PROTOCOLO
   * DA PÁGINA, que só existe no navegador. Calculá-la no render fazia o
   * servidor e o cliente desenharem coisas diferentes.
   */
  const motor = motorDaRegiao;
  // Quem responde às direções — e se responde de todo.
  //
  // Com motor, ele. Sem motor, o planeador que corre aqui mesmo a partir da
  // grelha horária. `semMotor` deixou de querer dizer «não há servidor» e
  // passou a querer dizer o que sempre devia ter querido: **não há resposta**.
  //
  // E «não há resposta» tem duas causas que se dizem de maneira oposta (ver
  // `Capacidade.falta`): a região não publica a grelha, ou a grelha não
  // chegou. A segunda dizia-se como a primeira — «esta região ainda não tem
  // horários» a quem só tinha perdido a rede um momento.
  const [falta, setFalta] = useState<Capacidade['falta'] | null>(null);
  const [porqueEstimado, setPorqueEstimado] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    capacidadeDe(regiao, motor).then((c) => {
      if (!vivo) return;
      setFalta(c.falta ?? null);
      setPorqueEstimado(c.aPeExato ? null : c.porque);
      // Voltou: a pergunta que ficou por responder faz-se agora.
      if (tentativa > 0 && !c.falta) procurar(true);
    });
    return () => {
      vivo = false;
    };
    // `procurar` muda a cada renderização; o que decide é a tentativa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiao, motor, tentativa]);

  /** Outra vez, com um toque: a grelha, o calendário e a procura. */
  function tentarDeNovo() {
    setFalta(null);
    setEstado({ tipo: 'parado' });
    setTentativa((n) => n + 1);
  }

  // O PERÍODO DOS HORÁRIOS, da mesma tabela de dias que as paragens usam. É
  // o que distingue «não há ligação neste dia» de «não temos os horários
  // desse dia» — duas respostas opostas para quem está a planear, que até
  // aqui eram a mesma.
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setPeriodo(c ? periodoDe(c) : null));
    return () => {
      vivo = false;
    };
  }, [regiao, tentativa]);

  // O TRANSPORTE A PEDIDO DA REGIÃO, buscado só depois de uma resposta — e só
  // numa região que o tem. Quem pergunta pela rede regular e tem opções não
  // paga o ficheiro; quem fica sem nenhuma recebe o que mais lhe pode servir.
  useEffect(() => {
    if (!temAPedido || aPedidoDaRegiao || estado.tipo !== 'resultados') return;
    let vivo = true;
    fetch(enderecoDosDados(regiao, 'a-pedido.json'))
      .then((r) => (r.ok ? (r.json() as Promise<APedido>) : null))
      .then((d) => vivo && d?.zonas && setAPedidoDaRegiao(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [temAPedido, aPedidoDaRegiao, estado.tipo, regiao]);

  /** `AAAA-MM-DD` fora do período carregado — antes do princípio ou depois do fim. */
  function foraDosHorarios(dia: string): boolean {
    const k = dia.replace(/-/g, '');
    return !!periodo && (k < periodo.inicio || k > periodo.fim);
  }

  /**
   * O concelho de uma ponta: o dela, quando o índice o diz; senão o da
   * paragem mais perto, a menos de dois quilómetros — um sítio, uma rua, a
   * localização de quem pergunta. Mais longe do que isso não se adivinha.
   */
  function concelhoDe(p: Ponto | null): string | null {
    if (!p) return null;
    if (p.concelho && p.concelho !== 'fora-da-regiao') return p.concelho;
    if (!Number.isFinite(p.lat)) return null;
    let melhor: { d: number; c: string } | null = null;
    for (const q of pontos) {
      if (q.tipo !== 'paragem' || !q.concelho) continue;
      const d = Math.hypot(
        (q.lat - p.lat) * 111_320,
        (q.lon - p.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180),
      );
      if (d <= 2000 && (!melhor || d < melhor.d)) melhor = { d, c: q.concelho };
    }
    return melhor?.c ?? null;
  }

  const quandoLegivel =
    quando === 'agora' ? 'Partir agora' : `Partir às ${hora}, ${diaLegivel(data)}`;
  const noMapa = variante === 'mapa';

  /**
   * O que a folha tem para dizer quando não há opções para mostrar — UMA
   * frase, e não duas. Com a grelha a falhar, a folha dizia ao mesmo tempo
   * «esta região ainda não tem horários» e «não deu para procurar», e as duas
   * estavam erradas.
   */
  const problema: 'sem-horarios' | 'sem-ligacao' | 'motor' | 'outro' | null =
    falta ?? (estado.tipo === 'erro' ? estado.motivo : null);

  /**
   * AS OPÇÕES, ARRUMADAS (P2-009): as que se mostram, os desvios à parte, e
   * qual se abre sozinha.
   *
   * Sem nenhuma que não seja uma volta, a resposta é a PRÓXIMA LIGAÇÃO (P2-003)
   * — e as voltas de hoje ficam por baixo, a um toque, com o dia escrito em
   * cada uma. Para a pé e de bicicleta há uma só opção, e é essa.
   */
  const hoje = arrumarParaMostrar(porModo.transporte ?? [], pontas);
  const semOpcoesHoje = estado.tipo === 'resultados' && !problema && hoje.opcoes.length === 0;
  /** Hoje há caminhos, mas todos dão uma volta grande. */
  const soDesviosHoje = semOpcoesHoje && hoje.desvios.length > 0;
  const naProxima = semOpcoesHoje && !!proxima;
  const daProxima = proxima ? arrumarParaMostrar(proxima.its, pontas) : null;
  const daTransporte = naProxima
    ? { base: daProxima!.opcoes, recomendada: daProxima!.recomendada }
    : { base: hoje.opcoes, recomendada: hoje.recomendada };
  const base = modo === 'transporte' ? daTransporte.base : (porModo[modo] ?? []);
  /** O que está na lista agora — com os desvios de hoje no fim, quando se pedem. */
  const lista = modo === 'transporte' && comDesvios ? [...base, ...hoje.desvios] : base;
  const recomendada = modo === 'transporte' ? daTransporte.recomendada : 0;

  /** Qual das opções é a mais curta. Índice, porque a lista está por partida. */
  const maisRapida = lista.reduce(
    (melhor, it, i) => (it.duration < lista[melhor].duration ? i : melhor),
    0,
  );

  // As propostas a pedido: as que servem as duas pontas, quando a rede
  // regular tem opções; as de qualquer ponta, quando não tem nenhuma hoje.
  const propostas: PropostaAPedido[] =
    aPedidoDaRegiao && estado.tipo === 'resultados' && !problema && de && para
      ? aPedidoNasPontas(
          aPedidoDaRegiao,
          { nome: de.nome, concelho: concelhoDe(de) },
          { nome: para.nome, concelho: concelhoDe(para) },
          (c) => `/${c}`,
          { soAsDuas: !semOpcoesHoje },
        )
      : [];

  /**
   * O RESUMO QUE SE OUVE (P3-017). A região viva envolvia a lista inteira, e
   * cada procura era anunciada como um bloco — cinco opções lidas de seguida,
   * outra vez a cada hora escolhida. Agora diz-se quantas são e quando parte e
   * chega a primeira; as opções leem-se a seguir, uma a uma, quando se quer.
   */
  const resumoFalado = (() => {
    if (estado.tipo !== 'resultados' || problema || !lista.length) return '';
    const it = lista[recomendada] ?? lista[0];
    const quantas = lista.length === 1 ? '1 opção' : `${lista.length} opções`;
    const dia = diaDe(it.startTime, referencia);
    return (
      `${naProxima ? 'Noutro dia: ' : ''}${quantas}. ` +
      `A recomendada parte ${dia ? `${dia}, ` : ''}às ${horaDe(it.startTime)} e chega às ${horaDe(
        it.endTime,
      )}` +
      (lista.length > 1 && maisRapida !== recomendada
        ? `. A mais rápida é a ${maisRapida + 1}.ª.`
        : '.')
    );
  })();

  const podePartilhar = !!para && !Number.isNaN(para.lat) && estado.tipo === 'resultados';

  return (
    <>
      {/* ---- O CARTÃO DE CIMA: de onde, para onde. Sempre à vista. ---- */}
      <div className={noMapa ? 'cartao-de-cima' : 'cartao-de-cima em-pagina'}>
        <form
          ref={formulario}
          className="campos-viagem"
          onSubmit={(e) => {
            e.preventDefault();
            procurar(true);
          }}
        >
          <span className="marca-campo partida">
            <Partida />
          </span>
          <EscolherPonto
            className="sem-rotulo"
            regiao={regiao}
            etiqueta="De"
            // O rótulo está escondido à vista (`sem-rotulo`) e continua a ser
            // lido por leitor de ecrã. Quem VÊ ficava com dois retângulos
            // vazios, distinguidos só por um ponto e um alfinete — e o
            // alfinete não diz qual é a partida. A sugestão dá nome à caixa
            // sem lhe roubar altura, que é o que o cartão do mapa não tem.
            sugestao="De onde partes"
            pontos={pontos}
            valor={de}
            aoEscolher={escolherDe}
            opcaoEspecial={AQUI}
          />
          <button type="button" className="trocar" onClick={trocar} aria-label="Trocar de e para">
            <Trocar />
          </button>

          <span className="tracejado" aria-hidden="true" />
          <span className="divisor-campos" aria-hidden="true" />

          <span className="marca-campo chegada">
            <Chegada />
          </span>
          <EscolherPonto
            className="sem-rotulo"
            regiao={regiao}
            etiqueta="Para"
            sugestao="Para onde vais"
            pontos={pontos}
            valor={para}
            aoEscolher={setPara}
          />
          {/* Um botão de submeter que não se vê: é o que faz o Enter dentro
              de um campo procurar, como em qualquer formulário. FORA DA ORDEM
              DO TABULADOR (P3-015): recebia o foco com 1 px de largura, e
              durante esse Tab quem usa teclado não via onde estava. O Enter
              num campo continua a submeter. */}
          <button type="submit" className="so-para-leitores" tabIndex={-1}>
            Procurar
          </button>
        </form>

        {localizacao !== 'parada' && (
          <p className="secundario aviso-localizacao">
            {localizacao === 'a-perguntar' && 'A localizar…'}
            {localizacao === 'recusada' &&
              'Sem acesso à localização. Escreve o sítio de onde partes — funciona na mesma.'}
            {localizacao === 'sem' &&
              'Este navegador não dá a localização. Escreve o sítio de onde partes.'}
          </p>
        )}
      </div>

      {/* ---- A FOLHA DE BAIXO: o que há, e quanto demora. ---- */}
      <section
        className={`folha${encolhido ? ' encolhida' : ''}${noMapa ? '' : ' em-pagina'}`}
        aria-labelledby="folha-titulo"
      >
        {/* A pega do Maps, que aqui é um BOTÃO. Um arrasto não funciona com
            teclado, com comando de voz nem com leitor de ecrã; uma pega que
            também é botão funciona com tudo. */}
        {noMapa && aoEncolher && (
          <button
            type="button"
            className="pega"
            onClick={() => aoEncolher(!encolhido)}
            aria-expanded={!encolhido}
          >
            <span className="so-para-leitores">
              {encolhido ? 'Ver as opções' : 'Ver o mapa, escondendo as opções'}
            </span>
          </button>
        )}

        <div className="folha-titulo">
          <h2 id="folha-titulo">{MODOS[modo].nome}</h2>
          <span className="redondos">
            {podePartilhar && (
              <button
                type="button"
                className="redondo"
                onClick={partilhar}
                aria-label="Partilhar esta viagem"
              >
                <IconePartilhar />
              </button>
            )}
            {aoFechar && (
              <button
                type="button"
                className="redondo"
                onClick={aoFechar}
                aria-label="Fechar as direções"
              >
                <IconeFechar />
              </button>
            )}
          </span>
        </div>
        {partilha && (
          <p className="secundario partilha" role="status">
            {partilha}
          </p>
        )}

        {/* O QUE O ENDEREÇO PEDIU E NÃO SE PÔDE ABRIR, dito à cabeça. */}
        {aviso && (
          <div className="faixa">
            <p>{aviso}</p>
          </div>
        )}

        {/* A FILA DOS MODOS, com o tempo de cada um. É o que responde à
            pergunta que vem antes de todas: vale a pena esperar pelo
            autocarro? São botões e não separadores ARIA de propósito — um
            padrão de separadores mal feito é pior do que botões bem feitos. */}
        <div className="linha-de-controlos">
          {estado.tipo === 'resultados' && (
            <div className="modos" role="group" aria-label="Como ir">
              {(Object.keys(MODOS) as Modo[]).map((m) => {
                const todas = porModo[m];
                if (m !== 'transporte' && !todas?.length) return null;
                // O TEMPO DA OPÇÃO ABERTA, e não o da primeira nem o da mais
                // rápida: o botão anunciava «4 h 32» — o tempo do desvio — e
                // a opção aberta por baixo dizia outra coisa. Um número que
                // contradiz o que está logo a seguir não é um resumo.
                const mostrada =
                  m === modo
                    ? (lista[escolhido] ?? null)
                    : m === 'transporte'
                      ? (daTransporte.base[daTransporte.recomendada] ?? null)
                      : (todas?.[0] ?? null);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`modo${m === modo ? ' activo' : ''}`}
                    aria-pressed={m === modo}
                    onClick={() => mudarModo(m)}
                  >
                    {m === 'a-pe' ? (
                      <APe />
                    ) : m === 'bicicleta' ? (
                      <IconeBicicleta />
                    ) : (
                      <Autocarro />
                    )}
                    <span className="so-para-leitores">{MODOS[m].nome}, </span>
                    <span>{mostrada ? duracaoLegivel(mostrada.duration) : '—'}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* As etiquetas, como as do Maps: recarregar e a hora de partida. */}
          <p className="etiquetas">
            <button
              type="submit"
              form="nenhum"
              className="etiqueta so-icone"
              aria-label="Procurar de novo"
              aria-busy={estado.tipo === 'a-procurar'}
              onClick={() => procurar(true)}
            >
              <Recarregar />
            </button>
            <button
              type="button"
              className="etiqueta"
              aria-expanded={abertoQuando}
              onClick={() => setAbertoQuando((v) => !v)}
            >
              {quandoLegivel}
            </button>
          </p>
        </div>

        {abertoQuando && (
          <fieldset className="quando-escolha">
            <legend>Quando</legend>
            <label>
              <input
                type="radio"
                name="quando"
                value="agora"
                checked={quando === 'agora'}
                onChange={() => setQuando('agora')}
              />{' '}
              Agora
            </label>
            <label>
              <input
                type="radio"
                name="quando"
                value="marcado"
                checked={quando === 'marcado'}
                onChange={() => setQuando('marcado')}
              />{' '}
              Noutra altura
            </label>
            {quando === 'marcado' && (
              <div className="quando">
                <div>
                  <label htmlFor="data">Dia</label>
                  {/* OS LIMITES SÃO OS DOS HORÁRIOS CARREGADOS: escolher
                      um dia para lá deles dava «sem viagem», e o que
                      acontece é não termos o horário desse dia. */}
                  <input
                    id="data"
                    type="date"
                    value={data}
                    min={periodo ? comHifens(periodo.inicio) : undefined}
                    max={periodo ? comHifens(periodo.fim) : undefined}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="hora">A partir das</label>
                  <input
                    id="hora"
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                  />
                </div>
              </div>
            )}
          </fieldset>
        )}

        {problema === 'sem-horarios' && (
          // Dizer «não há viagem» quando o que há é um planeador sem dados é
          // mentir a quem está à espera do autocarro. E as páginas das LINHAS
          // não têm horas: o que se propõe são as das paragens.
          <div className="faixa alerta">
            <p>
              <strong>Esta região ainda não tem horários para o planeador.</strong> As páginas de
              cada paragem mostram as horas que lá passam.
            </p>
            <AsDuasParagens de={de} para={para} />
          </div>
        )}

        {/* O LUGAR DOS RESULTADOS ESTÁ GUARDADO desde o início (P3-009). A
            página saltava três vezes — «A preparar…», o formulário, os
            cartões — e o rodapé ia sendo empurrado debaixo do dedo de quem
            tentava tocar numa opção. */}
        <div className={`zona-de-resultados${noMapa ? '' : ' em-pagina'}`}>
          {/* O resultado chega depois. Sem isto, quem não vê a página não
              sabe que chegou — nem que está a demorar. A região viva leva as
              frases curtas; as opções ficam fora dela, para se lerem uma a
              uma em vez de serem despejadas todas de uma vez (P3-017). */}
          <div aria-live="polite" aria-busy={estado.tipo === 'a-procurar'}>
            {estado.tipo === 'parado' && !problema && (!de || !para) && (
              <p className="secundario">Escolhe de onde partes e para onde vais.</p>
            )}
            {estado.tipo === 'a-procurar' && !problema && (
              <p className="a-procurar">A procurar viagens…</p>
            )}

            {/* FALTA DE REDE NÃO É FALTA DE HORÁRIOS. A grelha que não chegou
                diz-se assim, com uma maneira de tentar outra vez. */}
            {problema === 'sem-ligacao' && (
              <div className="faixa alerta">
                <h3>Não foi possível descarregar os horários</h3>
                <p>
                  Pode ser da ligação à Internet. Não quer dizer que não haja viagem: tenta de novo
                  daqui a pouco.
                </p>
                <p>
                  <button type="button" className="botao" onClick={tentarDeNovo}>
                    Tentar de novo
                  </button>
                </p>
              </div>
            )}

            {(problema === 'motor' || problema === 'outro') && (
              <div className="faixa alerta">
                <h3>O planeador não respondeu</h3>
                <p>Tenta daqui a pouco. Os horários de cada paragem continuam a funcionar.</p>
                <AsDuasParagens de={de} para={para} />
                <p>
                  <button type="button" className="botao" onClick={tentarDeNovo}>
                    Tentar de novo
                  </button>
                </p>
              </div>
            )}

            {semOpcoesHoje &&
              (foraDosHorarios(estado.data) ? (
                // FORA DO PERÍODO não é «sem ligação»: é não termos o horário
                // desse dia, e quem planeia tem de saber a diferença.
                <div className="faixa">
                  <h3>Não temos os horários desse dia</h3>
                  <p>
                    Os horários carregados vão de {dataCompleta(periodo!.inicio)} a{' '}
                    {dataCompleta(periodo!.fim)}. Escolhe um dia nesse período.
                  </p>
                </div>
              ) : estado.data < dataDoCampo(new Date()) ? (
                <DiaPassado
                  dia={estado.data}
                  fim={periodo?.fim ?? null}
                  aoEscolher={(d) => {
                    setQuando('marcado');
                    setData(d);
                  }}
                />
              ) : naProxima ? (
                // A PRÓXIMA LIGAÇÃO, e não um fim (P2-003): o dia, à cabeça,
                // e as opções desse dia por baixo — a recomendada aberta.
                <div className="faixa">
                  <h3>
                    A próxima ligação é{' '}
                    {quandoE(
                      proxima!.dia.replace(/-/g, ''),
                      diasEntre(estado.data, proxima!.dia),
                      estado.data.replace(/-/g, ''),
                    )}
                  </h3>
                  <p>
                    {soDesviosHoje
                      ? estado.data === dataDoCampo(new Date()) && quando === 'agora'
                        ? `A partir das ${estado.hora}, hoje só há caminhos com grandes desvios.`
                        : `A partir das ${estado.hora} de ${diaDaSemana(
                            estado.data.replace(/-/g, ''),
                          )}, ${diaCurto(estado.data.replace(/-/g, ''))}, só há caminhos com grandes desvios.`
                      : estado.data === dataDoCampo(new Date()) && quando === 'agora'
                        ? `Hoje já não há ligação entre estes dois sítios a partir das ${estado.hora}.`
                        : `Não há ligação entre estes dois sítios a partir das ${estado.hora} de ${diaDaSemana(
                            estado.data.replace(/-/g, ''),
                          )}, ${diaCurto(estado.data.replace(/-/g, ''))}.`}
                  </p>
                </div>
              ) : aProcurarProxima ? (
                <p className="a-procurar">A procurar a próxima ligação…</p>
              ) : soDesviosHoje ? (
                // SÓ VOLTAS, e nenhuma ligação direta nos dias seguintes: os
                // caminhos que há existem e podem servir a alguém — mas não se
                // abrem sozinhos, e diz-se porquê.
                <div className="faixa">
                  <h3>Só há caminhos com grandes desvios</h3>
                  <p>
                    Entre estes dois sítios, a partir das {estado.hora} de{' '}
                    {diaDaSemana(estado.data.replace(/-/g, ''))},{' '}
                    {diaCurto(estado.data.replace(/-/g, ''))}, os caminhos que há dão uma volta
                    grande — e nos sete dias seguintes não há outro.
                  </p>
                  <AsDuasParagens de={de} para={para} />
                </div>
              ) : (
                <div className="faixa">
                  <h3>Sem viagem a partir desta hora</h3>
                  <p>
                    Não encontrámos caminho de transporte público entre estes dois sítios a partir
                    das {estado.hora} de {diaDaSemana(estado.data.replace(/-/g, ''))},{' '}
                    {diaCurto(estado.data.replace(/-/g, ''))}, nem nos sete dias seguintes. Pode ser
                    mesmo assim: nem todos os sítios têm ligação todos os dias, nem a todas as
                    horas.
                  </p>
                  {servicosSemDatas > 0 && (
                    <p>
                      {servicosSemDatas === 1
                        ? 'Um serviço desta região ainda não tem'
                        : `${servicosSemDatas} serviços desta região ainda não têm`}{' '}
                      os dias em que circula{servicosSemDatas === 1 ? '' : 'm'}, e o planeador não{' '}
                      {servicosSemDatas === 1 ? 'o conta' : 'os conta'}.
                    </p>
                  )}
                  <AsDuasParagens de={de} para={para} />
                </div>
              ))}

            {/* QUANTAS SÃO, E QUANDO PARTE A RECOMENDADA — só para quem
                ouve; quem vê conta-as de relance. */}
            {resumoFalado && <p className="so-para-leitores">{resumoFalado}</p>}
          </div>

          {/* O ESQUELETO DE TRÊS OPÇÕES enquanto se procura: o lugar que as
              opções vão ocupar, já ocupado. */}
          {(estado.tipo === 'a-procurar' || (semOpcoesHoje && aProcurarProxima)) && !problema && (
            <ul className="opcoes-fantasma" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i}>
                  <span className="opcao-fantasma">
                    <span />
                    <span />
                    <span />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {estado.tipo === 'resultados' && !problema && lista.length > 0 && (
            <ul className="opcoes">
              {lista.map((it, i) => (
                <li key={i}>
                  <Opcao
                    it={it}
                    aberta={i === escolhido}
                    maisRapida={i === maisRapida && lista.length > 1}
                    desvio={i >= base.length}
                    referencia={referencia}
                    aoEscolher={() => desenhar(lista, i, 'escolha')}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* OS DESVIOS À PARTE, e não apagados (P2-009): continuam a ser
              viagens que existem — mas não as que se mostram primeiro. Fora da
              lista: com só desvios, e nenhuma ligação direta nos dias seguintes,
              a lista está vazia e é este botão que os mostra. */}
          {estado.tipo === 'resultados' &&
            !problema &&
            modo === 'transporte' &&
            hoje.desvios.length > 0 &&
            !comDesvios && (
              <p className="mais-opcoes">
                <button type="button" className="etiqueta" onClick={() => setComDesvios(true)}>
                  {naProxima
                    ? hoje.desvios.length === 1
                      ? 'Mais 1 caminho antes disso, com um desvio longo'
                      : `Mais ${hoje.desvios.length} caminhos antes disso, com desvios longos`
                    : hoje.desvios.length === 1
                      ? 'Mais 1 opção, com um desvio longo'
                      : `Mais ${hoje.desvios.length} opções, com desvios longos`}
                </button>
              </p>
            )}

          {/* O QUE É ESTIMADO DIZ-SE, e diz-se AQUI.
              Esteve num balão a flutuar por cima do mapa, com três linhas de
              texto — a tapar o percurso que o próprio aviso explica. O rodapé
              da folha é onde já se diz o que estes números são; a ressalva
              pertence à mesma frase. */}
          {estado.tipo === 'resultados' && !problema && lista.length > 0 && (
            <p className="marca-dados">
              Horários planeados, não em tempo real.
              {motorEmBaixo
                ? ' O motor de ruas não respondeu: as distâncias a pé são estimadas em linha reta.'
                : porqueEstimado
                  ? ' As distâncias a pé são estimadas em linha reta.'
                  : ''}
            </p>
          )}

          {/* O TRANSPORTE A PEDIDO, QUANDO SERVE AS PONTAS (P2-036). */}
          {propostas.length > 0 && <PropostasAPedido propostas={propostas} d={aPedidoDaRegiao!} />}
        </div>
      </section>
    </>
  );
}

/** Quantos dias vão de um `AAAA-MM-DD` a outro. */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * UMA OPÇÃO: a fila de ícones, as horas, a nota, e o detalhe quando aberta.
 */
function Opcao({
  it,
  aberta,
  maisRapida,
  desvio,
  referencia,
  aoEscolher,
}: {
  it: Itinerario;
  aberta: boolean;
  maisRapida: boolean;
  desvio: boolean;
  referencia: number;
  aoEscolher: () => void;
}) {
  const primeiroExpresso = it.legs.findIndex((p) => p.modo === 'expresso');
  const temExpresso = primeiroExpresso >= 0;
  return (
    <article className={`opcao${aberta ? ' escolhida' : ''}`}>
      <button type="button" className="resumo-opcao" aria-expanded={aberta} onClick={aoEscolher}>
        {/* O QUE SE VÊ: uma fila de ícones e distintivos. O que se LÊ com
            leitor de ecrã é a frase inteira, a seguir — o ícone é ajuda para
            quem vê, nunca a informação. */}
        <span className="tira" aria-hidden="true">
          {it.legs.map((p, j) => (
            <span key={j} className="passo">
              {j > 0 && <Seta tamanho={14} className="entre" />}
              <DoModo modo={p.modo === 'expresso' ? 'expresso' : p.mode} />
              {p.mode === 'WALK' || p.mode === 'BICYCLE' ? (
                <b className="passo-min">{minutos(p.duration)}</b>
              ) : (
                p.route?.shortName && <Distintivo codigo={p.route.shortName} cor={corDaPerna(p)} />
              )}
            </span>
          ))}
        </span>
        <span className="duracao" aria-hidden="true">
          {duracaoLegivel(it.duration)}
        </span>
        <span className="horas" aria-hidden="true">
          {/* O DIA, QUANDO NÃO É HOJE. É isto que deixa o planeador olhar
              para o dia seguinte: enquanto a página só sabia escrever
              «07:30», mostrar a carreira de amanhã a quem pergunta ao fim da
              tarde era enganar. */}
          {diaDe(it.startTime, referencia) && (
            <b className="dia">{diaDe(it.startTime, referencia)}, </b>
          )}
          {horaDe(it.startTime)} – {horaDe(it.endTime)}
        </span>
        <span className="nota" aria-hidden="true">
          {resumoDe(it)}
          {/* A MAIS RÁPIDA, quando não é esta. A lista está por ordem de
              partida, e a que parte primeiro é muitas vezes um desvio longo
              que chega uns minutos antes. */}
          {maisRapida && <b className="rapida"> · a mais rápida</b>}
          {desvio && <span> · desvio longo</span>}
          {temExpresso && <span> · com expresso: bilhete à parte</span>}
        </span>
        <span className="so-para-leitores">{emPalavras(it)}</span>
      </button>

      {/* O detalhe abre-se na opção escolhida. Cinco opções com três pernas
          cada são quinze parágrafos, e quinze parágrafos não se comparam de
          relance. */}
      {aberta && (
        /* UMA LINHA DO TEMPO, e não uma lista de pernas: as PARAGENS são as
         * linhas, com a hora à esquerda, e entre duas paragens diz-se o que
         * se apanha e quanto demora. Lê-se de relance, que é o que se faz
         * com o autocarro à porta. */
        <ol className="percurso">
          {it.legs.map((p, j) => (
            <Fragment key={j}>
              <li className="paragem">
                <span className="hora">{horaDe(p.startTime)}</span>
                <span className={`no ${j === 0 ? 'primeiro' : ''}`} aria-hidden="true" />
                <span className="onde">{p.from.name}</span>
              </li>
              <li
                className={`troco ${p.modo === 'expresso' ? 'modo-expresso' : (CLASSE_DO_MODO[p.mode] ?? '')}`}
              >
                <span className="hora" />
                <span className="fio" aria-hidden="true" />
                <span className="oque">
                  {/* O ÍCONE É AJUDA PARA QUEM VÊ, NUNCA A INFORMAÇÃO. Com
                      leitor de ecrã ouvia-se «547 · 12 min», sem se saber que
                      é um autocarro. */}
                  <DoModo modo={p.modo === 'expresso' ? 'expresso' : p.mode} />
                  <span className="so-para-leitores">{nomeDaPerna(p)} </span>
                  {p.route?.shortName ? (
                    <Distintivo codigo={p.route.shortName} cor={corDaPerna(p)} />
                  ) : null}
                  <span className="secundario">
                    {minutos(p.duration)} min
                    {(p.mode === 'WALK' || p.mode === 'BICYCLE') &&
                      ` · ${Math.round(p.distance)} m`}
                  </span>
                  {/* O EXPRESSO É DE UM OPERADOR PRIVADO, e diz-se aqui
                      (P2-010): quem seguia a opção chegava ao terminal sem
                      bilhete, a contar com o passe da rede. A página do modo
                      diz quem são os operadores e onde se compra. Uma vez por
                      opção, no primeiro: dois expressos seguidos eram a mesma
                      frase duas vezes. */}
                  {p.modo === 'expresso' && j === primeiroExpresso && (
                    <span className="nota-do-troco">
                      Expresso de um operador privado: o bilhete é à parte e compra-se antes, ao
                      operador — os passes da rede não servem.{' '}
                      <Link href="/modos/expresso/">Os expressos e onde se compra</Link>
                    </span>
                  )}
                </span>
              </li>
            </Fragment>
          ))}
          <li className="paragem">
            <span className="hora">{horaDe(it.endTime)}</span>
            <span className="no ultimo" aria-hidden="true" />
            <span className="onde">{it.legs[it.legs.length - 1]?.to.name}</span>
          </li>
        </ol>
      )}
    </article>
  );
}

/**
 * A cor do distintivo de uma perna.
 *
 * O comboio vinha sem cor no feed e saía um «R» solto ao lado das pastilhas
 * coloridas dos autocarros (P1-039): fica com a cor do comboio do §6. O
 * expresso, que é privado, fica neutro mesmo que o feed do operador lhe dê a
 * cor da marca dele — era a coisa mais colorida do ecrã (P1-037).
 */
function corDaPerna(p: Perna): string | null {
  if (p.modo === 'expresso') return null;
  if (p.mode === 'RAIL' && semCor(p.route?.color)) return '#3f4852';
  return p.route?.color ?? null;
}

/**
 * BRANCO NÃO É A COR DE LINHA NENHUMA: é o feed a dizer que não tem cor. O
 * do comboio nacional declara `FFFFFF` em quase todas as linhas, e o «R» saía
 * numa pastilha branca — a mesma ausência de cor, com uma borda à volta.
 */
const semCor = (c: string | null | undefined) => !c || /^#?f{3}(?:f{3})?$/i.test(c.trim());

/** O nome do modo de uma perna, para quem ouve. */
function nomeDaPerna(p: Perna): string {
  if (p.modo === 'expresso') return 'Expresso';
  return NOME_DO_MODO[p.mode] ?? p.mode;
}

/** A PRIMEIRA LETRA EM MAIÚSCULA, para as frases que se ouvem começarem como frases. */
const comMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `AAAAMMDD` → `AAAA-MM-DD`, a forma de um campo de data. */
const comHifens = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

/** A página de uma paragem ou de uma estação no catálogo; `null` para tudo o resto. */
function paginaDoPonto(p: Ponto | null): string | null {
  if (!p || !p.id) return null;
  if (p.tipo === 'paragem') return `/rede/paragens/${seguro(p.id)}/`;
  if (p.tipo === 'estacao') return `/rede/estacoes/${seguro(p.id)}/`;
  return null;
}

/**
 * As páginas das duas pontas, quando são paragens ou estações.
 *
 * Mandava-se para o índice por letra, e quem lá chegava tinha de procurar
 * outra vez, pela inicial, a paragem que estava escrita no campo de cima. A
 * página da paragem tem as horas todas; a da linha não as tem, e por isso não
 * se propõe.
 */
function AsDuasParagens({ de, para }: { de: Ponto | null; para: Ponto | null }) {
  const vistas = new Set<string>();
  const pontas = [de, para].flatMap((p) => {
    const href = paginaDoPonto(p);
    if (!href || !p || vistas.has(href)) return [];
    vistas.add(href);
    return [{ href, nome: p.nome }];
  });
  if (!pontas.length) {
    return (
      <p>
        O <a href="/rede/paragens/">horário de cada paragem</a> mostra tudo o que lá passa.
      </p>
    );
  }
  return (
    <p>
      {pontas.map((x, i) => (
        <Fragment key={x.href}>
          {i > 0 && ' · '}
          <a href={x.href}>Horário de {x.nome}</a>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * O TRANSPORTE A PEDIDO QUE SERVE AS PONTAS — sem horas inventadas.
 *
 * Diz o circuito, onde passa, os dias que a brochura escreve, e a regra de
 * reserva, com o telefone e a reserva online quando a região os tem. Não
 * entra na lista das opções: um circuito que só passa se alguém o chamar
 * não é uma viagem com hora certa, e pô-lo lá era prometer o que os dados
 * não dizem.
 */
/** A ligação diz para onde leva: um circuito não é uma zona. */
const VER: Record<PropostaAPedido['oQue'], string> = {
  ligacao: 'Ver a ligação',
  circuito: 'Ver o circuito',
  zona: 'Ver a zona',
  zonas: 'Ver as zonas',
};

function PropostasAPedido({ propostas, d }: { propostas: PropostaAPedido[]; d: APedido }) {
  const v = d.reservas;
  const online =
    !!v.online && propostas.some((p) => p.reservaOnline === true || p.reservaOnline === null);
  return (
    <section className="faixa a-pedido propostas-a-pedido" aria-labelledby="a-pedido-proposto">
      <h3 id="a-pedido-proposto">Transporte a pedido</h3>
      <ul>
        {propostas.map((p) => (
          <li key={`${p.nome}-${p.horario}`}>
            <strong>{p.nome}</strong>
            {p.onde ? ` ${p.onde}` : ''}
            {/* O QUE INTERESSA É SE LIGA AS DUAS PONTAS — e diz-se assim,
                com uma paragem de cada lado, e não com a lista toda. */}
            {p.liga === 'as-duas' && p.naPartida.length > 0 && p.naChegada.length > 0 ? (
              <>
                {' '}
                — liga as duas pontas: passa em {p.naPartida[0]} e em {p.naChegada[0]}
              </>
            ) : p.liga === 'as-duas' ? (
              <> — liga as duas pontas</>
            ) : (p.naPartida[0] ?? p.naChegada[0]) ? (
              <> — passa em {p.naPartida[0] ?? p.naChegada[0]}</>
            ) : null}
            .{p.regras.length > 0 && ` ${p.regras.join('. ')}.`}{' '}
            {p.horario && <a href={p.horario}>{VER[p.oQue]}</a>}
          </li>
        ))}
      </ul>
      <p>
        <strong>Só passa se for reservado</strong>
        {v.prazo ? `: ${v.prazo.charAt(0).toLowerCase()}${v.prazo.slice(1)}.` : '.'}
      </p>
      <p className="cartao-accoes">
        {v.telefone && (
          <a className="botao" href={`tel:${v.telefone}`}>
            Ligar {v.telefone_apresentado ?? v.telefone}
          </a>
        )}
        {online && (
          <a href={v.online} rel="noreferrer">
            Reservar online
          </a>
        )}
        <a href="/a-pedido/#reservar">Como se reserva</a>
      </p>
      {v.telefone_nota && <p className="secundario">{v.telefone_nota}</p>}
    </section>
  );
}

/**
 * Um dia que já passou.
 *
 * Respondia «sem viagem neste dia», que é a frase que faz desistir — e o que
 * aconteceu foi outra coisa: escolheu-se um dia que já foi. Diz-se isso, e
 * oferece-se o mesmo dia da semana a partir de hoje, que é quase sempre o
 * que se queria ver (dentro do que os horários carregados cobrem).
 */
function DiaPassado({
  dia,
  fim,
  aoEscolher,
}: {
  dia: string;
  fim: string | null;
  aoEscolher: (dia: string) => void;
}) {
  const hoje = chaveDoDia(new Date());
  let k = dia.replace(/-/g, '');
  while (k < hoje) k = chaveMais(k, 7);
  const nome = diaDaSemana(k);
  const masculino = nome === 'sábado' || nome === 'domingo';
  const rotulo =
    k === hoje
      ? `Procurar hoje, ${nome}, ${diaCurto(k)}`
      : `Procurar ${masculino ? 'no próximo' : 'na próxima'} ${nome}, ${diaCurto(k)}`;
  return (
    <div className="faixa">
      <h3>Esse dia já passou</h3>
      <p>Escolhe um dia a partir de hoje.</p>
      {(!fim || k <= fim) && (
        <p>
          <button type="button" className="botao" onClick={() => aoEscolher(comHifens(k))}>
            {rotulo}
          </button>
        </p>
      )}
    </div>
  );
}

/** «32 min», «1 h 4 min» — como se diz, e não em segundos. */
export function duracaoLegivel(segundos: number): string {
  const m = Math.round(segundos / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** «24/09» — o dia na etiqueta, sem o ano, que é quase sempre este. */
function diaLegivel(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/** Quantas vezes se muda de veículo. Fica com este nome para quem já o usava. */
export const transbordos = contarTransbordos;

/**
 * A linha por baixo das horas.
 *
 * O Maps põe ali o tempo real — «Há 8 min de Cais Lingueta», «adiantado».
 * Não temos tempo real e não vamos fingir que temos (§4.4). O que temos, e
 * que decide uma escolha tanto como aquilo, é quantas vezes é preciso mudar
 * de veículo e quanto se anda a pé.
 */
export function resumoDe(it: Itinerario): string {
  const t = contarTransbordos(it);
  const aPe = it.legs
    .filter((p) => p.mode === 'WALK')
    .reduce((soma, p) => soma + p.duration / 60, 0);
  const partes = [
    t === 0 ? 'sem transbordos' : t === 1 ? '1 transbordo' : `${t} transbordos`,
    aPe >= 1 ? `${Math.round(aPe)} min a pé` : null,
  ].filter(Boolean);
  return partes.join(' · ');
}

/** O ponto a meio do percurso, para lá pousar a bolha com o tempo. */
function meioDe(
  it: Itinerario,
  geo: PercursoGeo,
): { lat: number; lon: number; texto: string } | null {
  // A perna mais longa é a que define a viagem; o meio dela é onde a bolha
  // tapa menos e se lê melhor.
  let melhor: [number, number][] | null = null;
  let maior = -1;
  for (const f of geo.features) {
    if (f.geometry.coordinates.length > maior) {
      maior = f.geometry.coordinates.length;
      melhor = f.geometry.coordinates;
    }
  }
  if (!melhor || !melhor.length) return null;
  const [lon, lat] = melhor[Math.floor(melhor.length / 2)];
  return { lat, lon, texto: duracaoLegivel(it.duration) };
}

/**
 * O itinerário inteiro numa frase, para quem não vê a fila de ícones.
 *
 * É o nome acessível do botão: sem isto, cinco opções anunciavam-se como
 * cinco botões sem nome, e a lista deixava de servir para escolher.
 *
 * O QUE SE OUVIA, E JÁ NÃO SE OUVE (P3-017): «a pé 1 minutos», «a pé 0
 * minutos», frases a começar em minúscula depois do ponto, e «comboio R» —
 * uma letra que lida em voz alta não diz nada. Uma perna a pé de menos de um
 * minuto não se diz; o comboio diz-se pelo nome comprido quando o curto é uma
 * sigla; o expresso diz-se expresso.
 */
export function emPalavras(it: Itinerario): string {
  const pernas = it.legs
    .filter((p) => !(p.mode === 'WALK' && minutos(p.duration) < 1))
    .map((p) => {
      const min = minutos(p.duration);
      const quanto = `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
      if (p.mode === 'WALK') return `a pé ${quanto}`;
      if (p.mode === 'BICYCLE') return `de bicicleta ${quanto}`;
      const curto = p.route?.shortName ?? '';
      const linha =
        p.mode === 'RAIL' && curto.length <= 3 && p.route?.longName
          ? ` ${p.route.longName}`
          : curto
            ? ` ${curto}`
            : '';
      return `${nomeDaPerna(p).toLowerCase()}${linha} até ${p.to.name}`;
    });
  return `${duracaoLegivel(it.duration)}, das ${horaDe(it.startTime)} às ${horaDe(
    it.endTime,
  )}. ${comMaiuscula(pernas.join(', '))}. ${comMaiuscula(resumoDe(it))}.`;
}
