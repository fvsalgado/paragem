import type { EnderecoDesenhado } from '@/lib/feixe';

/**
 * O LOGÓTIPO DE UMA REGIÃO: o endereço dela, desenhado em feixe — como o do
 * produto é «paragem.pt» (§6). Decidido pelo dono a 3/10/2026.
 *
 * O desenho vem feito do servidor (`desenharEndereco`, em `lib/feixe.ts`): o
 * mesmo traço e o mesmo espaço entre letras da marca do produto, sem mandar o
 * desenhador para o telemóvel. As cores não vêm escritas: cada linha leva uma
 * classe (`l0`, `l1`, `l2`) e o CSS pinta-a com o feixe da região
 * (`.sitio-da-regiao`, os três tons tirados da cor dela), pelo tema. Vão as
 * duas versões — as três linhas e o reduzido de duas — e o CSS mostra a que
 * cabe nos píxeis que há.
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
  return (
    <span
      className={['endereco-em-feixe', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={desenho.endereco}
    >
      {/* O desenho é nosso e calculado no servidor, sem nada de quem visita. */}
      <svg
        className="inteira"
        viewBox={desenho.inteira.viewBox}
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: desenho.inteira.corpo }}
      />
      <svg
        className="reduzida"
        viewBox={desenho.reduzida.viewBox}
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: desenho.reduzida.corpo }}
      />
    </span>
  );
}
