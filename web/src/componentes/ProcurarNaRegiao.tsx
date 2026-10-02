'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EscolherPonto from '@/componentes/EscolherPonto';
import type { Ponto } from '@/lib/formato';
import { usePontos } from '@/lib/pontos-do-navegador';
import { comoProcura, escreverViagem } from '@/lib/endereco-da-viagem';

/** O endereço tem de ser um caminho do sítio: os identificadores trazem vírgulas e pontos. */
const seguro = (s: string) => s.replace(/[^a-zA-Z0-9\-_]/g, '-');

/**
 * Para onde leva um ponto escolhido, numa região sem mapa onde o mostrar.
 *
 * No mapa, escolher um ponto abre o cartão dele; aqui não há mapa, e o cartão
 * é a página: a paragem e a estação têm ficha, os outros modos têm a página
 * do modo, e um sítio — uma rua, uma aldeia — não é parada de nada: é para
 * onde se quer ir, e leva às direções com ele no destino.
 */
function destinoDe(p: Ponto): string {
  if (p.tipo === 'paragem') return `/rede/paragens/${seguro(p.id)}/`;
  if (p.tipo === 'estacao') return `/rede/estacoes/${seguro(p.id)}/`;
  // PELAS COORDENADAS, com o nome para mostrar: um sítio não está no índice
  // das paragens, e o endereço com o nome dele abria as direções com o
  // destino em branco (`lib/endereco-da-viagem.ts`).
  if (p.tipo === 'sitio') return `/viagem/${comoProcura(escreverViagem({ de: null, para: p }))}`;
  return `/modos/${seguro(p.tipo)}/`;
}

/**
 * A procura do início, numa região que ainda não tem mapa.
 *
 * É a mesma caixa que flutua por cima do mapa — o mesmo combobox, com as
 * mesmas paragens e os mesmos sítios —, e responde à mesma pergunta: «onde
 * está, e o que passa lá?». Sem mapa, a resposta é a página do ponto.
 *
 * Os pontos pedem-se À PRIMEIRA TECLA (P3-006): quem abre «A rede» para ler
 * as listas não paga o ficheiro de quem procura.
 */
export default function ProcurarNaRegiao({
  regiao,
  modosDesligados = [],
}: {
  regiao: string;
  modosDesligados?: string[];
}) {
  const router = useRouter();
  const [pedir, setPedir] = useState(false);
  const { pontos, tentar } = usePontos(regiao, modosDesligados, pedir);
  return (
    <EscolherPonto
      etiqueta="Procurar"
      sugestao="Procurar paragem ou sítio"
      pontos={pontos}
      aoPrecisarDosPontos={() => setPedir(true)}
      aoTentarDeNovo={tentar}
      valor={null}
      regiao={regiao}
      linhas
      aoEscolher={(p) => p && router.push(destinoDe(p))}
    />
  );
}
