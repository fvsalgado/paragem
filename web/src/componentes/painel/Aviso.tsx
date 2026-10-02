/**
 * O aviso que uma ação deixa na barra de endereços (`?aviso=`).
 *
 * `role="status"` e não `alert`: é a confirmação de um gesto que a pessoa
 * acabou de fazer, não uma interrupção. O que a base recusou começa por «Não
 * foi possível», e leva a cor de alerta para se distinguir de longe.
 *
 * Recebe o foco quando a página leva o ecrã à secção onde se mexeu
 * (`IrParaSecao`), e por isso tem `tabIndex={-1}`: focável por programa, fora
 * da ordem do tabulador. O que vem a seguir — o «Desfazer» — é de quem o usa.
 */
export default function Aviso({
  texto,
  children,
}: {
  texto?: string;
  /** O gesto contrário, quando há: «Voltar a ligar o táxi». */
  children?: React.ReactNode;
}) {
  if (!texto) return null;
  const recusa = texto.startsWith('Não foi possível');
  return (
    <div role="status" className={recusa ? 'faixa alerta' : 'faixa'} tabIndex={-1} data-mensagem>
      <p>{texto}</p>
      {children}
    </div>
  );
}
