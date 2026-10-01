import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NAO_ENCONTRADA } from '@/lib/formato';

/** O título do separador é o da página de «não encontrada», e não o da região. */
export const metadata: Metadata = { title: NAO_ENCONTRADA };

/**
 * QUALQUER CAMINHO QUE A REGIÃO NÃO TEM cai aqui — e daqui na 404 da região.
 *
 * Sem esta rota, um endereço que não corresponde a página nenhuma não passa
 * pelo invólucro da região: o Next manda-o direto para a 404 da raiz, que é
 * a do produto, sem o cabeçalho, a rede e o caminho de volta de quem estava
 * no sítio de uma autoridade. Com ela, o invólucro corre, confirma a região
 * (`exigirRegiao`), e o `notFound()` daqui encontra o `not-found.tsx` dela.
 *
 * Num anfitrião que não é de nenhuma região, o caminho chega com um segmento
 * que nenhuma região pode ter (`NAO_E_ENDERECO`): o invólucro recusa-o, e
 * vale a 404 do produto, que é a certa.
 */
export default function CaminhoQueNaoExiste(): never {
  notFound();
}
