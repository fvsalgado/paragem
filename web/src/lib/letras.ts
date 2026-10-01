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
 * Para procurar: sem acentos, em minúsculas. Quem escreve «serta» procura a
 * Sertã, e num telemóvel o til é o que menos se escreve.
 */
export function simples(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}
