/**
 * A inicial de um nome de paragem, para o índice alfabético.
 *
 * Os acentos caem na letra sem acento — «Óbidos» está no O, que é onde quem
 * procura vai ver. O que não começa por letra vai para `#`.
 */
export const LETRAS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'] as const;

export function letraDe(nome: string): string {
  const c = (nome ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

/**
 * A letra como pedaço de endereço, e o caminho de volta.
 *
 * Vivem aqui, juntas, porque estavam em duas páginas diferentes e
 * **divergiram**: o índice escrevia `letra/#/` e a rota tinha-se registado
 * como `letra/numero/`. O `#` num `href` é um fragmento, por isso a ligação
 * não dava erro nenhum — levava calada à página do índice outra vez.
 */
export const paraUrl = (letra: string): string => (letra === '#' ? 'numero' : letra.toLowerCase());

export const daUrl = (pedaco: string): string => (pedaco === 'numero' ? '#' : pedaco.toUpperCase());

/**
 * Para procurar: sem acentos, em minúsculas. Quem escreve «obidos» procura
 * Óbidos, e num telemóvel o acento é o que menos se escreve.
 */
export function simples(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Uma letra a mais, a menos ou trocada — e mais nada.
 *
 * É a distância de edição limitada a um, que é o erro de quem escreve com o
 * polegar: uma letra que fica, uma que salta, uma ao lado da outra no
 * teclado. Mais do que isso começa a acertar em nomes que não têm nada a ver.
 * Compara-se o que já vem simplificado (`simples`): sem acentos e em
 * minúsculas.
 */
export function aUmaLetra(a: string, b: string): boolean {
  if (a === b) return true;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  if (longa.length - curta.length > 1) return false;
  let i = 0;
  while (i < curta.length && curta[i] === longa[i]) i++;
  if (curta.length === longa.length) return curta.slice(i + 1) === longa.slice(i + 1);
  return curta.slice(i) === longa.slice(i + 1);
}
