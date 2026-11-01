import { fraseDoConteudo, type ConteudoDe } from '@/lib/formato';

/**
 * Que uma folha foi transcrita à mão, e quando.
 *
 * Há brochuras que nenhum leitor automático lê sem risco: uma escreve traços
 * que não assentam nas colunas, outra empilha três circuitos na mesma grelha
 * sem cabeçalho entre eles, e um folheto de ligações entre concelhos não é
 * sequer um horário de paragens. Essas são transcritas à mão.
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

/**
 * DE QUANDO É O DOCUMENTO, ao lado das horas que saem dele.
 *
 * A página só dizia quando a folha foi transcrita, e uma brochura de 2017
 * guardada em 2026 lia-se como sendo de 2026. Diz-se o que o documento diz —
 * o dia em que entra em vigor, ou o que escreve sem dia —, e quando não diz
 * nada, diz-se isso: é informação para quem confere, e não um buraco a tapar
 * com a data de obtenção.
 */
export function DataDoDocumento({
  conteudo,
  documento,
}: {
  conteudo?: ConteudoDe;
  /** Como a página chama ao papel, com o artigo: «a brochura», «o cartaz». */
  documento: string;
}) {
  const frase = fraseDoConteudo(conteudo, documento);
  return frase ? <p className="secundario">{frase}</p> : null;
}
