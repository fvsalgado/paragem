'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
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
} from '@/lib/dias';
import { seguro, type Ponto } from '@/lib/formato';
import { planear, capacidadeDe, SemLigacao, type Capacidade } from '@/lib/planeador';
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
 *   direita — em vez de três parágrafos. Assim comparam-se cinco de relance.
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

export default function Direccoes({
  pontos,
  regiao,
  deInicial = null,
  paraInicial = null,
  aoDesenhar,
  aoFechar,
  variante = 'pagina',
  encolhido = false,
  aoEncolher,
  modosDesligados = [],
  motorDaRegiao = '',
  servicosSemDatas = 0,
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
  /** O mapa liga-se aqui; a página `/viagem/` não. */
  aoDesenhar?: (p: Percurso | null, origem: 'automatico' | 'escolha') => void;
  aoFechar?: () => void;
  variante?: 'pagina' | 'mapa';
  encolhido?: boolean;
  aoEncolher?: (sim: boolean) => void;
}) {
  const agora = new Date();
  const [de, setDe] = useState<Ponto | null>(deInicial);
  const [para, setPara] = useState<Ponto | null>(paraInicial);
  const [quando, setQuando] = useState<'agora' | 'marcado'>('agora');
  // O DIA E A HORA DO MESMO RELÓGIO. O dia vinha do `toISOString()`, que é
  // UTC, e a hora do relógio de quem lê: no verão, entre a meia-noite e a uma,
  // o campo abria no dia de ontem (`dataDoCampo`, em `lib/dias.ts`).
  const [data, setData] = useState(dataDoCampo(agora));
  const [hora, setHora] = useState(horaDoRelogio(agora));
  const [abertoQuando, setAbertoQuando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [porModo, setPorModo] = useState<PorModo>(VAZIO);
  const [modo, setModo] = useState<Modo>('transporte');
  const [escolhido, setEscolhido] = useState(0);
  const [localizacao, setLocalizacao] = useState<'parada' | 'a-perguntar' | 'recusada' | 'sem'>(
    'parada',
  );

  const itinerarios = porModo[modo] ?? [];

  /**
   * O dia a partir do qual se conta «amanhã».
   *
   * É o dia PERGUNTADO e não o de hoje: quem marca uma viagem para sábado tem
   * de ler «domingo, 07:30» e não «amanhã, 07:30». Com `partir agora` os dois
   * coincidem, e é por isso que o engano passava despercebido.
   */
  const referencia = new Date(`${data}T${hora}:00`).getTime();

  /** Qual das opções é a mais curta. Índice, porque a lista está por partida. */
  const maisRapida = itinerarios.reduce(
    (melhor, it, i) => (it.duration < itinerarios[melhor].duration ? i : melhor),
    0,
  );

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
    aoDesenhar?.(null, 'automatico');

    // O NOME VAI JUNTO, e não é enfeite: sem motor de ruas, a primeira e a
    // última perna são «a pé de <onde estás> até <a paragem>», e sem o nome
    // sairiam duas pernas a pé sem princípio nem fim.
    const pedir = (m: Modo) =>
      planear(
        regiao,
        { nome: de.nome, lat: de.lat, lon: de.lon },
        { nome: para.nome, lat: para.lat, lon: para.lon },
        d,
        h,
        m,
        modosDesligados,
        motor,
      );

    try {
      const its = await pedir('transporte');
      if (meu !== daVez.current) return;
      setPorModo((v) => ({ ...v, transporte: its }));
      setModo('transporte');
      setEstado({ tipo: 'resultados', data: d, hora: h });
      // A primeira opção desenha-se logo: mostrar cinco cartões e um mapa
      // vazio é fazer a pergunta outra vez.
      desenhar(its, 0, 'automatico');

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
        transbordosMelhor: melhor ? transbordos(melhor) : null,
        linhas: melhor ? melhor.legs.map((p) => p.route?.shortName ?? '').filter(Boolean) : [],
      });
      // UMA PERGUNTA FORA DOS HORÁRIOS NÃO É UMA VIAGEM SEM RESPOSTA. O que
      // se mede aqui é para quem planeia a rede saber que ligações faltam; um
      // dia que já passou, ou para lá do que está carregado, não diz nada
      // sobre a rede.
      if (its.length === 0 && !foraDosHorarios(d)) {
        viagemSemResposta({ de: de.nome, para: para.nome, data: d, hora: h });
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

  // O formulário, para pôr o foco no campo que ficou por preencher.
  const formulario = useRef<HTMLFormElement>(null);

  function trocar() {
    setDe(para);
    setPara(de);
    // COM UM DOS LADOS VAZIO, O FOCO VAI PARA ELE. É o gesto de quem acabou
    // de pôr a paragem no lado certo: a seguir escreve o outro — e quem usa
    // leitor de ecrã ouve qual é o campo que falta.
    if (!de !== !para) {
      const vazio = de ? 0 : 1;
      requestAnimationFrame(() =>
        formulario.current
          ?.querySelectorAll<HTMLInputElement>('input[role="combobox"]')
          [vazio]?.focus(),
      );
    }
  }

  function mudarModo(m: Modo) {
    setModo(m);
    const lista = porModo[m] ?? [];
    desenhar(lista, 0, 'escolha');
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
  // Corre num efeito porque a resposta depende de duas coisas que só existem
  // no navegador: o protocolo da página — um endereço `http://` numa página
  // `https://` é bloqueado antes de ser tentado — e a grelha, que se vai
  // buscar.
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

  /** `AAAA-MM-DD` fora do período carregado — antes do princípio ou depois do fim. */
  function foraDosHorarios(dia: string): boolean {
    const k = dia.replace(/-/g, '');
    return !!periodo && (k < periodo.inicio || k > periodo.fim);
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
              de um campo procurar, como em qualquer formulário. */}
          <button type="submit" className="so-para-leitores">
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
          {/* Um só botão redondo, e não dois: a hora de partida já é uma
              etiqueta logo abaixo, e dois comandos para a mesma coisa é uma
              escolha a mais para quem só quer saber a que horas parte. */}
          <span className="redondos">
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

        {/* A FILA DOS MODOS, com o tempo de cada um. É o que responde à
            pergunta que vem antes de todas: vale a pena esperar pelo
            autocarro? São botões e não separadores ARIA de propósito — um
            padrão de separadores mal feito é pior do que botões bem feitos. */}
        <div className="linha-de-controlos">
          {estado.tipo === 'resultados' && (
            <div className="modos" role="group" aria-label="Como ir">
              {(Object.keys(MODOS) as Modo[]).map((m) => {
                const lista = porModo[m];
                if (m !== 'transporte' && !lista?.length) return null;
                // O TEMPO DO PRIMEIRO CARTÃO, e não o da melhor opção.
                //
                // Dizia o da mais RÁPIDA, e a lista está por ordem de
                // partida: numa ligação medida, o botão anunciava
                // «1 h 45» e o cartão aberto por baixo dizia «2 h 24», porque
                // a de 1 h 45 era a terceira e estava fechada. Um número que
                // contradiz o que está logo a seguir não é um resumo — é uma
                // promessa que a página desmente sozinha.
                //
                // A mais rápida não se perde: vai marcada na lista.
                const primeira = lista?.length ? lista[0] : null;
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
                    <span>{primeira ? duracaoLegivel(primeira.duration) : '—'}</span>
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

        {/* O resultado chega depois. Sem isto, quem não vê a página não sabe
            que chegou — nem que está a demorar. */}
        <div aria-live="polite" aria-busy={estado.tipo === 'a-procurar'}>
          {estado.tipo === 'parado' && !problema && (!de || !para) && (
            <p className="secundario">Escolhe de onde partes e para onde vais.</p>
          )}
          {estado.tipo === 'a-procurar' && !problema && <p>A procurar viagens…</p>}

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

          {estado.tipo === 'resultados' &&
            itinerarios.length === 0 &&
            !problema &&
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
            ) : (
              <div className="faixa">
                <h3>Sem viagem a partir desta hora</h3>
                <p>
                  Não encontrámos caminho de transporte público entre estes dois sítios a partir das{' '}
                  {estado.hora} de {diaDaSemana(estado.data.replace(/-/g, ''))},{' '}
                  {diaCurto(estado.data.replace(/-/g, ''))}. Pode ser mesmo assim: nem todos os
                  sítios têm ligação todos os dias, nem a todas as horas.
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

          {estado.tipo === 'resultados' && itinerarios.length > 0 && (
            <>
              {/* QUANTAS SÃO, ANTES DE AS LISTAR.
                  Esta região é anunciada por leitor de ecrã, e até aqui
                  despejava os cartões todos sem dizer que eram cartões nem
                  quantos — quem ouve leva com «601560051 h 55 minamanhã…» sem
                  saber onde começa e acaba cada opção. O número vem primeiro,
                  como quem diz «encontrei quatro» antes de as ler.

                  Só para leitores: quem vê conta-as de relance. */}
              <p className="so-para-leitores">
                {itinerarios.length === 1 ? '1 opção' : `${itinerarios.length} opções`}
                {itinerarios.length > 1 && maisRapida !== 0
                  ? `. A mais rápida é a ${maisRapida + 1}ª.`
                  : '.'}
              </p>
              <ul className="opcoes">
                {itinerarios.map((it, i) => (
                  <li key={i}>
                    <article className={`opcao${i === escolhido ? ' escolhida' : ''}`}>
                      <button
                        type="button"
                        className="resumo-opcao"
                        aria-expanded={i === escolhido}
                        onClick={() => desenhar(itinerarios, i, 'escolha')}
                      >
                        {/* O QUE SE VÊ: uma fila de ícones e distintivos. O
                            que se LÊ com leitor de ecrã é a frase inteira, a
                            seguir — o ícone é ajuda para quem vê, nunca a
                            informação. */}
                        <span className="tira" aria-hidden="true">
                          {it.legs.map((p, j) => (
                            <span key={j} className="passo">
                              {j > 0 && <Seta tamanho={14} className="entre" />}
                              <DoModo modo={p.mode} />
                              {p.mode === 'WALK' || p.mode === 'BICYCLE' ? (
                                <b className="passo-min">{minutos(p.duration)}</b>
                              ) : (
                                p.route?.shortName && (
                                  <Distintivo codigo={p.route.shortName} cor={p.route.color} />
                                )
                              )}
                            </span>
                          ))}
                        </span>
                        <span className="duracao" aria-hidden="true">
                          {duracaoLegivel(it.duration)}
                        </span>
                        <span className="horas" aria-hidden="true">
                          {/* O DIA, QUANDO NÃO É HOJE. É isto que deixa o
                              planeador olhar para o dia seguinte: enquanto a
                              página só sabia escrever «07:30», mostrar a
                              carreira de amanhã a quem pergunta ao fim da
                              tarde era enganar, e por isso a busca deitava-a
                              fora — e sobravam os desvios. */}
                          {diaDe(it.startTime, referencia) && (
                            <b className="dia">{diaDe(it.startTime, referencia)}, </b>
                          )}
                          {horaDe(it.startTime)} – {horaDe(it.endTime)}
                        </span>
                        <span className="nota" aria-hidden="true">
                          {resumoDe(it)}
                          {/* A MAIS RÁPIDA, quando não é esta. A lista está
                              por ordem de partida, e a que parte primeiro é
                              muitas vezes um desvio longo que chega uns
                              minutos antes. Sem esta marca, quem quer a
                              viagem curta tem de somar de cabeça. */}
                          {i === maisRapida && itinerarios.length > 1 && (
                            <b className="rapida"> · a mais rápida</b>
                          )}
                        </span>
                        <span className="so-para-leitores">{emPalavras(it)}</span>
                      </button>

                      {/* O detalhe abre-se na opção escolhida. Cinco opções
                          com três pernas cada são quinze parágrafos, e quinze
                          parágrafos não se comparam de relance. */}
                      {i === escolhido && (
                        /* UMA LINHA DO TEMPO, e não uma lista de pernas.
                         *
                         * Estava uma perna por linha, com o nome do modo numa
                         * coluna estreita e «de → para» noutra — e num
                         * telemóvel «Ribeira Branca (Centro) → Liteiros
                         * (Semáforos)» partia em três linhas. Três pernas
                         * enchiam o ecrã e não se lia nenhuma.
                         *
                         * Agora as PARAGENS é que são as linhas, com a hora à
                         * esquerda, e entre duas paragens diz-se o que se
                         * apanha e quanto demora. É a gramática que toda a
                         * gente já conhece — e lê-se de relance, que é o que
                         * se faz com o autocarro à porta. */
                        <ol className="percurso">
                          {it.legs.map((p, j) => (
                            <Fragment key={j}>
                              <li className="paragem">
                                <span className="hora">{horaDe(p.startTime)}</span>
                                <span
                                  className={`no ${j === 0 ? 'primeiro' : ''}`}
                                  aria-hidden="true"
                                />
                                <span className="onde">{p.from.name}</span>
                              </li>
                              <li className={`troco ${CLASSE_DO_MODO[p.mode] ?? ''}`}>
                                <span className="hora" />
                                <span className="fio" aria-hidden="true" />
                                <span className="oque">
                                  {/* O ÍCONE É AJUDA PARA QUEM VÊ, NUNCA A
                                      INFORMAÇÃO. Ao passar a linha do tempo a
                                      ícones, o modo desapareceu do texto: com
                                      leitor de ecrã ouvia-se «547 · 12 min»,
                                      sem se saber que é um autocarro. Foram
                                      três testes a apanhá-lo. */}
                                  <DoModo modo={p.mode} />
                                  <span className="so-para-leitores">
                                    {NOME_DO_MODO[p.mode] ?? p.mode}{' '}
                                  </span>
                                  {p.route?.shortName ? (
                                    <Distintivo codigo={p.route.shortName} cor={p.route.color} />
                                  ) : null}
                                  <span className="secundario">
                                    {minutos(p.duration)} min
                                    {(p.mode === 'WALK' || p.mode === 'BICYCLE') &&
                                      ` · ${Math.round(p.distance)} m`}
                                  </span>
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
                  </li>
                ))}
              </ul>
              {/* O QUE É ESTIMADO DIZ-SE, e diz-se AQUI.
                  Esteve num balão a flutuar por cima do mapa, com três linhas
                  de texto — a tapar o percurso que o próprio aviso explica.
                  O rodapé da folha é onde já se diz o que estes números são;
                  a ressalva pertence à mesma frase. */}
              <p className="marca-dados">
                Horários planeados, não em tempo real.
                {porqueEstimado ? ' As distâncias a pé são estimadas em linha reta.' : ''}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

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

export function transbordos(it: Itinerario): number {
  return Math.max(0, it.legs.filter((p) => p.mode !== 'WALK' && p.mode !== 'BICYCLE').length - 1);
}

/**
 * A linha por baixo das horas.
 *
 * O Maps põe ali o tempo real — «Há 8 min de Cais Lingueta», «adiantado».
 * Não temos tempo real e não vamos fingir que temos (§4.4). O que temos, e
 * que decide uma escolha tanto como aquilo, é quantas vezes é preciso mudar
 * de veículo e quanto se anda a pé.
 */
export function resumoDe(it: Itinerario): string {
  const t = transbordos(it);
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
 */
export function emPalavras(it: Itinerario): string {
  const pernas = it.legs.map((p) => {
    const nome = NOME_DO_MODO[p.mode] ?? p.mode;
    // «a pé 1 minutos» era o que se ouvia em cada opção com uma perna curta.
    const min = minutos(p.duration);
    const quanto = `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
    if (p.mode === 'WALK') return `a pé ${quanto}`;
    if (p.mode === 'BICYCLE') return `de bicicleta ${quanto}`;
    const linha = p.route?.shortName ? ` ${p.route.shortName}` : '';
    return `${nome.toLowerCase()}${linha} até ${p.to.name}`;
  });
  return `${duracaoLegivel(it.duration)}, das ${horaDe(it.startTime)} às ${horaDe(
    it.endTime,
  )}. ${pernas.join(', ')}. ${resumoDe(it)}.`;
}
