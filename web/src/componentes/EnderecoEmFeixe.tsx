import type { EnderecoDesenhado } from '@/lib/feixe';

/**
 * O LOGÓTIPO DE UMA REGIÃO: o endereço dela, desenhado em feixe — como o do
 * produto é «paragem.pt» (§6). Decidido pelo dono a 3/10/2026.
 *
 * O desenho está num ficheiro à parte (`/logotipo/<versão>.svg`, desenhado
 * por `ficheiroDoEndereco`, em `lib/feixe.ts`), e aqui vai só a referência a
 * ele: dentro da página eram 60 KB em cada uma — as duas versões, no HTML e
 * outra vez nos dados de hidratação. As cores não vêm escritas: o desenho
 * pinta-se com as variáveis do feixe da região (`.sitio-da-regiao`, os três
 * tons tirados da cor dela), pelo tema. Vão as duas versões — as três linhas e
 * o reduzido de duas — e o CSS mostra a que cabe nos píxeis que há; a caixa de
 * cada uma vem do servidor, e o lugar fica guardado antes de o desenho chegar.
 *
 * Lê-se como o que mostra: o nome acessível é o endereço, escrito.
 */
export default function EnderecoEmFeixe({
  desenho,
  className = '',
}: {
  desenho: EnderecoDesenhado;
  className?: string;
}) {
  const ficheiro = `/logotipo/${desenho.versao}.svg`;
  return (
    <span
      className={['endereco-em-feixe', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={desenho.endereco}
    >
      <svg
        className="inteira"
        viewBox={desenho.inteira.viewBox}
        aria-hidden="true"
        focusable="false"
      >
        <use href={`${ficheiro}#inteira`} />
      </svg>
      <svg
        className="reduzida"
        viewBox={desenho.reduzida.viewBox}
        aria-hidden="true"
        focusable="false"
      >
        <use href={`${ficheiro}#reduzida`} />
      </svg>
    </span>
  );
}
