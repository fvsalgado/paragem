import { permanentRedirect } from 'next/navigation';

/** `/widget/` sozinho é a página que explica as caixas e dá o código. */
export default function SemCaixa(): never {
  permanentRedirect('/levar/');
}
