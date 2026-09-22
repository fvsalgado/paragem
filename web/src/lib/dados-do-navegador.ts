/**
 * Onde o NAVEGADOR vai buscar os dados que não vêm com a página: as partidas
 * de um concelho, os sítios, a grelha horária, os traçados, os mosaicos.
 *
 * Vinham de `public/dados/`, copiados na construção. Agora vêm do mesmo
 * armazém que o servidor lê (ver `dados.ts`), pela porta pública — e é o
 * navegador que lá vai, sem passar por nós: os mosaicos são dezenas de MB
 * lidos por intervalos de bytes, e uma função no meio só atrapalhava.
 *
 * O Next.js troca `process.env.NEXT_PUBLIC_*` por texto em tempo de
 * construção, e só quando o nome está escrito por extenso. Por isso o nome
 * está aqui, uma vez, e o resto do código pede a morada a esta função.
 *
 * Sem variável fica `/dados`, que nada serve: as páginas dizem que não há
 * dados em vez de falharem a meio, e é o que se quer numa construção sem
 * ambiente (um fork, um arranque a frio).
 */
const BASE = (process.env.NEXT_PUBLIC_PARAGEM_DADOS ?? '').replace(/\/+$/, '') || '/dados';

export function enderecoDosDados(regiao: string, caminho: string): string {
  return `${BASE}/${regiao}/${caminho.replace(/^\//, '')}`;
}

/**
 * A montra do produto — para onde leva a marca no cabeçalho e o «Outras
 * regiões» do menu, a partir de qualquer região. Cada região vive no seu
 * domínio, por isso é uma origem e não um caminho: `/` numa região é a região.
 * Sem variável, é `/`, que é o que há.
 */
export const ORIGEM_DO_PRODUTO =
  (process.env.NEXT_PUBLIC_PARAGEM_PRODUTO ?? '').replace(/\/+$/, '') || '/';
