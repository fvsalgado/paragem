'use client';

import { useEffect, useState } from 'react';
import { horaLegivel, type Partida } from '@/lib/formato';
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

/**
 * As paragens mais perto, e o que passa nelas a seguir (§8, bloco 3).
 *
 * **NÃO PEDE A LOCALIZAÇÃO AO CARREGAR**, e é a decisão que estrutura o resto.
 * Uma página que pergunta antes de mostrar seja o que for é uma página que não
 * serve quem recusa — e quem recusa é muita gente, com razão. Aqui há um botão:
 * quem quiser carrega, quem não quiser tem a página inteira na mesma.
 *
 * **E a distância vai em metros, não num mapa.** «A 180 m» responde à pergunta
 * («é esta a paragem em frente?») sem exigir que se saiba ler um mapa, sem
 * carregar mosaicos e sem deixar de fora quem usa leitor de ecrã. O mapa é
 * outra coisa e vem à parte.
 */

type Ponto = {
  nome: string;
  lat: number;
  lon: number;
  tipo: string;
  id: string;
  concelho: string;
};
type ComDistancia = Ponto & { metros: number };

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'a-perguntar' }
  | { tipo: 'perto'; pontos: ComDistancia[] }
  | { tipo: 'recusado' }
  | { tipo: 'indisponivel' }
  | { tipo: 'falhou'; razao: string };

/** Haversine. A Terra não é plana e a região tem 80 km de ponta a ponta. */
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
 * As próximas partidas a partir de agora, na ordem em que acontecem.
 *
 * A escolha vive em `lib/dias.ts` e é a MESMA que a folha do mapa usa. Eram
 * duas cópias da mesma regra em dois ficheiros, e a do mapa não filtrava pelo
 * dia — a mesma paragem dizia coisas diferentes conforme se chegasse a ela
 * pelo mapa ou pela lista de «perto de ti».
 */
function proximasAqui(
  partidas: Partida[],
  hoje: Date,
  agora: string,
  calendario: Calendario | null,
): Proximas<Partida> {
  return proximas(partidas, hoje, agora, calendario, 3);
}

/**
 * Antes das horas, o dia delas — em poucas palavras, que isto é uma linha.
 *
 * É a mesma informação da folha do mapa, encurtada: «Hoje não há. Na
 * segunda-feira, 5/10:» lê-se de relance numa lista de cinco paragens.
 */
function prefixo(r: Proximas<Partida>, hoje: Date): string {
  if (r.tipo !== 'no-dia' || r.dias === 0) return 'A seguir: ';
  const h = chaveDoDia(hoje);
  const quando = quandoE(r.chave, r.dias, h);
  const antes = r.hoje === 'nao-ha' ? `Hoje, ${diaDaSemana(h)}, não há.` : 'Hoje já não há mais.';
  return `${antes} ${quando.charAt(0).toUpperCase()}${quando.slice(1)}: `;
}

export default function PertoDeTi({ regiao, pontos }: { regiao: string; pontos: Ponto[] }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [partidas, setPartidas] = useState<Record<string, Partida[]>>({});
  /**
   * Os concelhos cujo ficheiro de partidas NÃO CHEGOU. Uma paragem sem horas
   * por falta de rede não é uma paragem sem partidas, e a lista diz qual é.
   */
  const [semResposta, setSemResposta] = useState<string[]>([]);

  /**
   * UM PEDIDO POR CONCELHO, não um por paragem. Quem está numa paragem está
   * num concelho, e as cinco mais perto estão quase sempre no mesmo — o maior
   * ficheiro tem 50 kB com gzip.
   */
  function carregarPartidas(concelhos: string[]) {
    setSemResposta((antes) => antes.filter((c) => !concelhos.includes(c)));
    for (const c of concelhos) {
      fetch(enderecoDosDados(regiao, `partidas/${c.replace(/[^a-zA-Z0-9\-_]/g, '-')}.json`))
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
  }

  function procurar() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado({ tipo: 'indisponivel' });
      return;
    }
    setEstado({ tipo: 'a-perguntar' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const aqui: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        // SÓ PARAGENS E ESTAÇÕES, e não tudo o que o mapa mostra.
        //
        // O índice passou a trazer também as estações de bicicletas, as
        // praças de táxi e as paragens dos urbanos municipais. Aqui não
        // servem: este bloco responde «a que horas passa o próximo», e
        // nenhum desses tem partidas — apareciam como sítios mudos, a
        // empurrar para fora as paragens que respondem. E a ficha deles não
        // existe em `/rede/`: a ligação ficava partida.
        const perto = pontos
          .filter((p) => p.tipo === 'paragem' || p.tipo === 'estacao')
          .map((p) => ({ ...p, metros: metrosEntre(aqui, [p.lat, p.lon]) }))
          .sort((a, b) => a.metros - b.metros)
          .slice(0, 5);
        setEstado({ tipo: 'perto', pontos: perto });
        carregarPartidas([...new Set(perto.map((p) => p.concelho))]);
      },
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
  // podem não ser de hoje (`lib/dias.ts`).
  const [calendario, setCalendario] = useState<Calendario | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    calendarioDe(regiao).then((c) => vivo && setCalendario(c));
    return () => {
      vivo = false;
    };
  }, [regiao]);
  const proximasDe = (suas: Partida[]) =>
    calendario === undefined ? null : proximasAqui(suas, hoje, agora, calendario);

  return (
    <section aria-labelledby="perto">
      <h2 id="perto">Perto de ti</h2>

      {estado.tipo === 'parado' && (
        <>
          <p>
            As paragens mais próximas e o que passa nelas a seguir. Só se souber onde estás — e isso
            és tu que decides.
          </p>
          <button type="button" onClick={procurar}>
            Ver as paragens perto de mim
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
            <p>
              {estado.pontos.length} sítios mais próximos. As distâncias são em linha reta — a pé é
              sempre um pouco mais.
            </p>
            <ul className="lista">
              {estado.pontos.map((p) => {
                const suas = partidas[p.id];
                const r = suas?.length ? proximasDe(suas) : null;
                return (
                  <li key={p.id}>
                    <a
                      href={`/rede/${p.tipo === 'estacao' ? 'estacoes' : 'paragens'}/${p.id.replace(/[^a-zA-Z0-9\-_]/g, '-')}/`}
                    >
                      <span>{p.nome}</span>
                      <span className="secundario">{distanciaLegivel(p.metros)}</span>
                    </a>
                    {(r?.tipo === 'no-dia' || r?.tipo === 'sem-calendario') && (
                      <p className="secundario">
                        {/* QUANDO AS HORAS NÃO SÃO DE HOJE, A LINHA COMEÇA
                          POR O DIZER: «Hoje, domingo, não há. Na
                          segunda-feira, 5/10: 06:45 1000». */}
                        {prefixo(r, hoje)}
                        {r.partidas.map((d, i) => {
                          const { texto, diaSeguinte } = horaLegivel(d.hora);
                          return (
                            <span key={`${d.hora}-${d.linha}-${i}`}>
                              {i > 0 && ' · '}
                              {texto}
                              {diaSeguinte && ' (dia seguinte)'} {d.linha}
                              {d.estimada && ' est.'}
                            </span>
                          );
                        })}
                        {r.tipo === 'sem-calendario' && ' — sem confirmar se é hoje'}
                      </p>
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
            <p className="secundario">
              Horários planeados, não em tempo real. Uma hora marcada <em>est.</em> foi calculada
              por nós entre duas do horário publicado.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
