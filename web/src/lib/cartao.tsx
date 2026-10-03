import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { comContrasteSuficiente, textoSobre } from '@/componentes/Distintivo';
import { normalizar } from './cor';
import type { Regiao } from './formato';
import { marcaDaRegiao, nomesDaAssinatura } from './marca';
import { CARTAO, corpoDoTitulo, encurtar } from './partilha';

/**
 * O desenho dos cartões de partilha de uma região — o dela, o de cada paragem
 * e o de cada linha —, e só o desenho. Os endereços e as contas de texto
 * estão em `partilha.ts`; as rotas que servem isto são uma função cada.
 *
 * É o cabeçalho da região em ponto grande: a faixa na cor dela, com a tinta
 * medida por cima (`marca.ts`), e a assinatura da rede no cimo. Por baixo, o
 * que a ligação é — o nome da paragem ou da linha, os números das linhas como
 * tabuletas, com a cor de cada uma —, e no fundo «Feito com Paragem.pt», a uma
 * cor e pequeno, como no rodapé (§6). O vermelho do produto não entra.
 *
 * Numa região de demonstração, o cartão di-lo, como todas as páginas dela: um
 * cartão partilhado sai do sítio, e a faixa de aviso não vai com ele. Di-lo
 * na tinta da faixa e com as palavras da faixa (`MarcaDeDemonstracao`):
 * «inventada», e não as cores de alerta nem «não existe», que se liam como
 * uma avaria (P4-002).
 */

/** O fundo de uma tabuleta de linha sem cor declarada: `--linhas`, com o texto do sítio. */
const NEUTRO = '#d5ddd9';

/**
 * A letra do sítio, lida do disco uma vez por instância.
 *
 * É a Atkinson Hyperlegible (SIL OFL 1.1, ver `src/fontes/OFL.txt`), a mesma
 * do §6, e vem no repositório porque o desenhador de imagens precisa do
 * ficheiro e não de uma folha de estilos — ir buscá-la a um servidor de
 * letras a cada cartão era mais um terceiro de quem isto passava a depender.
 * O `next.config` põe-na ao lado das rotas dos cartões.
 *
 * Sem ela, desenha-se com a letra de reserva do Next em vez de falhar: um
 * cartão com outra letra ainda leva a ligação a quem a recebe; um 500 não.
 */
type Letra = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' };
let letras: Promise<Letra[]> | null = null;

function lerLetras(): Promise<Letra[]> {
  letras ??= Promise.all(
    (
      [
        ['AtkinsonHyperlegible-Regular.ttf', 400],
        ['AtkinsonHyperlegible-Bold.ttf', 700],
      ] as const
    ).map(async ([ficheiro, peso]) => ({
      name: 'Atkinson Hyperlegible',
      data: await readFile(join(process.cwd(), 'src', 'fontes', ficheiro)),
      weight: peso,
      style: 'normal' as const,
    })),
  ).catch((erro) => {
    // Não se guarda a falha: a instância seguinte volta a tentar.
    letras = null;
    console.error('cartão de partilha sem a letra do sítio:', erro);
    return [];
  });
  return letras;
}

/** A tabuleta de uma linha: o número, na cor dela, com contraste garantido. */
export type Tabuleta = { codigo: string; cor: string | null };

/** Quantas tabuletas cabem numa fila antes de se resumir o resto num «+N». */
const MAXIMO_DE_TABULETAS = 8;

function Tabuletas({ linhas, tinta }: { linhas: Tabuleta[]; tinta: string }) {
  const visiveis = linhas.slice(0, MAXIMO_DE_TABULETAS);
  const resto = linhas.length - visiveis.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
      {visiveis.map(({ codigo, cor }) => {
        const original = normalizar(cor);
        const fundo = original ? comContrasteSuficiente(original) : NEUTRO;
        return (
          <div
            key={codigo}
            style={{
              display: 'flex',
              justifyContent: 'center',
              minWidth: 92,
              padding: '4px 18px',
              borderRadius: 5,
              // A borda da cor da tinta separa a tabuleta da faixa quando a
              // linha tem a cor da faixa — o que não é raro.
              border: `3px solid ${tinta}`,
              background: fundo,
              color: original ? textoSobre(fundo) : '#102c3f',
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {codigo}
          </div>
        );
      })}
      {resto > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 36 }}>+{resto}</div>
      ) : null}
    </div>
  );
}

/**
 * Tudo o que um cartão diz além da região. Só o título é obrigatório.
 *
 * `assinatura: false` é para o cartão da própria região, em que o título JÁ É
 * a assinatura: com ela no cimo, o nome da rede saía duas vezes.
 */
export type Cartao = {
  titulo: string;
  linhas?: Tabuleta[];
  subtitulo?: string | null;
  assinatura?: boolean;
};

export async function desenharCartao(
  r: Pick<Regiao, 'marca' | 'rede' | 'de' | 'demonstracao'>,
  { titulo, linhas = [], subtitulo, assinatura = true }: Cartao,
): Promise<ImageResponse> {
  const fonts = await lerLetras();
  const { cor, tinta } = marcaDaRegiao(r);
  const { principal, secundario } = nomesDaAssinatura(r);
  const tituloCurto = encurtar(titulo, 80);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 80px 52px',
          background: cor,
          color: tinta,
          fontFamily: fonts.length ? 'Atkinson Hyperlegible' : undefined,
        }}
      >
        {/* A assinatura da rede, como no cabeçalho da região. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 32,
          }}
        >
          {assinatura ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 760 }}>
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>
                {encurtar(principal, 40)}
              </div>
              {secundario ? (
                <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.2 }}>
                  {encurtar(secundario, 56)}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          {r.demonstracao ? (
            <div
              style={{
                display: 'flex',
                padding: '6px 18px',
                borderRadius: 999,
                border: `3px solid ${tinta}`,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              Demonstração: região inventada
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div
            style={{
              display: 'flex',
              fontSize: corpoDoTitulo(tituloCurto),
              fontWeight: 700,
              lineHeight: 1.1,
            }}
          >
            {tituloCurto}
          </div>
          {linhas.length > 0 ? <Tabuletas linhas={linhas} tinta={tinta} /> : null}
          {subtitulo ? (
            <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.3 }}>
              {encurtar(subtitulo, 110)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', fontSize: 24 }}>Feito com Paragem.pt</div>
      </div>
    ),
    {
      width: CARTAO.largura,
      height: CARTAO.altura,
      ...(fonts.length ? { fonts } : {}),
      headers: {
        // O `ImageResponse` manda por omissão `immutable` por um ano — certo
        // para uma imagem que nunca muda, e errado para esta, que muda com os
        // dados. Uma hora na cache partilhada, como as páginas (`revalidate`
        // das rotas), e a cópia antiga serve enquanto a nova se desenha.
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=604800',
      },
    },
  );
}
