/**
 * O que o NAVEGADOR também precisa: os tipos e as funções puras.
 *
 * Saiu do `dados.ts` porque esse lê ficheiros — `node:fs` e `node:path` — e um
 * componente de cliente que o importe leva o Node atrás e não constrói. O erro
 * é claro («Reading from "node:fs" is not handled by plugins») mas só aparece
 * na construção, e só depois de alguém escrever o componente.
 *
 * A regra que isto fixa: aqui dentro não entra nada que toque no disco.
 */

/** Os identificadores são os das pastas em `regioes/`: minúsculas, dígitos e hífens. */
export const IDENTIFICADOR = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type Ponto = {
  nome: string;
  lat: number;
  lon: number;
  /**
   * `paragem`, `estacao`, `sitio` (do OpenStreetMap), ou o nome de um modo tal
   * como a região o declara — `bicicleta`, `taxi`, `urbano-municipal`. É por
   * ele que o mapa escolhe a camada, a cor e o filtro.
   */
  tipo: string;
  id: string;
  concelho: string;
  /**
   * Quantas partidas por dia, nas paragens da rede. É o que distingue uma
   * paragem com cem partidas de uma com duas, e é com isso que o mapa decide
   * o que mostrar de longe. Zero nos pontos que não são paragens.
   */
  partidas?: number;
  /** O que é, para mostrar por baixo do nome: «Hospital», «Café». */
  descricao?: string;
  /** A etiqueta crua do OpenStreetMap, para ordenar. */
  classe?: string;
};

export type Regiao = {
  id: string;
  nome: string;
  /** Uma rede inventada. Marca-se em todas as páginas — ver §4.4. */
  demonstracao?: boolean;
  artigo: string;
  /** «a Serra da Pedra Alta», «o Baixo Sável» — escrito, não adivinhado. */
  nome_com_artigo: string;
  de: string;
  em: string;
  a: string;
  autoridade: { nome?: string; sigla?: string; tipo?: string; url?: string };
  rede: { nome?: string; url?: string; operador?: string; concessao_ate?: string };
  dominio_env: string | null;
  /** Os modos que a região declara — JÁ SEM os que o painel desligou (`dados.ts`). */
  modos: string[];
  /** Os que a região declara e o painel desligou. Vazio quando não há nenhum. */
  modos_desligados?: string[];
  /**
   * Os que a região MOSTRA e não GERE — alimentados só por feeds de outra
   * entidade. Aparecem no mapa e nos itinerários, mas não saem daqui nem em
   * ficheiro nem em aviso: quem gere o serviço é quem avisa sobre ele.
   *
   * Opcional porque uma região construída antes disto não o traz; nesse caso
   * não se presume nenhum, que é o lado seguro para as descargas e o lado
   * permissivo para os avisos — e o painel di-lo.
   */
  modos_de_terceiros?: string[];
  municipios_membros: number;
  concelhos_servidos: number;
  caixa: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
};

export type Concelho = {
  id: string;
  nome: string;
  distrito: string;
  dico: string;
  membro: boolean;
  servido_por: string | null;
  paragens: number;
};

export type Paragem = {
  id: string;
  nome: string;
  ordem: string;
  lat: number;
  lon: number;
  concelho: string | null;
  linhas: string[];
  partidas: number;
};

export type Partida = {
  linha: string;
  linha_id: string;
  destino: string;
  hora: string;
  servico: string;
  /** A mesma chave que a grelha usa, para saber se anda HOJE. */
  servico_id?: string;
  servico_nome: string;
  /** `false` quando o serviço não tem uma única data — o calendário por transcrever. */
  tem_datas: boolean;
  /** `true` quando a hora foi interpolada por nós e não vem do horário publicado. */
  estimada: boolean;
  /**
   * `true` quando a viagem acaba na MESMA paragem de onde parte.
   *
   * As quatro linhas urbanas desta região são circulares, e na folha do cais
   * delas o destino era o nome da própria paragem, 98 vezes seguidas — lê-se
   * como um erro e não como uma volta. Vem do pipeline, onde se compara o
   * identificador da última paragem da viagem com o desta: duas paragens com
   * o mesmo nome não contam.
   */
  circular?: boolean;
  /**
   * Quem gere este autocarro — e só quando NÃO é a rede da região.
   *
   * O §1 diz que quem viaja não precisa de saber quem gere cada serviço: a
   * entidade é informação secundária. Mas «secundária» não é «escondida». Na
   * mesma paragem param carreiras de mais do que uma concessão, e quem tem
   * passe de uma delas precisa de saber qual é qual.
   */
  operador?: string;
};

export type Linha = {
  id: string;
  codigo: string;
  nome: string;
  ordem: string;
  cor: string | null;
  cor_texto: string | null;
  modo: string;
  viagens: number;
  /** Vazio na rede da própria região; o nome do operador quando é de fora. */
  operador?: string;
};

export type Sentido = {
  sentido: string;
  variantes: number;
  viagens: number;
  viagens_deste_percurso: number;
  paragens: { id: string; nome: string }[];
};

export type LinhaDetalhe = Linha & { sentidos: Sentido[] };

export type Estacao = {
  id: string;
  nome: string;
  ordem: string;
  lat: number;
  lon: number;
  concelho: string | null;
  paragens_perto: { id: string; nome: string; metros: number }[];
  /** Quem chega aqui de comboio não tem autocarro a menos de 300 m. */
  sem_ligacao: boolean;
};

export type Titulo = {
  id: string;
  rede: string;
  nome: string;
  valor: number | null;
  confirmado: boolean;
  confirmado_em?: string | null;
  fonte?: string;
  nota?: string;
};

export type Tarifas = {
  moeda: string;
  titulos: Titulo[];
  por_confirmar: number;
  reservas: Record<string, unknown>;
};

export type Lacuna = { id: string; o_que: string; porque_importa: string; quantos?: number };
export type Lacunas = {
  bloqueios: Lacuna[];
  lacunas: Lacuna[];
  contagens: Record<string, number | string>;
};

export type Descarga = {
  /** O caminho dentro de `descargas/`, que é o que a ligação usa. */
  caminho: string;
  ficheiro: string;
  grupo: string;
  modo: string | null;
  existe: boolean;
  bytes: number | null;
  sha256?: string;
  gerado_em?: string;
  fonte: string;
  fonte_url?: string | null;
  licenca: string | null;
  licenca_por_esclarecer: boolean;
  /** `odbl` reutiliza-se, `consulta` vê-se, `terceiro` fala-se com quem o publica. */
  termos?: 'odbl' | 'consulta' | 'terceiro' | 'nosso';
  atribuicao: string | null;
  atribuicao_obrigatoria: boolean;
  descricao?: string;
};

/** 3 379 988 → «3,2 MB». Quem descarrega num telemóvel quer saber antes. */
export function tamanho(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace('.', ',')} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`;
}

/** O mesmo que o pipeline faz: só troca o que não pode ir num caminho. */
export function seguro(identificador: string): string {
  return identificador.replace(/[^a-zA-Z0-9\-_]/g, '-');
}

// --- prosa -----------------------------------------------------------------

/** Uma hora `25:10` do GTFS é 01:10 do dia seguinte, e tem de o dizer. */
export function horaLegivel(hora: string): { texto: string; diaSeguinte: boolean } {
  const [h, m] = hora.split(':');
  const n = Number(h);
  if (Number.isFinite(n) && n >= 24) {
    return { texto: `${String(n - 24).padStart(2, '0')}:${m}`, diaSeguinte: true };
  }
  return { texto: hora, diaSeguinte: false };
}

export const NOME_DOS_MODOS: Record<string, string> = {
  autocarro: 'Autocarro',
  'a-pedido': 'Transporte a pedido',
  comboio: 'Comboio',
  'urbano-municipal': 'Urbano municipal',
  bicicleta: 'Bicicleta partilhada',
  expresso: 'Expresso',
  taxi: 'Táxi',
};

/** Um circuito do transporte a pedido. */
export type Circuito = {
  nome: string;
  folheto?: string;
  /** O número que o sistema de reservas lhe dá. Serve para o ir buscar. */
  id_no_sistema?: number;
  /**
   * Onde está o horário deste circuito, quando há.
   *
   * O catálogo do sistema de reservas divide por zona de operação e as
   * brochuras por concelho, e os dois nomes do mesmo circuito muitas vezes
   * não coincidem — «Constância Sul» é «Constância – Constância-Sul e Santa
   * Margarida da Coutada» na folha. A ligação foi decidida uma a uma, pelas
   * horas e pelas paragens; aqui chega já resolvida, e ausente quer dizer
   * que nenhuma fonte publica as horas deste.
   */
  horario?: { grupo: string; quadro: string };
};

export type ZonaAPedido = {
  id: string;
  nome: string;
  concelho: string | null;
  concelho_nome: string;
  servico?: string;
  reserva_online?: boolean;
  reserva_online_nota?: string;
  entre?: string[];
  mapa?: string;
  circuitos: Circuito[];
};

/**
 * O transporte a pedido de uma região.
 *
 * É o modo que mais falta a quem vive fora das vilas e o que menos aparece em
 * qualquer lado. Não circula se ninguém o reservar — e é por isso que o que
 * esta estrutura carrega primeiro é a REGRA DE RESERVA, e não o horário.
 */
export type HorarioAPedido = {
  id: string;
  nome: string;
  concelho: string;
  concelho_nome: string;
  /** «Mouriscas», quando a brochura é de uma zona dentro do concelho. */
  circuito_de: string;
  regras: string[];
  paragens: string[];
  viagens: number;
  quadros: QuadroDeCartaz[];
  /**
   * Quem transcreveu a folha à mão, e quando. Vazio nas que um leitor leu.
   *
   * A distinção importa a quem lê: o guarda da construção prova que cada hora
   * transcrita está no PDF de origem, mas que ela está na PARAGEM CERTA
   * mediu-o alguém com os olhos, uma vez. A página diz qual dos dois é.
   */
  transcrito_por?: string;
  transcrito_em?: string;
};

export type APedido = {
  zonas: ZonaAPedido[];
  reservas: {
    prazo?: string;
    prazo_confirmado?: boolean;
    online?: string;
    telefone?: string;
    telefone_apresentado?: string;
    telefone_nota?: string;
    email?: string;
    com_reserva_online?: string[];
    tolerancia?: string;
  };
  sem_zona: { id: string; nome: string }[];
  contagens_por_conciliar: Record<string, Record<string, unknown>>;
  fonte: string;
  zonas_sem_circuitos: number;
  /**
   * Os circuitos que JÁ TÊM HORÁRIO, lidos das brochuras da autoridade.
   *
   * Agrupados por concelho e não por zona: a brochura diz de que concelho é;
   * a zona, não. Atribuir uma era deduzir, e uma dedução errada manda alguém
   * reservar onde não deve.
   */
  horarios: HorarioAPedido[];
  /**
   * O CATÁLOGO dos circuitos que se sabe existirem, pelo nome.
   *
   * Sem zona e sem horário, e as duas ausências são deliberadas: o formulário
   * do sistema de reservas liga zona a circuito quando alguém escolhe uma
   * zona, e o instantâneo tem as duas listas sem a ligação. Deduzi-la pelos
   * nomes acertava em muitos e errava nalguns — e um circuito atribuído ao
   * concelho errado manda alguém reservar onde não deve.
   */
  circuitos: Circuito[];
};

// --- os modos que o catálogo da rede não mostra -----------------------------

/** Um ponto no mapa com nome — uma estação de bicicletas, uma praça de táxi. */
export type PontoDeModo = {
  /**
   * A chave estável da estação — o `station_id` do GBFS. É por ela que a
   * contagem de bicicletas ao vivo se junta a esta estação; as praças de táxi
   * não a têm, e por isso é opcional.
   */
  id?: string | null;
  nome: string | null;
  operador?: string | null;
  telefone?: string | null;
  lat: number;
  lon: number;
  concelho: string | null;
};

/**
 * Um sistema de bicicletas partilhadas.
 *
 * `disponibilidade_publica` é quase sempre `false`, e é a coisa mais
 * importante aqui: sem `station_status` não sabemos quantas bicicletas há numa
 * estação, e uma página que o diga sem saber manda alguém a uma estação vazia.
 */
export type SistemaDeBicicletas = {
  id: string;
  nome: string;
  operador: string | null;
  estado: string | null;
  disponibilidade_publica: boolean;
  estacoes: PontoDeModo[];
};

/** O traçado de uma linha urbana municipal. Sem paragens e sem horas. */
export type PercursoDeModo = {
  nome: string;
  operador: string | null;
  rede: string | null;
  cor: string | null;
};

/** Uma paragem de um serviço de terceiro — um expresso, por exemplo. */
export type ParagemDeModo = {
  /**
   * O identificador que o operador usa. É o mesmo do feed dele — medido, não
   * suposto —, e é o que torna possível perguntar-lhe o que custa hoje.
   */
  id?: string;
  nome: string;
  lat: number;
  lon: number;
  concelho: string | null;
  linhas: { nome: string; destino: string }[];
  /**
   * Para onde se vai DAQUI: as paragens que vêm depois desta numa viagem a
   * sério, e não todas as da mesma linha. A linha que passa aqui a caminho de
   * um sítio também passa noutros, e quem está aqui não vai a esses nesse
   * autocarro.
   */
  destinos?: { id: string; nome: string }[];
};

export type OperadorDeModo = { nome: string; sitio: string | null; bilhetes: string | null };

/**
 * Um modo de transporte que não tem catálogo próprio.
 *
 * A grelha «Por modo» era uma fila de rótulos, e quatro deles não levavam a
 * lado nenhum. Quem toca em «Bicicleta partilhada» à procura da estação mais
 * perto não estava a pedir um rótulo.
 *
 * **As listas vêm todas, e quase sempre quase todas vazias.** Um modo tem uma
 * forma — sistemas, pontos, percursos ou paragens — e não as quatro. Sair com
 * a forma que tem, em vez de um campo `tipo` que a página tinha de
 * interpretar, faz com que uma região que declare um modo novo com um formato
 * conhecido apareça sem uma linha de código.
 */
/** Uma viagem de um cartaz: a hora em cada paragem por onde passa. */
export type ViagemDeCartaz = {
  /** «DIAS ÚTEIS», «SÁBADOS» — como o cartaz rotula a coluna. Pode ser vazio. */
  rotulo: string;
  /** [nome da paragem, hora]. Só as paragens onde esta viagem para. */
  passagens: [string, string][];
};

export type QuadroDeCartaz = {
  paragens: string[];
  rotulos: string[];
  viagens: ViagemDeCartaz[];
  /** O nome do circuito, quando a folha empilha vários na mesma grelha. */
  nome?: string;
  /** As regras que a folha escreve por baixo DESTE quadro. */
  regras?: string[];
  /**
   * `percurso` (por omissão) ou `partidas`.
   *
   * O folheto do LINK não é um horário de paragens: é uma tabela de PARTIDAS
   * por cidade, seis por dia. Lê-la como um percurso dava um autocarro que
   * passa por catorze cidades seguidas, e não existe tal autocarro. Um quadro
   * de partidas não traz viagens nenhumas — traz a grelha, em `horas`.
   */
  tipo?: 'percurso' | 'partidas';
  /** Só em `tipo: partidas`: as horas de cada paragem, na ordem da lista. */
  horas?: string[][];
};

/**
 * Uma linha de urbano municipal, lida do cartaz da câmara.
 *
 * Tem HORAS sempre, e COORDENADAS só para parte das paragens: é por isso que
 * é um tipo à parte de uma linha da rede. Responde à pergunta que se faz numa
 * paragem — «a que horas passa?» — e responde à que se faz num mapa apenas
 * onde alguém já mapeou o sítio.
 */
export type HorarioDeModo = {
  id: string;
  nome: string;
  operador: string | null;
  rede: string | null;
  cor: string | null;
  /** As regras de serviço como o cartaz as escreve. Não se interpretam. */
  regras: string[];
  paragens: string[];
  viagens: number;
  quadros: QuadroDeCartaz[];
  /** Quem transcreveu a folha à mão, e quando. Vazio nas que um leitor leu. */
  transcrito_por?: string;
  transcrito_em?: string;
  /**
   * Onde fica cada paragem, para as que se sabe. NUNCA é a lista toda, e
   * nunca se completa por estimativa: o cartaz dá o nome, e o nome só se
   * converte em ponto onde alguém mapeou a paragem (CLAUDE.md §4.4).
   */
  coordenadas?: Record<string, { lat: number; lon: number; fonte: string }>;
  /** As que ficaram só com hora. A página nomeia-as — é o pedido concreto. */
  sem_coordenada?: string[];
};

export type ModoDetalhe = {
  modo: string;
  gerido_por: string[];
  sistemas: SistemaDeBicicletas[];
  pontos: PontoDeModo[];
  percursos: PercursoDeModo[];
  paragens: ParagemDeModo[];
  horarios?: HorarioDeModo[];
  operadores?: OperadorDeModo[];
  incompleto: boolean;
  notas: string[];
  fontes: string[];
  quantos: number;
};

export type Modos = Record<string, ModoDetalhe>;

/**
 * Para onde leva um modo na grelha «Por modo» — ou `null` se não levar a lado
 * nenhum.
 *
 * Está aqui, e não dentro da página, porque há três sítios a fazer a mesma
 * pergunta: a grelha da rede, a página do concelho e o teste que segue todas
 * as ligações. Três respostas à mesma pergunta divergem, e a divergência
 * aparece como um cartão que leva a um 404.
 *
 * O caminho é RELATIVO À REGIÃO: passa-se ao `url(regiao, caminho)`.
 */
export function caminhoDoModo(modo: string, temPagina: (m: string) => boolean): string | null {
  // Três modos têm catálogo próprio e mais antigo do que as páginas de modo.
  // Mandá-los para `/modos/` era dar duas páginas à mesma pergunta.
  if (modo === 'a-pedido') return 'a-pedido/';
  if (modo === 'autocarro') return 'rede/linhas/';
  if (modo === 'comboio') return 'rede/estacoes/';
  return temPagina(modo) ? `modos/${modo}/` : null;
}

/**
 * Quanto falta, em palavras — e é isto que falta a um quadro de partidas.
 *
 * «14:20» obriga quem lê a fazer a conta de cabeça, e a fazê-la outra vez a
 * cada minuto. «12 min» responde à pergunta que a pessoa tem: dá para ir a pé
 * até lá, ou já não? É a diferença entre uma tabela e uma resposta.
 *
 * A HORA NÃO DESAPARECE, fica ao lado em pequeno. Quem planeia a tarde quer
 * saber as horas; quem está na paragem quer saber os minutos. São duas
 * perguntas e a folha responde às duas.
 *
 * Devolve `null` para além de doze horas: aí «em 14 h» não ajuda ninguém, e o
 * relógio sozinho diz mais.
 */
export function esperaLegivel(hora: string, agora: string, amanha = false): string | null {
  const m = (s: string) => {
    const [h, mm] = s.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(mm) ? h * 60 + mm : null;
  };
  const a = m(agora);
  const b = m(hora);
  if (a === null || b === null) return null;
  // Uma hora depois da meia-noite escreve-se «25:10» num GTFS, e aí a conta
  // já sai certa. O que NÃO saía era a volta ao dia: quando a lista salta
  // para as partidas da manhã seguinte, «06:45» menos «20:46» dá negativo e a
  // espera sumia-se — justamente à hora em que ela mais faz falta. Quem
  // chama diz que deu a volta, e aqui somam-se as 24 horas.
  const falta = b + (amanha ? 24 * 60 : 0) - a;
  if (falta < 0 || falta > 12 * 60) return null;
  if (falta < 1) return 'agora';
  if (falta < 60) return `${falta} min`;
  const h = Math.floor(falta / 60);
  const resto = falta % 60;
  return resto ? `${h} h ${String(resto).padStart(2, '0')}` : `${h} h`;
}

/**
 * Preto ou branco sobre esta cor — calculado, e não o que o feed diz.
 *
 * O §8 manda usar o `route_color` do GTFS «garantindo contraste», e as duas
 * metades da frase importam. O feed também traz um `route_text_color`, e
 * confiar nele é confiar que quem o preencheu mediu alguma coisa: nesta
 * região há linhas com texto branco declarado sobre amarelo, que dá 1,6:1
 * onde a WCAG AA pede 4,5:1.
 *
 * A luminância relativa é a da WCAG 2.1, e o limiar 0,179 é o ponto em que
 * preto e branco trocam de lugar como melhor opção.
 */
export function textoSobre(cor: string): string {
  const hex = cor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const canal = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return l > 0.179 ? '#102C3F' : '#ffffff';
}

/**
 * O nome de um operador como cabe num painel de partidas.
 *
 * O registo do regulador guarda a firma por extenso — «RDL - Rodoviária do Lis
 * II, unipessoal LDA» — porque é isso que uma autorização precisa de dizer.
 * Num painel de telemóvel ocupa a linha toda e empurra o destino para fora.
 *
 * A regra é cortar no que a firma acrescenta e a pessoa não lê: o que vem
 * depois da última vírgula é a forma jurídica («unipessoal LDA», «SA», «S.A.»,
 * «Unipessoal, Lda.»). Não se toca no resto — abreviar «Rodoviária» era
 * inventar um nome que ninguém usa, e o nome completo continua na página da
 * linha, que é onde o §1 manda pôr quem gere.
 */
export function operadorCurto(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const partes = limpo.split(',');
  if (partes.length < 2) return limpo;
  const cauda = partes[partes.length - 1].trim();
  // Só se corta o que é mesmo forma jurídica. Uma vírgula a meio de um nome
  // — «Rodoviária do Tejo, Norte» — não é motivo para perder metade dele.
  return /^(unipessoal[ ,.]*)?(l\.?d\.?a\.?|s\.?a\.?|crl|e\.?m\.?|e\.?p\.?e\.?)\.?$/i.test(cauda)
    ? partes.slice(0, -1).join(',').trim()
    : limpo;
}
