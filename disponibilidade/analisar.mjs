/**
 * O analisador do painel de estações de um sistema de bicicletas.
 *
 * Muitos sistemas municipais não publicam GBFS, mas publicam uma página com o
 * estado de cada estação — bicicletas e docas — escrito no HTML pelo servidor.
 * Esta função transforma essa página em dados: uma lista de estações, cada uma
 * com quantas bicicletas e quantas docas tinha no momento em que a página foi
 * lida.
 *
 * **É agnóstico à marca, de propósito** (CLAUDE.md §11.1). Não diz o nome de
 * nenhum sistema nem de nenhuma região: recebe o HTML e devolve dados. Quem o
 * aponta a uma página concreta é a configuração do serviço, não este ficheiro.
 * O que ele conhece é uma FORMA — o cartão que o tema WordPress deste
 * fornecedor gera — como o leitor de cartazes conhece a forma de um horário
 * afixado, e não uma câmara em particular.
 *
 * **Um zero é um zero.** «Nenhuma bicicleta aqui agora» é informação, e das
 * mais úteis: poupa a caminhada. Sai como 0, e distingue-se de «não consegui
 * ler», que sai como `null` e não se mostra.
 */

/** Um cartão de estação, com a sua contagem. Coordenadas para casar com o mapa. */
const CARTAO = /<div class="bike[ "][\s\S]*?(?=<div class="bike[ "]|<\/div>\s*<\/div>\s*$|$)/g;

/**
 * As estações do painel, com bicicletas e docas.
 *
 * @param {string} html  o HTML da página, como o servidor a devolve
 * @returns {{nome:string, lat:number, lon:number, bicicletas:number|null, docas:number|null}[]}
 */
export function analisar(html) {
  const fora = [];
  for (const m of html.matchAll(CARTAO)) {
    const bloco = m[0];
    const nome = texto(um(bloco, /<h2[^>]*>([\s\S]*?)<\/h2>/));
    if (!nome) continue;
    const lat = numero(um(bloco, /class="[^"]*stationlat[^"]*"[^>]*>([^<]+)</));
    const lon = numero(um(bloco, /class="[^"]*stationlon[^"]*"[^>]*>([^<]+)</));
    fora.push({
      nome,
      lat,
      lon,
      // Pelo RÓTULO e não pela posição: a página escreve «Bicicletas
      // disponíveis» e «Docas disponíveis», e um dia em que troque a ordem
      // das duas linhas não pode passar a chamar docas às bicicletas.
      bicicletas: contagem(bloco, /bicicletas?\s+dispon/i),
      docas: contagem(bloco, /docas?\s+dispon/i),
    });
  }
  return fora;
}

/** A contagem que vem a seguir a um rótulo, no mesmo cartão. */
function contagem(bloco, rotulo) {
  const i = bloco.search(rotulo);
  if (i < 0) return null;
  const resto = bloco.slice(i);
  const m = resto.match(/bike__available[^>]*>\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function um(bloco, re) {
  const m = bloco.match(re);
  return m ? m[1] : '';
}

function numero(s) {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Tira as etiquetas e normaliza os espaços de um pedaço de HTML. */
function texto(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A chave estável de uma estação, a partir do nome.
 *
 * TEM DE SER A MESMA regra do lado do pipeline (`_chave` em
 * `gbfs_operadora.py`): é por esta chave que a contagem ao vivo se junta à
 * estação que o site já mostra. Duas regras diferentes davam duas chaves
 * diferentes, e a contagem não aparecia em estação nenhuma.
 */
export function chave(nome) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
