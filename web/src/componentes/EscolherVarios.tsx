'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Distintivo from '@/componentes/Distintivo';
import { simples } from '@/lib/letras';

export type OpcaoDeEscolha = {
  valor: string;
  rotulo: string;
  /** O que distingue dois iguais: o concelho de uma paragem, o percurso de uma linha. */
  detalhe?: string;
  /** O número de uma linha, com a cor dela — o que o público reconhece. */
  distintivo?: { codigo: string; cor: string | null; modo?: string };
};

/** Quantas sugestões de cada vez: mais do que isto não se lê, procura-se. */
const MAXIMO = 8;

/**
 * Quão bem uma opção responde ao que se escreveu: o número exato de uma linha
 * primeiro («1» é a linha 1, e não a 10, a 11 e a 1001), depois o começo do
 * número, depois o começo do nome, depois uma palavra do nome, depois
 * qualquer sítio. `null` quando não responde.
 */
function pontos(o: OpcaoDeEscolha, termo: string): number | null {
  const codigo = o.distintivo ? simples(o.distintivo.codigo) : '';
  const rotulo = simples(o.rotulo);
  if (codigo && codigo === termo) return 0;
  if (codigo && codigo.startsWith(termo)) return 1;
  if (rotulo.startsWith(termo)) return 2;
  if (rotulo.split(/[\s(–—-]+/).some((p) => p.startsWith(termo))) return 3;
  if (`${rotulo} ${simples(o.detalhe ?? '')}`.includes(termo)) return 4;
  return null;
}

/**
 * Escolher várias coisas de uma lista grande, a escrever (P4-017).
 *
 * É o que o campo das linhas de um aviso pedia: escolher «a linha 1» pelo
 * número ou pelo nome, e não escrever «RA1». E o das paragens, numa região com
 * duas mil, onde uma lista para percorrer não serve a ninguém.
 *
 * Segue o padrão de combobox das práticas de ARIA, como a procura do sítio
 * (`EscolherPonto`): o foco fica no campo, as setas percorrem a lista,
 * Enter escolhe, Escape fecha, e uma região viva diz quantas há. As escolhidas
 * ficam por cima, cada uma com o seu «Tirar» — um botão a sério, com nome.
 *
 * SEM JAVASCRIPT, o campo continua a ser um campo: o que se escrever vai com o
 * formulário (`nomeDoTexto`), e o servidor resolve números e nomes. Com ele, o
 * campo deixa de ir — o que lá ficar a meio de uma procura não é uma escolha.
 */
export default function EscolherVarios({
  id,
  etiqueta,
  nome,
  nomeDoTexto,
  opcoes,
  escolhidos,
  aoMudar,
  sugestao,
  descritoPor,
  invalido = false,
  rotuloDoTirar,
  um = false,
}: {
  id: string;
  etiqueta: string;
  /** O nome dos campos escondidos, um por escolha: é o que o formulário manda. */
  nome: string;
  nomeDoTexto: string;
  opcoes: OpcaoDeEscolha[];
  escolhidos: string[];
  aoMudar: (escolhidos: string[]) => void;
  sugestao?: string;
  descritoPor?: string;
  invalido?: boolean;
  rotuloDoTirar: (o: OpcaoDeEscolha) => string;
  /** Escolher UMA: a escolha nova substitui a anterior (a paragem de uma caixa). */
  um?: boolean;
}) {
  const base = useId();
  const idDaLista = `${base}-lista`;
  const [termo, setTermo] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);

  const porValor = useMemo(() => new Map(opcoes.map((o) => [o.valor, o])), [opcoes]);
  // UMA ESCOLHA QUE O CATÁLOGO JÁ NÃO TEM continua a aparecer, com o nome que
  // tem: um aviso antigo pode apontar para uma paragem que mudou, e apagá-la
  // em silêncio ao gravar era mudar o aviso sem ninguém pedir.
  const escolhidas = escolhidos.map((v) => porValor.get(v) ?? { valor: v, rotulo: v });

  const resultados = useMemo(() => {
    const t = simples(termo);
    if (!t) return [];
    const ja = new Set(escolhidos);
    return opcoes
      .map((o, i) => ({ o, i, p: ja.has(o.valor) ? null : pontos(o, t) }))
      .filter((x): x is { o: OpcaoDeEscolha; i: number; p: number } => x.p !== null)
      .sort((a, b) => a.p - b.p || a.i - b.i)
      .slice(0, MAXIMO)
      .map((x) => x.o);
  }, [termo, opcoes, escolhidos]);

  const mostrar = aberta && resultados.length > 0;

  function escolher(o: OpcaoDeEscolha) {
    aoMudar(um ? [o.valor] : [...escolhidos, o.valor]);
    setTermo('');
    setAberta(false);
    setAtivo(0);
  }

  function tirar(valor: string) {
    aoMudar(escolhidos.filter((v) => v !== valor));
    document.getElementById(id)?.focus();
  }

  function tecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberta(true);
      setAtivo((a) => Math.min(a + 1, Math.max(0, resultados.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      // ENTER ESCOLHE, E NÃO ENVIA O FORMULÁRIO: quem escreve «1» e carrega
      // em Enter quer a linha 1, e não publicar um aviso a meio.
      if (mostrar) {
        e.preventDefault();
        const o = resultados[ativo];
        if (o) escolher(o);
      } else if (termo) {
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      if (aberta) {
        e.preventDefault();
        setAberta(false);
      }
    } else if (e.key === 'Backspace' && !termo && escolhidos.length > 0) {
      aoMudar(escolhidos.slice(0, -1));
    }
  }

  const anuncio =
    !aberta || !simples(termo)
      ? ''
      : resultados.length === 0
        ? 'Nenhum resultado.'
        : resultados.length === 1
          ? '1 resultado. Setas para percorrer, Enter para escolher.'
          : `${resultados.length} resultados. Setas para percorrer, Enter para escolher.`;

  return (
    <div className="escolher-varios">
      <label htmlFor={id}>{etiqueta}</label>
      <div className={`campo-de-escolhas${invalido ? ' invalido' : ''}`}>
        {escolhidas.length > 0 && (
          <ul className="escolhas" aria-label={`${etiqueta}: escolhidas`}>
            {escolhidas.map((o) => (
              <li key={o.valor}>
                {o.distintivo && (
                  <Distintivo
                    codigo={o.distintivo.codigo}
                    cor={o.distintivo.cor}
                    modo={o.distintivo.modo}
                  />
                )}
                <span className="rotulo-da-escolha">{o.rotulo}</span>
                <button type="button" aria-label={rotuloDoTirar(o)} onClick={() => tirar(o.valor)}>
                  <span aria-hidden="true">×</span>
                </button>
                <input type="hidden" name={nome} value={o.valor} />
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          type="text"
          name={hidratado ? undefined : nomeDoTexto}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrar}
          aria-controls={idDaLista}
          aria-activedescendant={mostrar ? `${base}-opcao-${ativo}` : undefined}
          aria-describedby={descritoPor}
          aria-invalid={invalido || undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={sugestao}
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberta(true);
            setAtivo(0);
          }}
          onFocus={() => termo && setAberta(true)}
          onBlur={() => setAberta(false)}
          onKeyDown={tecla}
        />
      </div>
      <ul
        id={idDaLista}
        role="listbox"
        aria-label={etiqueta}
        className="opcoes-de-escolha"
        hidden={!mostrar}
      >
        {resultados.map((o, i) => (
          <li
            key={o.valor}
            id={`${base}-opcao-${i}`}
            role="option"
            aria-selected={i === ativo}
            // O RATO ESCOLHE SEM TIRAR O FOCO DO CAMPO: sem isto, o campo
            // perdia-o ao premir, a lista fechava, e o clique caía no vazio.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => escolher(o)}
          >
            {o.distintivo && (
              <Distintivo
                codigo={o.distintivo.codigo}
                cor={o.distintivo.cor}
                modo={o.distintivo.modo}
              />
            )}
            <span className="rotulo-da-opcao">{o.rotulo}</span>
            {o.detalhe && <span className="secundario">{o.detalhe}</span>}
          </li>
        ))}
      </ul>
      <p className="so-para-leitores" role="status" aria-live="polite">
        {anuncio}
      </p>
    </div>
  );
}
