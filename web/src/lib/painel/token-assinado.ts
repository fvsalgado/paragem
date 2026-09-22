/**
 * As primitivas de um token assinado, num sítio só.
 *
 * Escritas sobre a Web Crypto e não sobre `node:crypto` por uma razão
 * concreta: o middleware, que é a primeira barreira de `/admin`, corre no
 * runtime de edge, onde `node:crypto` não existe. Ter duas implementações da
 * mesma verificação — uma para o middleware, outra para as páginas — era
 * garantir que um dia divergiam e uma delas passava a aceitar o que a outra
 * recusa. Levantado do Coreto (`src/lib/token-assinado.ts`).
 */

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = '';
  for (const byte of view) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64url(valor: string): Uint8Array {
  const comBarras = valor.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(comBarras + '='.repeat((4 - (comBarras.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

export async function assinar(valor: string, segredo: string): Promise<string> {
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    await chaveHmac(segredo),
    new TextEncoder().encode(valor),
  );
  return base64url(assinatura);
}

/** Comparação sem sair mais cedo, para o tempo de resposta não dizer nada. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}
