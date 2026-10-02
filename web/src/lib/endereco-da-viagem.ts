/**
 * A VIAGEM NO ENDEREÇO: de onde, para onde, que dia e a que horas.
 *
 * Nada ficava no endereço (P2-027). Abrir uma paragem, abrir as direções,
 * escolher o dia — o endereço continuava a ser `/`, e duas coisas partiam-se
 * com isso: o «voltar» do telemóvel, que é o gesto de quem quer fechar uma
 * camada, saía da aplicação e deitava a viagem fora; e não havia maneira de
 * mandar a alguém «a viagem das 8h de amanhã».
 *
 * A forma é a que o sítio já usava no `/viagem/` — `?de=` e `?para=` —, com
 * o que lhe faltava. Está escrita em `docs/ENDERECOS.md` para quem liga de
 * fora (a agenda cultural da mesma casa liga daí ao planeador):
 *
 *     /viagem/?de=<ponta>&para=<ponta>&dia=AAAA-MM-DD&hora=HH:MM
 *
 * Uma PONTA é, por esta ordem de tentativa:
 *
 *   1. coordenadas, `39.47020,-10.53859` — um ponto qualquer, que o planeador
 *      trata como trata uma rua: a pé até à paragem mais perto. O nome que se
 *      mostra vem em `nome` (o destino) ou `nome_de` (a partida), e NUNCA se
 *      inventa uma paragem com ele;
 *   2. o identificador de uma paragem ou de uma estação — é o que o sítio
 *      escreve, porque um nome muda quando a operadora o reescreve e o
 *      identificador não;
 *   3. o nome exato, que é o que as páginas de paragem sempre escreveram e
 *      continua a valer para não partir ligações que já andam por aí.
 *
 * Funções puras: não leem o `window` nem tocam no histórico. Quem as chama é
 * que decide quando ler e quando escrever.
 */
import { simples } from './letras.ts';
import type { Ponto } from './formato.ts';

export type Caixa = { lat_min: number; lat_max: number; lon_min: number; lon_max: number };

/**
 * QUANTO SE ACEITA PARA LÁ DA CAIXA DA REGIÃO, em graus.
 *
 * É a margem do recorte do mapa (`margem_recorte_graus` nas receitas): há
 * carreiras que atravessam a fronteira, e um evento na vila do lado continua a
 * ter quem lá chegue. Para lá disto não há paragem desta região a distância
 * que se faça a pé, e dizer «sem viagem» seria esconder que o problema é o
 * sítio, e não o horário.
 */
export const MARGEM_GRAUS = 0.1;

/** Um nome que se mostra não precisa de mais do que isto. */
const NOME_MAXIMO = 80;

export type PontaLida =
  /** Uma ponta que o planeador sabe usar. */
  | { tipo: 'ponto'; ponto: Ponto }
  /** Coordenadas válidas, mas longe de mais desta região para haver caminho. */
  | { tipo: 'fora'; nome: string }
  /** Nem coordenadas, nem uma paragem que se conheça. */
  | { tipo: 'desconhecida'; valor: string };

const COORDENADAS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * O nome que vem de fora, pronto a mostrar.
 *
 * Mostra-se como TEXTO — o React escapa-o, e nunca entra em HTML —, e mesmo
 * assim limpa-se: carateres de controlo fora, espaços seguidos num só, e um
 * comprimento que caiba num campo. Quem liga de fora escreve o que quiser; o
 * que se mostra é um nome.
 */
export function limparNome(texto: string | null | undefined): string {
  const limpo = String(texto ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.length > NOME_MAXIMO ? `${limpo.slice(0, NOME_MAXIMO - 1).trimEnd()}…` : limpo;
}

/** Dentro da caixa da região, com a margem — ou dentro do mundo, sem caixa. */
export function dentroDaRegiao(lat: number, lon: number, caixa: Caixa | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (!caixa) return true;
  return (
    lat >= caixa.lat_min - MARGEM_GRAUS &&
    lat <= caixa.lat_max + MARGEM_GRAUS &&
    lon >= caixa.lon_min - MARGEM_GRAUS &&
    lon <= caixa.lon_max + MARGEM_GRAUS
  );
}

/**
 * Uma ponta do endereço, lida contra os pontos que esta região conhece.
 *
 * `null` quando o endereço não a traz. As paragens e as estações vêm antes
 * dos outros pontos com o mesmo identificador ou o mesmo nome: os
 * identificadores de modos diferentes vêm de fontes diferentes, e se algum
 * dia coincidirem, quem pede uma viagem quer a paragem.
 */
export function lerPonta(
  valor: string | null | undefined,
  nome: string | null | undefined,
  pontos: Ponto[],
  caixa: Caixa | null,
): PontaLida | null {
  const v = (valor ?? '').trim();
  if (!v) return null;

  const m = COORDENADAS.exec(v);
  if (m) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    const mostrado = limparNome(nome) || 'Ponto escolhido';
    if (!dentroDaRegiao(lat, lon, caixa)) return { tipo: 'fora', nome: mostrado };
    return {
      tipo: 'ponto',
      // UM PONTO QUALQUER, e não uma paragem: sem identificador, e com o
      // tipo de um sítio — a pé até à paragem mais perto, como uma rua.
      ponto: { nome: mostrado, lat, lon, tipo: 'sitio', id: '', concelho: '' },
    };
  }

  const comHorario = (p: Ponto) => p.tipo === 'paragem' || p.tipo === 'estacao';
  const porId =
    pontos.find((p) => p.id === v && comHorario(p)) ?? pontos.find((p) => p.id === v && !!p.id);
  if (porId) return { tipo: 'ponto', ponto: porId };
  const porNome =
    pontos.find((p) => p.nome === v && comHorario(p)) ?? pontos.find((p) => p.nome === v);
  if (porNome) return { tipo: 'ponto', ponto: porNome };
  // ESCRITO À MÃO, sem acentos nem maiúsculas — é o que chega da caixa «Para
  // onde vais?» que as câmaras põem nos sítios delas (P4-007): «porto ameno
  // (terminal)» é o Porto Ameno (Terminal). Só quando o nome é de UM ponto
  // com horário, ou de um só ponto: dois com o mesmo nome não se adivinham.
  const t = simples(v);
  const iguais = pontos.filter((p) => simples(p.nome) === t);
  const comHorarioIguais = iguais.filter(comHorario);
  const unico =
    comHorarioIguais.length === 1 ? comHorarioIguais[0] : iguais.length === 1 ? iguais[0] : null;
  if (unico) return { tipo: 'ponto', ponto: unico };
  return { tipo: 'desconhecida', valor: limparNome(v) };
}

/** `AAAA-MM-DD` que exista mesmo no calendário — o 31 de fevereiro não passa. */
export function diaValido(dia: string | null | undefined): string | null {
  const d = (dia ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [a, m, n] = d.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, n));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === n ? d : null;
}

/** `HH:MM` entre 00:00 e 23:59. */
export function horaValida(hora: string | null | undefined): string | null {
  const h = (hora ?? '').trim();
  const m = /^(\d{2}):(\d{2})$/.exec(h);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? h : null;
}

export type ViagemNoEndereco = {
  de: PontaLida | null;
  para: PontaLida | null;
  /** O dia e a hora PEDIDOS — `null` quando o endereço não os traz, e é «agora». */
  dia: string | null;
  hora: string | null;
};

/** O que o endereço diz da viagem. Lê-se uma vez, à entrada, e em cada «voltar». */
export function lerViagem(
  q: URLSearchParams,
  pontos: Ponto[],
  caixa: Caixa | null,
): ViagemNoEndereco {
  const dia = diaValido(q.get('dia'));
  const hora = horaValida(q.get('hora'));
  return {
    de: lerPonta(q.get('de'), q.get('nome_de'), pontos, caixa),
    para: lerPonta(q.get('para'), q.get('nome'), pontos, caixa),
    // Um dia sem hora começa à meia-noite: o planeador olha para as 24 horas
    // seguintes, e são as ligações todas desse dia. Uma hora sem dia é hoje.
    dia,
    hora: hora ?? (dia ? '00:00' : null),
  };
}

/**
 * Como uma ponta se escreve no endereço — ou `null`, quando não se escreve.
 *
 * **«A MINHA LOCALIZAÇÃO» NÃO VAI PARA O ENDEREÇO.** É a coordenada de quem
 * procura: ficava no histórico do navegador, e numa ligação partilhada ia
 * parar ao telemóvel de outra pessoa. É a mesma regra da medição, que nunca
 * leva a coordenada de ninguém (`Direccoes.tsx`). Uma viagem a partir daqui
 * partilha-se com o destino e a hora, e quem a recebe parte de onde estiver.
 */
function pontaEscrita(p: Ponto | null): { valor: string; nome?: string } | null {
  if (!p || p.tipo === 'aqui') return null;
  if ((p.tipo === 'paragem' || p.tipo === 'estacao') && p.id) return { valor: p.id };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  return { valor: `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, nome: p.nome };
}

/** A viagem como parâmetros de endereço, na ordem em que se leem. */
export function escreverViagem(v: {
  de: Ponto | null;
  para: Ponto | null;
  dia?: string | null;
  hora?: string | null;
}): URLSearchParams {
  const q = new URLSearchParams();
  const de = pontaEscrita(v.de);
  const para = pontaEscrita(v.para);
  if (de) q.set('de', de.valor);
  if (para) q.set('para', para.valor);
  if (para?.nome) q.set('nome', para.nome);
  if (de?.nome) q.set('nome_de', de.nome);
  if (v.dia) q.set('dia', v.dia);
  if (v.dia && v.hora) q.set('hora', v.hora);
  return q;
}

/** `?…` ou nada — para juntar a um caminho sem deixar um `?` pendurado. */
export function comoProcura(q: URLSearchParams): string {
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * O que o endereço pediu e não se pôde abrir, numa frase — ou nada.
 *
 * Um ponto por coordenadas longe desta região não tem caminho por aqui, e
 * dizer «sem viagem» escondia que o problema é o sítio e não o horário. Um
 * nome que não se conhece diz-se pelo nome, para quem o mandou poder corrigir.
 */
export function avisoDe(
  de: PontaLida | null,
  para: PontaLida | null,
  emDaRegiao: string,
): string | null {
  const partes: string[] = [];
  // Com o género de cada uma: «o destino pedido», «a partida pedida».
  for (const [l, papel] of [
    [para, 'O destino pedido'],
    [de, 'A partida pedida'],
  ] as const) {
    if (l?.tipo === 'fora') {
      partes.push(
        `${papel}, «${l.nome}», fica longe de mais: este planeador só conhece os transportes ${emDaRegiao}.`,
      );
    } else if (l?.tipo === 'desconhecida') {
      partes.push(`${papel}, «${l.valor}», não é uma paragem nem um sítio que se conheça aqui.`);
    }
  }
  return partes.length ? partes.join(' ') : null;
}
