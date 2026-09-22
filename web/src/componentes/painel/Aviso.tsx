/**
 * O aviso que uma ação deixa na barra de endereços (`?aviso=`).
 *
 * `role="status"` e não `alert`: é a confirmação de um gesto que a pessoa
 * acabou de fazer, não uma interrupção. O que a base recusou começa por «Não
 * foi possível», e leva a cor de alerta para se distinguir de longe.
 */
export default function Aviso({ texto }: { texto?: string }) {
  if (!texto) return null;
  const recusa = texto.startsWith('Não foi possível');
  return (
    <p role="status" className={recusa ? 'faixa alerta' : 'faixa'}>
      {texto}
    </p>
  );
}
