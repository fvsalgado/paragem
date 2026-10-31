import { CONTACTO, SEGURANCA } from '@/lib/produto';

/**
 * O `security.txt` (RFC 9116), em `/.well-known/security.txt` de TODOS os
 * anfitriões — o do produto e o de cada região (`regiao-host.ts`).
 *
 * Não havia nenhum: quem encontrava uma falha e procurava, como a RFC manda,
 * a quem a dizer, levava um 404 aqui e um contacto no Coreto. O contacto é o do
 * produto em todos os anfitriões, porque quem corrige o software é quem o
 * escreve, e uma falha numa região é uma falha em todas; a política é o
 * `SECURITY.md` do repositório, que é público.
 *
 * A validade é de um ano a partir de quando a resposta se fez, e a resposta
 * refaz-se todos os dias: nunca fica velha enquanto o sítio estiver de pé.
 */
export const revalidate = 86400;

const UM_ANO_MS = 365 * 24 * 60 * 60 * 1000;

export function GET(): Response {
  const validade = new Date(Date.now() + UM_ANO_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const texto = [
    `Contact: mailto:${CONTACTO}`,
    `Expires: ${validade}`,
    'Preferred-Languages: pt, en',
    `Policy: ${SEGURANCA}`,
    '',
    '# Não abrir um issue público para uma falha de segurança.',
    '',
  ].join('\n');
  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
