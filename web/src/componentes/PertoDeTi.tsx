'use client';

import { useEffect, useState } from 'react';
import Distintivo from '@/componentes/Distintivo';
import { esperaLegivel, horaLegivel, type Partida, type Ponto } from '@/lib/formato';
import {
  calendarioDe,
  chaveDoDia,
  dataCompleta,
  diaDaSemana,
  horaDoRelogio,
  proximas,
  quandoE,
  type Calendario,
  type Proximas,
} from '@/lib/dias';
import { enderecoDosDados } from '@/lib/dados-do-navegador';
import { pedirPontos } from '@/lib/pontos-do-navegador';

/**
 * As paragens mais perto, e o que passa nelas a seguir (§6, «Perto de ti»).
 *
 * **NÃO PEDE A LOCALIZAÇÃO AO CARREGAR**, e é a decisão que estrutura o resto.
 * Uma página que pergunta antes de mostrar seja o que for é uma página que não
 * serve quem recusa — e quem recusa é muita gente, com razão. Aqui há um botão:
 * quem quiser carrega, quem não quiser tem a página inteira na mesma.
 *
 * **E a distância vai em metros, não num mapa.** «A 180 m» responde à pergunta
 * («é esta a paragem em frente?») sem exigir que se saiba ler um mapa, sem
 * carregar mosaicos e sem deixar de fora quem usa leitor de ecrã.
 *
 * DUAS PORTAS PARA A MESMA COISA. Em «A rede» é o caminho sem mapa, com as
 * cinco paragens mais perto e as ligações para a página de cada uma. No mapa
 * (`variante="mapa"`) é a folha de baixo a responder ao botão da localização,
 * que até aqui só punha um ponto azul (P2-016): três paragens, duas partidas
 * de cada, e tocar numa abre o cartão dela.
 */

type ComDistancia = Ponto & { metros: number };

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'a-perguntar' }
  | { tipo: 'perto'; pontos: ComDistancia[] }
  | { tipo: 'recusado' }
  | { tipo: 'indisponivel' }
  | { tipo: 'falhou'; razao: string };

/** Haversine. A Terra não é plana e uma região tem dezenas de km de ponta a ponta. */
function metrosEntre(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanciaLegivel(metros: number): string {
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace('.', ',')} km`;
}

/**
 * Antes das horas, o dia delas — em poucas palavras, que isto é uma linha.
 *
 * É a mesma informação da folha do mapa, encurtada: «Hoje não há. Na
 * segunda-feira, 5/10:» lê-se de relance numa lista de cinco paragens.
 */
function prefixo(r: Proximas<Partida>, hoje: Date): string {
  if (r.tipo !== 'no-dia' || r.dias === 0) return '';
  const h = chaveDoDia(hoje);
  const quando = quandoE(r.chave, r.dias, h);
  const antes = r.hoje === 'nao-ha' ? `Hoje, ${diaDaSemana(h)}, não há.` : 'Hoje já não há mais.';
  return `${antes} ${quando.charAt(0).toUpperCase()}${quando.slice(1)}:`;
}

const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');

export default function PertoDeTi({
  regiao,
  pontos,
  modosDesligados = [],
  variante = 'pagina',
  posicao = null,
  aoEscolher,
}: {
  regiao: string;
  /**
   * Os pontos, quando quem usa isto já os tem — o mapa tem-nos. Sem eles,
   * pedem-se quando se souber onde se está (P3-006): «A rede» não os leva na
   * página, e quem não carrega no botão não os paga.
   */
  pontos?: Ponto[];
  /** Os módulos que o painel desligou: os pontos deles não contam. */
  modosDesligados?: string[];
  /** `pagina` em «A rede»; `mapa` na folha de baixo da aplicação. */
  variante?: 'pagina' | 'mapa';
  /**
   * Onde está quem pergunta, quando já se sabe — o botão da localização do
   * mapa responde por aqui, e a folha não volta a perguntar.
   */
  posicao?: [number, number] | null;
  /** No mapa, tocar numa paragem abre o cartão dela em vez de mudar de página. */
  aoEscolher?: (p: Ponto) => void;
}) {
  const noMapa = variante === 'mapa';
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [partidas, setPartidas] = useState<Record<string, Partida[]>>({});
  const [cores, setCores] = useState<Record<string, string>>({});
  /**
   * Os concelhos cujo ficheiro de partidas NÃO CHEGOU. Uma paragem sem horas
   * por falta de rede não é uma paragem sem partidas, e a lista diz qual é.
   */
  const [semResposta, setSemResposta] = useState<string[]>([]);
  /** Em que dias anda cada serviço — ver mais abaixo, onde se usa. */
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);

  /**
   * UM PEDIDO POR CONCELHO, não um por paragem. Quem está numa paragem está
   * num concelho, e as cinco mais perto estão quase sempre no mesmo — o maior
   * ficheiro tem 50 kB com gzip.
   */
  function carregarPartidas(concelhos: string[]) {
    setSemResposta((antes) => antes.filter((c) => !concelhos.includes(c)));
    for (const c of concelhos) {
      fetch(enderecoDosDados(regiao, `partidas/${seguro(c)}.json`))
        .then((r) => {
          if (r.ok) return r.json();
          // O ficheiro que não existe é um concelho sem partidas — uma
          // resposta. Qualquer outra coisa é falta de resposta.
          if (r.status === 404 || r.status === 400) return {};
          throw new Error(`partidas: HTTP ${r.status}`);
        })
        .then((mapa: Record<string, Partida[]>) => setPartidas((antes) => ({ ...antes, ...mapa })))
        .catch(() => setSemResposta((antes) => [...new Set([...antes, c])]));
    }
    // As cores das linhas, para o distintivo dizer a linha como o resto do
    // sítio a diz. Sem elas sai neutro — e continua a dizer o número.
    if (!Object.keys(cores).length) {
      fetch(enderecoDosDados(regiao, 'cores-das-linhas.json'))
        .then((r) => (r.ok ? r.json() : {}))
        .then((m: Record<string, string>) => setCores(m ?? {}))
        .catch(() => {});
    }
  }

  /**
   * A partir de onde se está: os pontos (os que já cá estão, ou pedidos
   * agora) e a tabela dos dias, que só aqui passa a fazer falta.
   */
  function mostrarPerto(aqui: [number, number]) {
    if (calendario === undefined || calendario === null) {
      calendarioDe(regiao).then((c) => setCalendario(c));
    }
    if (pontos?.length) {
      mostrarPertoDe(aqui, pontos);
      return;
    }
    setEstado({ tipo: 'a-perguntar' });
    pedirPontos(regiao, modosDesligados)
      .then((todos) => mostrarPertoDe(aqui, todos))
      .catch(() =>
        setEstado({
          tipo: 'falhou',
          razao: 'a lista das paragens não chegou — pode ser da ligação à Internet',
        }),
      );
  }

  function mostrarPertoDe(aqui: [number, number], pontos: Ponto[]) {
    // SÓ PARAGENS E ESTAÇÕES, e não tudo o que o mapa mostra.
    //
    // O índice traz também as estações de bicicletas, as praças de táxi e as
    // paragens dos urbanos municipais. Aqui não servem: este bloco responde
    // «a que horas passa o próximo», e nenhum desses tem partidas — apareciam
    // como sítios mudos, a empurrar para fora as paragens que respondem. E a
    // ficha deles não existe em `/rede/`: a ligação ficava partida.
    const perto = pontos
      .filter((p) => p.tipo === 'paragem' || p.tipo === 'estacao')
      .map((p) => ({ ...p, metros: metrosEntre(aqui, [p.lat, p.lon]) }))
      .sort((a, b) => a.metros - b.metros)
      .slice(0, noMapa ? 3 : 5);
    setEstado({ tipo: 'perto', pontos: perto });
    carregarPartidas([...new Set(perto.map((p) => p.concelho))]);
  }

  // A LOCALIZAÇÃO QUE O MAPA JÁ TEM não se volta a pedir: o botão do mapa
  // perguntou, o navegador respondeu, e a folha mostra o que há ali perto.
  useEffect(() => {
    if (posicao) mostrarPerto(posicao);
    // `mostrarPerto` muda a cada renderização; o que decide é a posição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicao?.[0], posicao?.[1]]);

  function procurar() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado({ tipo: 'indisponivel' });
      return;
    }
    setEstado({ tipo: 'a-perguntar' });
    navigator.geolocation.getCurrentPosition(
      (pos) => mostrarPerto([pos.coords.latitude, pos.coords.longitude]),
      (erro) => {
        if (erro.code === erro.PERMISSION_DENIED) setEstado({ tipo: 'recusado' });
        else setEstado({ tipo: 'falhou', razao: erro.message });
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  // O dia e a hora saem do mesmo relógio, o de quem está a ler.
  const hoje = new Date();
  const agora = horaDoRelogio(hoje);
  // Em que dias anda cada serviço. `undefined` enquanto se pergunta; `null`
  // quando não se conseguiu saber — e aí as horas vêm com o aviso de que
  // podem não ser de hoje (`lib/dias.ts`). PEDE-SE QUANDO É PRECISA — quando
  // se sabe onde se está (`mostrarPerto`) —, e não ao abrir a página: o botão
  // está no ecrã de abertura do mapa, e quase ninguém carrega nele.
  // A MESMA ESCOLHA QUE A FOLHA DO MAPA FAZ (`lib/dias.ts`): duas cópias da
  // mesma regra em dois ficheiros divergiam, e a mesma paragem dizia coisas
  // diferentes conforme se chegasse a ela pelo mapa ou por esta lista.
  const proximasDe = (suas: Partida[]) =>
    calendario === undefined ? null : proximas(suas, hoje, agora, calendario, noMapa ? 2 : 3);

  const comLista = estado.tipo === 'perto';
  // O identificador da página é o de sempre: é por ele que os testes e a
  // ligação de salto encontram o bloco.
  const idDoTitulo = noMapa ? 'perto-no-mapa' : 'perto';

  return (
    <section
      aria-labelledby={noMapa && !comLista ? undefined : idDoTitulo}
      aria-label={noMapa && !comLista ? 'Perto de ti' : undefined}
      className={noMapa ? 'perto-no-mapa' : undefined}
    >
      {/* No mapa o título só aparece com a lista: antes dela, o bloco é um
          botão, e um título por cima de um botão só ocupava a folha. */}
      {(!noMapa || comLista) && <h2 id={idDoTitulo}>Perto de ti</h2>}

      {estado.tipo === 'parado' && (
        <>
          {!noMapa && (
            <p>
              As paragens mais próximas e o que passa nelas a seguir. Só se souber onde estás — e
              isso és tu que decides.
            </p>
          )}
          <button
            type="button"
            className={noMapa ? 'botao secundario perto-botao' : undefined}
            onClick={procurar}
          >
            {noMapa ? 'Paragens perto de mim' : 'Ver as paragens perto de mim'}
          </button>
        </>
      )}

      {/* A região viva diz o que aconteceu a quem não vê a lista aparecer. */}
      <div aria-live="polite" aria-busy={estado.tipo === 'a-perguntar'}>
        {estado.tipo === 'a-perguntar' && <p>À espera da tua localização…</p>}

        {estado.tipo === 'recusado' && (
          <p>
            Sem a localização não dá para saber o que está perto — e está tudo bem. Procura pelo{' '}
            nome da paragem ou pelo concelho, que dá ao mesmo sítio.
          </p>
        )}

        {estado.tipo === 'indisponivel' && (
          <p>Este navegador não sabe dizer onde estás. Procura pelo nome da paragem.</p>
        )}

        {estado.tipo === 'falhou' && (
          <p>
            Não foi possível obter a tua localização ({estado.razao}). Tenta outra vez ou procura
            pelo nome.
          </p>
        )}

        {estado.tipo === 'perto' && (
          <>
            {!noMapa && (
              <p>
                {estado.pontos.length === 1
                  ? 'A paragem mais perto.'
                  : `As ${estado.pontos.length} paragens mais perto.`}{' '}
                As distâncias são em linha reta — a pé é sempre um pouco mais.
              </p>
            )}
            <ul className={noMapa ? 'perto-lista' : 'lista perto-lista'}>
              {estado.pontos.map((p) => {
                const suas = partidas[p.id];
                const r = suas?.length ? proximasDe(suas) : null;
                const href = `/rede/${p.tipo === 'estacao' ? 'estacoes' : 'paragens'}/${seguro(p.id)}/`;
                const cabeca = (
                  <>
                    <span className="perto-nome">{p.nome}</span>
                    <span className="secundario">{distanciaLegivel(p.metros)}</span>
                  </>
                );
                return (
                  <li key={p.id}>
                    {noMapa && aoEscolher ? (
                      <button type="button" className="perto-paragem" onClick={() => aoEscolher(p)}>
                        {cabeca}
                      </button>
                    ) : (
                      <a href={href}>{cabeca}</a>
                    )}
                    {(r?.tipo === 'no-dia' || r?.tipo === 'sem-calendario') && (
                      <>
                        {/* QUANDO AS HORAS NÃO SÃO DE HOJE, A LINHA COMEÇA
                          POR O DIZER: «Hoje, domingo, não há. Na
                          segunda-feira, 5/10:». */}
                        {r.tipo === 'no-dia' && r.dias > 0 ? (
                          <p className="secundario perto-dia">{prefixo(r, hoje)}</p>
                        ) : (
                          !noMapa && <p className="secundario perto-dia">A seguir:</p>
                        )}
                        {/* A MESMA LINHA DE PARTIDA DO CARTÃO DO MAPA (P2-017):
                          o número, PARA ONDE VAI e quanto falta. Dizia só o
                          número — e numa paragem com os dois sentidos a mesma
                          linha passa para lados opostos. */}
                        <ul className="perto-partidas">
                          {r.partidas.map((d, i) => {
                            const { texto, diaSeguinte } = horaLegivel(d.hora);
                            const espera =
                              r.tipo === 'no-dia' && r.dias <= 1
                                ? esperaLegivel(d.hora, agora, r.dias === 1)
                                : null;
                            return (
                              <li key={`${d.hora}-${d.linha}-${i}`}>
                                <Distintivo codigo={d.linha} cor={cores[d.linha_id]} />
                                <span className="perto-destino">
                                  {d.circular ? 'circular' : `para ${d.destino}`}
                                </span>
                                <span className="perto-quando">
                                  {espera ? (
                                    <>
                                      <strong>{espera}</strong> ({texto})
                                    </>
                                  ) : (
                                    <strong>{texto}</strong>
                                  )}
                                  {diaSeguinte && ' dia seguinte'}
                                  {d.estimada && <em> · hora estimada</em>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        {r.tipo === 'sem-calendario' && (
                          <p className="secundario">
                            Não foi possível confirmar os dias: estas horas podem não ser de hoje.
                          </p>
                        )}
                      </>
                    )}
                    {r?.tipo === 'fora-do-periodo' && (
                      <p className="secundario">
                        Os horários carregados vão de {dataCompleta(r.inicio)} a{' '}
                        {dataCompleta(r.fim)}, e não dizem o que passa hoje.
                      </p>
                    )}
                    {r?.tipo === 'nenhuma' && (
                      <p className="secundario">
                        Sem mais partidas nos horários carregados, que vão até {dataCompleta(r.fim)}
                        .
                      </p>
                    )}
                    {suas && suas.length === 0 && (
                      <p className="secundario">Sem partidas registadas nesta paragem.</p>
                    )}
                    {!suas && semResposta.includes(p.concelho) && (
                      <p className="secundario">Não foi possível carregar as horas.</p>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* UMA FALHA DE REDE NÃO É «SEM PARTIDAS». Diz-se, e tenta-se
              outra vez com um toque, sem perder a lista. */}
            {semResposta.length > 0 && (
              <p>
                Não foi possível carregar as horas de algumas paragens — pode ser da ligação à
                Internet.{' '}
                <button type="button" onClick={() => carregarPartidas(semResposta)}>
                  Tentar de novo
                </button>
              </p>
            )}
            {!noMapa && (
              <p className="secundario">
                Horários planeados, não em tempo real. Uma hora estimada foi calculada por nós entre
                duas do horário publicado.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
