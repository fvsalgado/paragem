import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { comContrasteSuficiente, textoSobre } from '@/componentes/Distintivo';
import { normalizar } from './cor';
import { texto } from './feixe';
import type { Regiao } from './formato';
import { assinaturaDaRegiao, marcaDaRegiao } from './marca';
import { AZUL_NOITE, PAPEL } from './marca-do-produto';
import { CARTAO, corpoDoTitulo, encurtar } from './partilha';

/**
 * O desenho dos cartões de partilha de uma região — o dela, o de cada paragem
 * e o de cada linha —, e só o desenho. Os endereços e as contas de texto
 * estão em `partilha.ts`; as rotas que servem isto são uma função cada.
 *
 * É o cabeçalho da região em ponto grande: o logótipo dela — o endereço em
 * feixe, nos tons dela (§6) — sobre o papel, e a régua de três linhas a fechar
 * o cartão. Por baixo do logótipo, o que a ligação é: o nome da paragem ou da
 * linha, os números das linhas como tabuletas, com a cor de cada uma. E no
 * fundo «Feito com Paragem.pt», a uma cor e pequeno, como no rodapé. O
 * vermelho do produto não entra: o feixe é o da região.
 *
 * Foi a faixa na cor da região com o nome da rede em texto, até o logótipo de
 * cada região passar a ser o endereço dela (3/10/2026).
 *
 * Numa região de demonstração, o cartão di-lo, como todas as páginas dela: um
 * cartão partilhado sai do sítio, e a faixa de aviso não vai com ele. Di-lo
 * com as palavras da faixa (`MarcaDeDemonstracao`): «inventada», e não as
 * cores de alerta nem «não existe», que se liam como uma avaria (P4-002).
 */

/** O fundo de uma tabuleta de linha sem cor declarada: `--linhas`, com o texto do sítio. */
const NEUTRO = '#d5ddd9';
const SECUNDARIO = '#4a5c66';
/** A largura que o desenho tem para ocupar, dentro das margens do cartão. */
const LARGURA_UTIL = CARTAO.largura - 160;

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

function Tabuletas({ linhas }: { linhas: Tabuleta[] }) {
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
              // Uma linha de cor clara não se distinguia do papel sem isto.
              border: `2px solid ${NEUTRO}`,
              background: fundo,
              color: original ? textoSobre(fundo) : AZUL_NOITE,
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
 * `assinatura: false` é para o cartão da própria região, em que o logótipo É
 * o título: vai em ponto grande, e por baixo dele o que a região é.
 */
export type Cartao = {
  titulo: string;
  linhas?: Tabuleta[];
  subtitulo?: string | null;
  assinatura?: boolean;
};

/**
 * O endereço da região em feixe, com as cores escritas — o desenhador de
 * imagens não lê CSS —, como imagem dentro do cartão. A altura encolhe se o
 * endereço for comprido demais para a largura do cartão.
 */
function logotipo(endereco: string, cores: readonly string[], alturaMaxima: number) {
  const { viewBox, proporcao, corpo } = texto(endereco, 'feixe', { cores, fundo: PAPEL });
  const altura = Math.min(alturaMaxima, LARGURA_UTIL / proporcao);
  const largura = altura * proporcao;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${largura.toFixed(1)}" height="${altura.toFixed(1)}">${corpo}</svg>`;
  return {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    largura: Math.round(largura),
    altura: Math.round(altura),
  };
}

export async function desenharCartao(
  r: Pick<Regiao, 'marca' | 'rede' | 'de' | 'demonstracao' | 'dominio'>,
  { titulo, linhas = [], subtitulo, assinatura = true }: Cartao,
): Promise<ImageResponse> {
  const fonts = await lerLetras();
  const { feixe } = marcaDaRegiao(r);
  const { principal, secundario, endereco } = assinaturaDaRegiao(r);
  const linha = secundario ?? principal;
  const tituloCurto = encurtar(titulo, 80);
  const marca = endereco ? logotipo(endereco.endereco, feixe.claro, assinatura ? 64 : 160) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 80px 0',
          background: PAPEL,
          color: AZUL_NOITE,
          fontFamily: fonts.length ? 'Atkinson Hyperlegible' : undefined,
        }}
      >
        {/* A assinatura da região, como no cabeçalho dela. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 32,
          }}
        >
          {assinatura ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
              {marca ? (
                <img src={marca.src} width={marca.largura} height={marca.altura} alt="" />
              ) : (
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, lineHeight: 1.15 }}>
                  {encurtar(principal, 40)}
                </div>
              )}
              <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.2, color: SECUNDARIO }}>
                {encurtar(marca ? linha : (secundario ?? ''), 56)}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          {r.demonstracao ? (
            <div
              style={{
                display: 'flex',
                flex: 'none',
                padding: '6px 18px',
                borderRadius: 999,
                border: `3px solid ${AZUL_NOITE}`,
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              Demonstração: região inventada
            </div>
          ) : null}
        </div>

        {!assinatura && marca ? (
          // O cartão da própria região: o logótipo é o título, e por baixo o
          // que ela é — a mesma linha que o cabeçalho escreve.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <img src={marca.src} width={marca.largura} height={marca.altura} alt="" />
            <div style={{ display: 'flex', fontSize: 40, lineHeight: 1.25, color: SECUNDARIO }}>
              {encurtar(subtitulo ?? titulo, 80)}
            </div>
          </div>
        ) : (
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
            {linhas.length > 0 ? <Tabuletas linhas={linhas} /> : null}
            {subtitulo ? (
              <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.3, color: SECUNDARIO }}>
                {encurtar(subtitulo, 110)}
              </div>
            ) : null}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          <div style={{ display: 'flex', fontSize: 24, color: SECUNDARIO }}>
            Feito com Paragem.pt
          </div>
          {/* A régua do feixe a fechar o cartão, de ponta a ponta. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 -80px' }}>
            {feixe.claro.map((c) => (
              <div key={c} style={{ display: 'flex', height: 7, background: c }} />
            ))}
          </div>
        </div>
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
