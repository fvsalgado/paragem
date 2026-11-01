'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * As três alturas de uma folha que sobe do fundo do mapa, no telemóvel.
 *
 * - `baixa`: só a cabeça da folha — o mapa quase todo à vista;
 * - `media`: a de abertura, que deixa mais de metade do mapa;
 * - `alta`: a folha quase inteira, para ler sem deslizar.
 *
 * QUANTO É CADA UMA ESTÁ NO CSS, e só lá (`--folha-baixa`, `--folha-media`,
 * `--folha-alta`, em `global.css`): a folha vem do servidor já à altura média,
 * sem esperar por este código, e uma medida escrita em dois sítios divergia no
 * primeiro ajuste. Aqui só se lê o que o CSS diz, para saber para onde assentar
 * um arrasto.
 */
export type Altura = 'baixa' | 'media' | 'alta';
const ORDEM: Altura[] = ['baixa', 'media', 'alta'];

/** Mais do que isto, em px por milissegundo, é um gesto rápido: vai para a seguinte. */
const PIPAROTE = 0.45;
/** Menos do que isto não é um arrasto: é um toque, e o toque muda de altura. */
const TOLERANCIA = 6;

/** Quanto é cada altura, nesta folha e neste ecrã, em píxeis. */
function alturasDe(folha: HTMLElement): Record<Altura, number> {
  // Uma sonda no mesmo bloco que a folha, com a mesma medida: as percentagens
  // do CSS são da caixa do mapa, e é lá que se resolvem.
  const caixa = (folha.offsetParent as HTMLElement | null) ?? folha.parentElement ?? document.body;
  const estilo = getComputedStyle(folha);
  const sonda = document.createElement('div');
  sonda.setAttribute('aria-hidden', 'true');
  sonda.style.cssText =
    'position:absolute;left:0;top:0;width:0;visibility:hidden;pointer-events:none;';
  caixa.appendChild(sonda);
  const r = { baixa: 0, media: 0, alta: 0 };
  for (const a of ORDEM) {
    sonda.style.height = estilo.getPropertyValue(`--folha-${a}`).trim() || '0px';
    r[a] = sonda.getBoundingClientRect().height;
  }
  sonda.remove();
  // UMA FOLHA NÃO CRESCE MAIS DO QUE O QUE TEM. Um cartão de uma praça de
  // táxi acaba muito antes da altura alta, e um arrasto até lá assentava na
  // média por estar «mais perto» dela — com a folha já toda à vista.
  const inteira = folha.scrollHeight + (folha.offsetHeight - folha.clientHeight);
  for (const a of ORDEM) r[a] = Math.min(r[a], inteira);
  return r;
}

/**
 * A folha está a mexer-se: o `AppDoMapa` não refaz as margens do mapa a cada
 * imagem — o mapa não salta por baixo do dedo —, e mede uma vez quando ela
 * assentar.
 */
function assentar(folha: HTMLElement) {
  folha.dataset.aAssentar = '';
  let feito = false;
  const fim = () => {
    if (feito) return;
    feito = true;
    folha.removeEventListener('transitionend', aoAcabar);
    delete folha.dataset.aAssentar;
  };
  const aoAcabar = (e: TransitionEvent) => {
    if (e.target === folha && e.propertyName === 'max-height') fim();
  };
  folha.addEventListener('transitionend', aoAcabar);
  // Sem transição (menos movimento, ou a altura não mudou) não há fim a
  // esperar: o relógio garante que a marca sai.
  window.setTimeout(fim, 400);
}

/**
 * A PEGA DA FOLHA: arrasta-se, como no Maps, e é um botão.
 *
 * O arrasto é para o dedo; o toque, as setas e o Enter são para tudo o resto
 * — teclado, comando de voz, leitor de ecrã, quem não consegue arrastar. O
 * WCAG 2.5.1 pede que nada dependa de um gesto de caminho, e um botão que
 * também se arrasta cumpre isso sem uma segunda peça no ecrã.
 *
 * O toque sobe um degrau, e do alto volta ao fundo; as setas sobem e descem.
 * O nome diz o que o toque faz, e não o estado — é a pergunta de quem vai
 * carregar.
 */
export default function PegaDaFolha({
  altura,
  aoMudar,
  rotulos = {},
}: {
  altura: Altura;
  aoMudar: (a: Altura) => void;
  /** O nome do botão em cada altura, quando o de omissão não diz o que a folha tem. */
  rotulos?: Partial<Record<Altura, string>>;
}) {
  const arrasto = useRef<{
    folha: HTMLElement;
    y0: number;
    h0: number;
    alturas: Record<Altura, number>;
    amostras: { y: number; t: number }[];
    mexeu: boolean;
  } | null>(null);
  /** O clique que o navegador manda depois de um arrasto não é um toque. */
  const engolirClique = useRef(false);

  const folhaDe = (e: { currentTarget: HTMLElement }) =>
    e.currentTarget.closest<HTMLElement>('[data-altura]');

  /** As alturas que se distinguem neste ecrã — numa janela larga, a média e a alta são a mesma. */
  function degraus(alturas: Record<Altura, number>): Altura[] {
    return ORDEM.filter((a, i) => i === 0 || Math.abs(alturas[a] - alturas[ORDEM[i - 1]]) > 8);
  }

  function ir(folha: HTMLElement, a: Altura) {
    if (a === altura) return;
    assentar(folha);
    aoMudar(a);
  }

  function aoBaixar(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    const folha = folhaDe(e);
    if (!folha) return;
    arrasto.current = {
      folha,
      y0: e.clientY,
      h0: folha.getBoundingClientRect().height,
      alturas: alturasDe(folha),
      amostras: [{ y: e.clientY, t: e.timeStamp }],
      mexeu: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function aoMover(e: PointerEvent<HTMLButtonElement>) {
    const a = arrasto.current;
    if (!a) return;
    const subiu = a.y0 - e.clientY;
    if (!a.mexeu && Math.abs(subiu) < TOLERANCIA) return;
    if (!a.mexeu) {
      a.mexeu = true;
      a.folha.dataset.aArrastar = '';
    }
    // Nem abaixo da baixa, nem acima da alta: a folha não sai do ecrã nem
    // tapa a procura.
    const h = Math.min(a.alturas.alta, Math.max(a.alturas.baixa * 0.85, a.h0 + subiu));
    a.folha.style.maxHeight = `${Math.round(h)}px`;
    a.amostras.push({ y: e.clientY, t: e.timeStamp });
    if (a.amostras.length > 5) a.amostras.shift();
  }

  function aoLargar(e: PointerEvent<HTMLButtonElement>) {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a || !a.mexeu) return;
    engolirClique.current = true;
    const agora = a.folha.getBoundingClientRect().height;
    const primeira = a.amostras[0];
    const dt = Math.max(1, e.timeStamp - primeira.t);
    const velocidade = (primeira.y - e.clientY) / dt; // > 0 a subir
    const lista = degraus(a.alturas);
    // Onde está, entre os degraus: o mais perto, ou o seguinte no sentido do
    // gesto quando ele foi rápido — é assim que se atira uma folha.
    let destino = lista.reduce((m, d) =>
      Math.abs(a.alturas[d] - agora) < Math.abs(a.alturas[m] - agora) ? d : m,
    );
    if (velocidade > PIPAROTE) {
      destino = lista.find((d) => a.alturas[d] > agora + 4) ?? lista[lista.length - 1];
    } else if (velocidade < -PIPAROTE) {
      destino = [...lista].reverse().find((d) => a.alturas[d] < agora - 4) ?? lista[0];
    }
    assentar(a.folha);
    delete a.folha.dataset.aArrastar;
    a.folha.style.maxHeight = '';
    aoMudar(destino);
  }

  function aoCancelar() {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a) return;
    delete a.folha.dataset.aArrastar;
    a.folha.style.maxHeight = '';
  }

  function aoTocar(e: React.MouseEvent<HTMLButtonElement>) {
    if (engolirClique.current) {
      engolirClique.current = false;
      return;
    }
    const folha = folhaDe(e);
    if (!folha) return;
    const lista = degraus(alturasDe(folha));
    const i = lista.indexOf(altura);
    ir(folha, lista[(i + 1) % lista.length] ?? 'media');
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const folha = folhaDe(e);
    if (!folha) return;
    const lista = degraus(alturasDe(folha));
    const i = Math.max(0, lista.indexOf(altura));
    const j = e.key === 'ArrowUp' ? Math.min(lista.length - 1, i + 1) : Math.max(0, i - 1);
    ir(folha, lista[j]);
  }

  const nome =
    rotulos[altura] ??
    (altura === 'baixa'
      ? 'Mostrar mais'
      : altura === 'media'
        ? 'Mostrar a folha inteira'
        : 'Baixar a folha e ver o mapa');

  return (
    <button
      type="button"
      className="pega-da-folha"
      aria-label={nome}
      onPointerDown={aoBaixar}
      onPointerMove={aoMover}
      onPointerUp={aoLargar}
      onPointerCancel={aoCancelar}
      onClick={aoTocar}
      onKeyDown={aoTeclar}
    />
  );
}
