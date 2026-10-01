/**
 * Que uma folha foi transcrita à mão, e quando.
 *
 * Há brochuras que nenhum leitor automático lê sem risco: a de Constância
 * escreve traços que não assentam nas colunas, a das Praias Fluviais empilha
 * três circuitos na mesma grelha sem cabeçalho entre eles, e o folheto do
 * LINK não é sequer um horário de paragens. Essas são transcritas à mão.
 *
 * **O que a construção prova, e o que não prova.** Cada hora e cada nome
 * transcritos têm de aparecer no PDF de origem — a verificação corre em todas
 * as construções e BLOQUEIA se falhar, pelo que um dígito trocado não passa.
 * O que isso não prova é que a hora está na paragem certa: isso mediu-o
 * alguém com os olhos, uma vez. Quem lê tem direito a saber que foi assim, e
 * é para isso que esta linha existe.
 *
 * **QUEM transcreveu NÃO SE MOSTRA.** A linha dizia ao público, em cada
 * circuito, «Transcrito da brochura por Claude (assistente), a conferir por
 * quem publica» — uma nota de produção, e da maneira mais alarmante possível
 * para quem só quer apanhar o autocarro. Decidido pelo dono: o campo
 * `transcrito_por` fica nos dados, como está (conferi-los é dele), e o que
 * sai é uma nota neutra e útil — de onde vem a hora, e com quem se confirma.
 * O estado da conferência é do relatório de lacunas, não desta página.
 *
 * Não aparece nos horários que um leitor leu sozinho — aí não houve
 * transcrição nenhuma a declarar.
 */
export default function Transcricao({
  por,
  em,
  de = 'da folha',
}: {
  /** Só decide SE a nota aparece: uma folha com `transcrito_por` foi transcrita à mão. */
  por?: string;
  em?: string;
  /** Como esta página chama o documento: «da brochura», «do cartaz». */
  de?: string;
}) {
  if (!por) return null;
  return (
    <p className="secundario">
      Transcrito {de}
      {em ? (
        <>
          {' '}
          em <time dateTime={em}>{emPortugues(em)}</time>
        </>
      ) : null}
      ; por confirmar com a operadora.
    </p>
  );
}

/** `2026-09-20` → `20/09/2026`. Devolve o original se não for uma data ISO. */
function emPortugues(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
