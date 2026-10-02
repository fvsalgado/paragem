/**
 * AS PLACAS DO MAPA: o quadrado com o pictograma de um modo, desenhado numa
 * tela e entregue ao MapLibre como imagem.
 *
 * Comboio, expresso e táxi eram três círculos cinzentos quase iguais
 * (P1-010). O que os separa agora é a FORMA: a estação é uma placa escura com
 * o comboio, a praça de táxi uma placa clara com o táxi, o expresso um anel.
 *
 * **Desenha-se aqui, e não se carrega de um ficheiro.** Uma imagem num
 * ficheiro é um pedido a mais, e um mapa que espera por ele para pôr as
 * estações. Os traços são os mesmos do `Icones.tsx` — o mesmo desenho na
 * fila dos filtros e no mapa —, e estão repetidos aqui porque a tela não lê
 * componentes de React: se um mudar, muda o outro.
 */

/** Os traços de cada pictograma, na grelha de 24 do `Icones.tsx`. */
const TRACOS: Record<string, { caminhos: string[]; pontos: [number, number, number][] }> = {
  comboio: {
    caminhos: [
      'M3 16V8.5A2.5 2.5 0 0 1 5.5 6H15c1.4 0 2.6.7 3.4 1.8L21 11.5V16z',
      'M3 11h18',
      'M8 6v5M13 6v5',
      'M2 20.5h20',
    ],
    pontos: [
      [7, 17.6, 1.3],
      [16.5, 17.6, 1.3],
    ],
  },
  taxi: {
    caminhos: ['M3 13h18v5H3z', 'M5 13l2-4h10l2 4', 'M9 6h6v3H9z'],
    pontos: [
      [7.5, 18.5, 1.4],
      [16.5, 18.5, 1.4],
    ],
  },
};

/** O lado da imagem, em píxeis da tela — o dobro do que se vê, para ecrãs densos. */
export const LADO = 44;
export const DENSIDADE = 2;

/**
 * A placa de um modo como `ImageData`, ou `null` sem tela (no servidor, ou num
 * navegador sem `canvas`) — e aí o mapa desenha o círculo de sempre.
 */
export function imagemDaPlaca(
  modo: string,
  fundo: string,
  cor: string,
): { width: number; height: number; data: Uint8ClampedArray } | null {
  if (typeof document === 'undefined') return null;
  const tela = document.createElement('canvas');
  tela.width = LADO;
  tela.height = LADO;
  const ctx = tela.getContext('2d');
  if (!ctx || typeof Path2D === 'undefined') return null;

  // A PLACA: um quadrado arredondado com contorno. Uma placa branca leva o
  // contorno da borda dos campos (3:1 sobre o fundo do mapa, WCAG 1.4.11);
  // uma placa de cor leva um contorno branco, que a separa do que está por
  // baixo.
  const claro = fundo.toLowerCase() === '#ffffff';
  const r = 9;
  const [a, b] = [3, LADO - 3];
  ctx.beginPath();
  ctx.moveTo(a + r, a);
  ctx.arcTo(b, a, b, b, r);
  ctx.arcTo(b, b, a, b, r);
  ctx.arcTo(a, b, a, a, r);
  ctx.arcTo(a, a, b, a, r);
  ctx.closePath();
  ctx.fillStyle = fundo;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = claro ? '#6f858f' : '#ffffff';
  ctx.stroke();

  // O PICTOGRAMA, a traço, na cor que contrasta com a placa.
  const t = TRACOS[modo];
  if (t) {
    const escala = 26 / 24;
    const desvio = (LADO - 26) / 2;
    ctx.save();
    ctx.translate(desvio, desvio);
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    for (const c of t.caminhos) ctx.stroke(new Path2D(c));
    for (const [x, y, raio] of t.pontos) {
      ctx.beginPath();
      ctx.arc(x, y, raio, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const imagem = ctx.getImageData(0, 0, LADO, LADO);
  return { width: LADO, height: LADO, data: imagem.data };
}
