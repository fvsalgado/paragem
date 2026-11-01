import type { CSSProperties } from 'react';

/**
 * O ESQUEMA DE UMA LINHA: as paragens pela ordem, onde ficam, ligadas a
 * direito — um mapa pequeno no alto da página da linha, desenhado no servidor.
 *
 * A página dizia por onde a linha passa numa lista de nomes, e quem não
 * conhece a terra não sabia se ela ia para norte ou para sul, nem se a
 * paragem dele ficava a meio ou na ponta. Isto responde a isso de relance.
 *
 * NÃO É O TRAÇADO NAS RUAS, e diz-se na legenda: o traçado vive na grelha do
 * planeador, que é pesada de mais para uma página de catálogo — e ligar as
 * paragens a direito é o que um esquema de rede faz. Sem MapLibre, sem
 * mosaicos e sem JavaScript: um SVG de uns centos de bytes, que se lê com a
 * página em baixo de rede e se imprime.
 */
export default function EsquemaDaLinha({
  sentidos,
  onde,
  cor,
  codigo,
  comMapa = false,
}: {
  /** As paragens de cada sentido, pela ordem. */
  sentidos: { id: string; nome: string }[][];
  /** Onde fica cada paragem, `[lat, lon]`. As que não têm sítio ficam de fora. */
  onde: ReadonlyMap<string, [number, number]>;
  /** A cor do traço (já com o contraste de um traço, `traco`). */
  cor: string;
  codigo: string;
  /** Se a região tem mapa — só aí a legenda pode mandar para lá. */
  comMapa?: boolean;
}) {
  const sequencias = sentidos
    .map((s) => s.map((p) => onde.get(p.id)).filter((c): c is [number, number] => !!c))
    .filter((s) => s.length > 1);
  if (!sequencias.length) return null;

  // UMA PROJEÇÃO SIMPLES, e chega: a escala de uma linha são dezenas de km, e
  // a longitude encolhe com o cosseno da latitude.
  const todas = sequencias.flat();
  const lat0 = todas.reduce((s, c) => s + c[0], 0) / todas.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = todas.map((c) => c[1] * k);
  const ys = todas.map((c) => -c[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A CAIXA SEGUE A LINHA, entre uma faixa (3:1) e um quadrado: uma linha
  // leste-oeste fica baixa, e uma norte-sul não fica um risco num retângulo
  // vazio.
  const L = 300;
  const margem = 14;
  const A = Math.round(
    Math.min(
      L,
      Math.max(L / 3, ((y1 - y0) / Math.max(x1 - x0, 1e-6)) * (L - 2 * margem) + 2 * margem),
    ),
  );
  const escala = Math.min(
    (L - 2 * margem) / Math.max(x1 - x0, 1e-6),
    (A - 2 * margem) / Math.max(y1 - y0, 1e-6),
  );
  const dx = (L - (x1 - x0) * escala) / 2;
  const dy = (A - (y1 - y0) * escala) / 2;
  const ponto = (c: [number, number]) =>
    [dx + (c[1] * k - x0) * escala, dy + (-c[0] - y0) * escala].map((v) => Math.round(v * 10) / 10);

  // As paragens desenham-se uma vez, mesmo que os dois sentidos passem nelas.
  const vistas = new Map<string, { xy: number[]; ponta: boolean }>();
  for (const s of sequencias) {
    s.forEach((c, i) => {
      const xy = ponto(c);
      const chave = xy.join(',');
      const ponta = i === 0 || i === s.length - 1;
      const antes = vistas.get(chave);
      vistas.set(chave, { xy, ponta: ponta || !!antes?.ponta });
    });
  }

  const sentido = sentidos.find((s) => s.length) ?? [];
  const primeira = sentido[0]?.nome;
  const ultima = sentido.at(-1)?.nome;
  // OS NOMES DAS DUAS PONTAS, junto delas: um traço sem nomes não diz para
  // onde vai. Do lado de dentro do desenho, para não sair da caixa.
  const nomeDa = (p: { id: string; nome: string } | undefined) => {
    const c = p && onde.get(p.id);
    if (!c) return null;
    const [x, y] = ponto(c);
    const aDireita = x < L / 2;
    return {
      nome: p.nome,
      x: aDireita ? x + 7 : x - 7,
      y: y < 16 ? y + 12 : y - 6,
      ancora: aDireita ? 'start' : 'end',
    } as const;
  };
  const pontas = [nomeDa(sentido[0]), nomeDa(sentido.at(-1))].filter(
    (n): n is NonNullable<ReturnType<typeof nomeDa>> => !!n,
  );
  return (
    <figure className="esquema-da-linha" style={{ '--cor-do-esquema': cor } as CSSProperties}>
      <svg
        viewBox={`0 0 ${L} ${A}`}
        role="img"
        aria-label={`Esquema da linha ${codigo}${primeira && ultima ? `, de ${primeira} a ${ultima}` : ''}`}
      >
        {sequencias.map((s, i) => (
          <polyline
            key={i}
            points={s.map((c) => ponto(c).join(',')).join(' ')}
            className="esquema-traco"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {[...vistas.values()].map(({ xy, ponta }) => (
          <circle
            key={xy.join(',')}
            cx={xy[0]}
            cy={xy[1]}
            r={ponta ? 3.6 : 2.4}
            className={ponta ? 'esquema-ponta' : 'esquema-paragem'}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {pontas.map((n) => (
          <text key={n.nome} x={n.x} y={n.y} textAnchor={n.ancora} className="esquema-nome">
            {n.nome}
          </text>
        ))}
      </svg>
      <figcaption className="secundario">
        As paragens pela ordem, ligadas a direito
        {comMapa ? ' — o traçado nas ruas está no mapa.' : '.'}
      </figcaption>
    </figure>
  );
}
