import type { CSSProperties } from 'react';
import Link from '@/componentes/Ligacao';
import { rotuloDaPonta, type Caixa } from '@/lib/esquema';

/**
 * O ESQUEMA DE UMA LINHA: as paragens pela ordem, onde ficam, ligadas a
 * direito — um mapa pequeno no alto da página da linha, desenhado no servidor.
 *
 * A página dizia por onde a linha passa numa lista de nomes, e quem não
 * conhece a terra não sabia se ela ia para norte ou para sul, nem se a
 * paragem dele ficava a meio ou na ponta. Isto responde a isso de relance.
 *
 * UM SENTIDO DE CADA VEZ (auditoria de 1/11/2026, #13). Desenhava os dois
 * sentidos sobrepostos no alto da página, e na linha medida um tinha quarenta paragens
 * aos ziguezagues e o outro cinco ligadas a direito: a primeira imagem da
 * página parecia um rabisco, com os nomes das pontas atravessados pelo traço.
 * Agora cada sentido tem o seu, no princípio da secção dele; a moldura é a
 * mesma para os dois, para se poderem comparar. Os nomes das pontas vão para
 * onde o traço não passa (`lib/esquema.ts`).
 *
 * NÃO É O TRAÇADO NAS RUAS, e diz-se na legenda: o traçado vive na grelha do
 * planeador, que é pesada de mais para uma página de catálogo — e ligar as
 * paragens a direito é o que um esquema de rede faz. Sem MapLibre, sem
 * mosaicos: um SVG de uns centos de bytes, que se lê com a página em baixo de
 * rede e se imprime.
 */
export default function EsquemaDaLinha({
  sentidos,
  qual,
  onde,
  cor,
  codigo,
  noMapa = null,
}: {
  /** As paragens de cada sentido, pela ordem — todos, para a moldura ser a mesma. */
  sentidos: { id: string; nome: string }[][];
  /** O sentido que se desenha. */
  qual: number;
  /** Onde fica cada paragem, `[lat, lon]`. As que não têm sítio ficam de fora. */
  onde: ReadonlyMap<string, [number, number]>;
  /** A cor do traço (já com o contraste de um traço, `traco`). */
  cor: string;
  codigo: string;
  /**
   * O endereço do mapa desta região numa paragem da linha, ou `null` numa
   * região sem mapa — só aí a legenda pode mandar para lá.
   */
  noMapa?: ((id: string) => string) | null;
}) {
  const comSitio = sentidos.map((s) => s.filter((p) => onde.has(p.id)));
  const desenhaveis = comSitio.filter((s) => s.length > 1);
  const deste = comSitio[qual] ?? [];
  if (deste.length < 2) return null;

  // UMA PROJEÇÃO SIMPLES, e chega: a escala de uma linha são dezenas de km, e
  // a longitude encolhe com o cosseno da latitude. A MESMA para os sentidos
  // todos, para o desenho não saltar ao trocar de um para o outro.
  const todas = desenhaveis.flatMap((s) => s.map((p) => onde.get(p.id)!));
  const lat0 = todas.reduce((s, c) => s + c[0], 0) / todas.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = todas.map((c) => c[1] * k);
  const ys = todas.map((c) => -c[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A CAIXA SEGUE A LINHA, entre uma faixa (3:1) e um quadrado: uma linha
  // leste-oeste fica baixa, e uma norte-sul não fica um risco num retângulo
  // vazio. Em cima e em baixo há mais margem, para os nomes das pontas.
  const L = 300;
  const mx = 14;
  const my = 22;
  const A = Math.round(
    Math.min(L, Math.max(L / 3, ((y1 - y0) / Math.max(x1 - x0, 1e-6)) * (L - 2 * mx) + 2 * my)),
  );
  const escala = Math.min(
    (L - 2 * mx) / Math.max(x1 - x0, 1e-6),
    (A - 2 * my) / Math.max(y1 - y0, 1e-6),
  );
  const dx = (L - (x1 - x0) * escala) / 2;
  const dy = (A - (y1 - y0) * escala) / 2;
  const ponto = (c: [number, number]) =>
    [dx + (c[1] * k - x0) * escala, dy + (-c[0] - y0) * escala].map((v) => Math.round(v * 10) / 10);

  const xy = deste.map((p) => ponto(onde.get(p.id)!));
  const primeira = deste[0];
  const ultima = deste[deste.length - 1];
  const ocupadas: Caixa[] = [];
  const rotulos = [primeira, ultima].map((p, i) => {
    const r = rotuloDaPonta(xy[i === 0 ? 0 : xy.length - 1], p.nome, xy, L, A, ocupadas);
    ocupadas.push(r.caixa);
    return { ...r, nome: p.nome };
  });
  // As paragens desenham-se uma vez, mesmo que o percurso volte a passar nelas.
  const vistas = new Map<string, { xy: number[]; ponta: boolean }>();
  xy.forEach((c, i) => {
    const chave = c.join(',');
    const ponta = i === 0 || i === xy.length - 1;
    vistas.set(chave, { xy: c, ponta: ponta || !!vistas.get(chave)?.ponta });
  });
  return (
    <figure className="esquema-da-linha" style={{ '--cor-do-esquema': cor } as CSSProperties}>
      <svg
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label={`Esquema da linha ${codigo}, de ${primeira.nome} a ${ultima.nome}`}
      >
        <polyline
          points={xy.map((c) => c.join(',')).join(' ')}
          className="esquema-traco"
          vectorEffect="non-scaling-stroke"
        />
        {[...vistas.values()].map(({ xy: c, ponta }) => (
          <circle
            key={c.join(',')}
            cx={c[0]}
            cy={c[1]}
            r={ponta ? 3.6 : 2.4}
            className={ponta ? 'esquema-ponta' : 'esquema-paragem'}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {rotulos.map((r, i) => (
          <text key={i} x={r.x} y={r.y} textAnchor={r.ancora} className="esquema-nome">
            {r.nome}
          </text>
        ))}
      </svg>
      <figcaption className="secundario">
        {/* NUMA FRASE, e por isso o «no mapa» é uma ligação em linha — a
            exceção do critério 2.5.8 —, e não um alvo solto. */}
        <span>
          As paragens pela ordem, ligadas a direito.
          {noMapa && (
            <>
              {' '}
              O traçado nas ruas vê-se <Link href={noMapa(primeira.id)}>no mapa</Link>.
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
