/**
 * O cliente do motor de viagens, do lado do navegador.
 *
 * O navegador fala com o OTP diretamente; o ENDEREÇO vem do servidor, por
 * propriedade (`lib/enderecos.ts`), porque é lá que uma chave calculada se
 * pode ler. Não está cravado no código — é a mesma regra do domínio
 * (CLAUDE.md §4.7), e é o que permite a mesma construção servir uma região
 * aqui e outra ali sem uma linha por cliente.
 *
 * **Quando não está configurado, a página diz isso.** Não tenta, não falha em
 * silêncio, e não finge que não há caminho: dizer «não há viagem» quando o que
 * há é um motor desligado é mentir a quem está à espera do autocarro.
 */

/**
 * DOZE HORAS, e é a decisão que mais pesa nesta página.
 *
 * Medido numa ligação entre duas cidades às 09:00, DUAS VEZES — e a segunda
 * corrige a primeira, por isso ficam as duas:
 *
 *     janela        antes do calendário     com o calendário
 *     50 min (OTP)        0 itinerários          1 itinerário
 *     2 h                 1                      2
 *     4 h                 2                      4
 *     8 h                 5                      5
 *     12 h                5                      5
 *
 * A primeira coluna é de quando só os serviços anuais tinham datas, e o «zero»
 * era em boa parte isso. Com o calendário preenchido a janela curta já acha
 * caminho — e o argumento fica mais fraco e continua a ganhar: mostrar UMA
 * opção onde há CINCO é esconder quatro, e numa rede em que o autocarro
 * seguinte pode ser daqui a três horas a escondida é a que serve.
 */
export const JANELA_SEGUNDOS = 12 * 3600;

export type Perna = {
  mode: string;
  duration: number;
  distance: number;
  startTime: number;
  endTime: number;
  route: { shortName: string | null; longName: string | null; color: string | null } | null;
  from: { name: string };
  to: { name: string };
  /** A geometria da perna, em polilinha codificada. É o que o mapa desenha. */
  legGeometry: { points: string } | null;
  /**
   * SÓ PARA O DESENHO: que linha e que paragens esta perna percorre.
   *
   * Preenchido apenas pelo planeador que corre no navegador, e só para ele
   * poder ir buscar o traçado da linha e substituir a linha reta pela estrada
   * a sério. Quem vem do motor de viagens não traz isto — traz a geometria já
   * feita — e a página não precisa de saber a diferença.
   */
  traco?: { linha: number; paragens: number[] };
};

export type Itinerario = {
  duration: number;
  startTime: number;
  endTime: number;
  walkDistance: number;
  legs: Perna[];
};

/**
 * OS TRÊS MODOS, como o Maps os põe numa fila por cima dos resultados.
 *
 * O carro fica de fora, e é uma escolha e não um esquecimento: isto é o sítio
 * de uma autoridade de transportes públicos, e pôr «de carro 23 min» ao lado
 * de «de autocarro 53 min» é publicidade ao carro paga por quem paga o
 * autocarro.
 *
 * A pé e de bicicleta ficam, porque respondem a uma pergunta que a rede não
 * responde — «vale a pena esperar?» — e porque o motor já sabe responder sem
 * lhe pedir mais nada.
 */
export type Modo = 'transporte' | 'a-pe' | 'bicicleta';

export const MODOS: Record<Modo, { nome: string; otp: { mode: string }[]; janela: boolean }> = {
  transporte: {
    nome: 'Transportes públicos',
    otp: [{ mode: 'WALK' }, { mode: 'BUS' }, { mode: 'RAIL' }],
    janela: true,
  },
  'a-pe': { nome: 'A pé', otp: [{ mode: 'WALK' }], janela: false },
  bicicleta: { nome: 'Bicicleta', otp: [{ mode: 'BICYCLE' }], janela: false },
};

const CONSULTA = `
query Viagem(
  $de: InputCoordinates!, $para: InputCoordinates!,
  $data: String!, $hora: String!, $janela: Long!,
  $modos: [TransportMode!], $quantos: Int!
) {
  plan(
    from: $de, to: $para, date: $data, time: $hora,
    numItineraries: $quantos, searchWindow: $janela,
    transportModes: $modos
  ) {
    itineraries {
      duration startTime endTime walkDistance
      legs {
        mode duration distance startTime endTime
        route { shortName longName color }
        from { name }
        to { name }
        legGeometry { points }
      }
    }
  }
}`;

export class MotorIndisponivel extends Error {}

export async function planear(
  /** O endereço do motor desta região. Vem do servidor, por propriedade. */
  motor: string,
  de: { lat: number; lon: number },
  para: { lat: number; lon: number },
  data: string,
  hora: string,
  modo: Modo = 'transporte',
): Promise<Itinerario[]> {
  const OTP = motor;
  if (!OTP) {
    throw new MotorIndisponivel(
      'O planeador ainda não está ligado a um motor de viagens. As páginas de paragem e de linha funcionam na mesma.',
    );
  }
  let r: Response;
  try {
    r = await fetch(`${OTP.replace(/\/$/, '')}/otp/gtfs/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: CONSULTA,
        variables: {
          de,
          para,
          data,
          hora,
          // A janela de doze horas é para o transporte, onde o autocarro
          // seguinte pode ser daqui a três. A pé e de bicicleta parte-se
          // quando se quiser, e uma janela larga só devolve o mesmo caminho
          // cinco vezes.
          janela: MODOS[modo].janela ? JANELA_SEGUNDOS : 3600,
          modos: MODOS[modo].otp,
          quantos: MODOS[modo].janela ? 5 : 1,
        },
      }),
    });
  } catch {
    throw new MotorIndisponivel(
      'Não se conseguiu falar com o motor de viagens. Pode estar em baixo — os horários de cada paragem continuam a funcionar.',
    );
  }
  if (!r.ok) {
    throw new MotorIndisponivel(`O motor de viagens respondeu ${r.status}.`);
  }
  const d = await r.json();
  if (d.errors?.length) {
    throw new MotorIndisponivel(`O motor de viagens recusou o pedido: ${d.errors[0]?.message}`);
  }
  return (d.data?.plan?.itineraries ?? []) as Itinerario[];
}

export function minutos(segundos: number): number {
  return Math.round(segundos / 60);
}

export function horaDe(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Em que dia é isto, visto de quem perguntou — e vazio quando é hoje.
 *
 * **Sem isto o planeador tinha de deitar fora o dia seguinte**, e deitava: o
 * corte da janela em `viagens.ts` existia porque «a interface mostra a hora e
 * não o dia, e quem lê vê 07:00 e pensa que é já». O resultado era que, a
 * quem perguntasse ao fim da tarde por um par servido por carreiras diurnas,
 * se respondia com um desvio de quatro horas por Lisboa em vez da direta de
 * amanhã de manhã — porque a direta estava fora da janela.
 *
 * Compara-se o DIA CIVIL e não a diferença em horas: das 23h de hoje às 2h de
 * amanhã vão três horas, e são dois dias. É o dia que se escreve.
 */
export function diaDe(epochMs: number, referenciaMs: number): string {
  const civil = (ms: number) => {
    const d = new Date(ms);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const dias = Math.round((civil(epochMs) - civil(referenciaMs)) / 86400000);
  if (dias === 0) return '';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return new Date(epochMs).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric' });
}

export const NOME_DO_MODO: Record<string, string> = {
  WALK: 'A pé',
  BUS: 'Autocarro',
  RAIL: 'Comboio',
  SUBWAY: 'Metro',
  TRAM: 'Elétrico',
  FERRY: 'Barco',
};

export const CLASSE_DO_MODO: Record<string, string> = {
  WALK: 'modo-a-pe',
  BUS: 'modo-autocarro',
  RAIL: 'modo-comboio',
};

export const COR_DO_MODO: Record<string, string> = {
  WALK: '#4a5c66',
  BUS: '#0a5c7a',
  RAIL: '#3f4852',
  SUBWAY: '#5b3a8e',
  TRAM: '#5b3a8e',
  FERRY: '#0a5c7a',
};

/**
 * A polilinha codificada do Google, que é o que o OTP devolve em
 * `legGeometry.points`. Vinte linhas contra uma dependência: não vale a pena
 * trazer um pacote para isto, e um pacote a menos é uma coisa a menos a
 * auditar num sítio que não tem servidor nosso.
 *
 * Precisão 5, que é o que o OTP usa. Devolve `[lon, lat]` — a ordem do
 * GeoJSON, e não a ordem de quem escreve coordenadas à mão. Trocá-las põe o
 * uma região portuguesa no meio do Atlântico, e é o erro que se comete uma vez.
 */
export function descodificarLinha(codificada: string, precisao = 5): [number, number][] {
  const fator = 10 ** precisao;
  const pontos: [number, number][] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;

  while (i < codificada.length) {
    let resultado = 0;
    let desvio = 0;
    let byte: number;
    do {
      byte = codificada.charCodeAt(i++) - 63;
      resultado |= (byte & 0x1f) << desvio;
      desvio += 5;
    } while (byte >= 0x20);
    lat += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    resultado = 0;
    desvio = 0;
    do {
      byte = codificada.charCodeAt(i++) - 63;
      resultado |= (byte & 0x1f) << desvio;
      desvio += 5;
    } while (byte >= 0x20);
    lon += resultado & 1 ? ~(resultado >> 1) : resultado >> 1;

    pontos.push([lon / fator, lat / fator]);
  }
  return pontos;
}

/** Só a forma de que o MapLibre precisa — sem trazer os tipos do GeoJSON. */
export type PercursoGeo = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { modo: string; cor: string; linha: string };
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }[];
};

/**
 * O itinerário como geometria, uma perna por traço.
 *
 * A cor é a do MODO e não a da linha: numa rede com 122 linhas as cores do
 * GTFS repetem-se e algumas não têm contraste nenhum sobre o mapa. O nome da
 * linha vai nas propriedades, para quem quiser etiquetar.
 */
export function percursoDe(it: Itinerario): PercursoGeo {
  return {
    type: 'FeatureCollection',
    features: it.legs
      .filter((p) => p.legGeometry?.points)
      .map((p) => ({
        type: 'Feature' as const,
        properties: {
          modo: p.mode,
          cor: COR_DO_MODO[p.mode] ?? '#0a5c7a',
          linha: p.route?.shortName ?? '',
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: descodificarLinha(p.legGeometry!.points),
        },
      }))
      .filter((f) => f.geometry.coordinates.length > 1),
  };
}

/** A caixa que envolve o percurso, para o mapa o enquadrar todo. */
export function caixaDe(g: PercursoGeo): [[number, number], [number, number]] | null {
  let oeste = 180;
  let sul = 90;
  let este = -180;
  let norte = -90;
  let houve = false;
  for (const f of g.features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      houve = true;
      if (lon < oeste) oeste = lon;
      if (lon > este) este = lon;
      if (lat < sul) sul = lat;
      if (lat > norte) norte = lat;
    }
  }
  return houve
    ? [
        [oeste, sul],
        [este, norte],
      ]
    : null;
}
