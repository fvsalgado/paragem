import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { comContrasteSuficiente, normalizar, textoSobre } from '@/componentes/Distintivo';
import type { Faixa } from './faixa';
import { LETRAS_ALTURA, LETRAS_ARAGEM, LETRAS_LARGURA, LETRAS_P, LETRAS_PT } from './marca-letras';
import { CARTAO } from './partilha';

/**
 * O desenho dos cartões de partilha — o da montra, o de cada região e o de
 * cada paragem —, e só o desenho. Os endereços e os metadados estão em
 * `partilha.ts`; as rotas que servem isto são três ficheiros de uma função.
 *
 * É o logótipo na faixa, por cima do que a ligação é: o mesmo que o cabeçalho
 * diz, na cor da região, na proporção que as redes recortam. Numa paragem, os números das
 * linhas vão como tabuletas, com a cor de cada uma — é o que quem recebe a
 * ligação reconhece primeiro. Numa região de demonstração, o cartão di-lo,
 * como todas as páginas dela: um cartão partilhado sai do sítio, e a faixa de
 * aviso não vai com ele.
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

/** Corta um texto na última palavra que cabe, com reticências. */
export function encurtar(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > limite * 0.6 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * O corpo do título encolhe com o comprimento — em degraus, e não num
 * cálculo contínuo: um título curto enche o cartão e um longo continua a
 * caber, e a diferença entre 64 e 66 pixéis ninguém a vê.
 */
export function corpoDoTitulo(titulo: string): number {
  if (titulo.length <= 18) return 88;
  if (titulo.length <= 32) return 72;
  if (titulo.length <= 56) return 58;
  return 48;
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

/** Tudo o que um cartão pode dizer. Só o título é obrigatório. */
export type Cartao = {
  faixa: Faixa;
  titulo: string;
  linhas?: Tabuleta[];
  subtitulo?: string;
  demonstracao?: boolean;
};

/** A altura do logótipo no cartão, em pixéis. */
const ALTURA_DO_LOGOTIPO = 62;

export async function desenharCartao({
  faixa,
  titulo,
  linhas = [],
  subtitulo,
  demonstracao = false,
}: Cartao): Promise<ImageResponse> {
  const fonts = await lerLetras();
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
          padding: '60px 80px 64px',
          background: faixa.fundo,
          color: faixa.tinta,
          fontFamily: fonts.length ? 'Atkinson Hyperlegible' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* O logótipo, com os contornos do cabeçalho (`lib/marca-letras.ts`). */}
          <svg
            width={Math.round((ALTURA_DO_LOGOTIPO * LETRAS_LARGURA) / LETRAS_ALTURA)}
            height={ALTURA_DO_LOGOTIPO}
            viewBox={`0 0 ${LETRAS_LARGURA} ${LETRAS_ALTURA}`}
            fill={faixa.tinta}
          >
            <path fillRule="evenodd" d={LETRAS_P} />
            <path d={LETRAS_ARAGEM} />
            <path d={LETRAS_PT} />
          </svg>
          {demonstracao ? (
            <div
              style={{
                display: 'flex',
                padding: '6px 18px',
                borderRadius: 999,
                background: '#fbe9e6',
                color: '#a3261b',
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              Demonstração: esta região não existe
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
          {linhas.length > 0 ? <Tabuletas linhas={linhas} tinta={faixa.tinta} /> : null}
          {subtitulo ? (
            <div style={{ display: 'flex', fontSize: 32, lineHeight: 1.3 }}>
              {encurtar(subtitulo, 110)}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: CARTAO.largura,
      height: CARTAO.altura,
      ...(fonts.length ? { fonts } : {}),
      headers: {
        // Um cartão muda quando os dados mudam, e isso é raro. O dia de cache
        // é o que impede as redes de o voltarem a desenhar a cada partilha.
        'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
