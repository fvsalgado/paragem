import { emVigor, nomeDaCausa, nomeDoEfeito, prazoDoAviso, type Aviso } from '@/lib/avisos';

/**
 * Um aviso, como quem está na paragem precisa de o ler.
 *
 * A gravidade decide a cor e mais nada: `SEVERE` leva a faixa de alerta, o
 * resto leva a faixa comum. A causa e o efeito aparecem por extenso em
 * português — são os campos que o GTFS-RT leva em número, e que só servem de
 * alguma coisa a quem os lê se forem palavras.
 */
export function CartaoDeAviso({ aviso }: { aviso: Aviso }) {
  const grave = aviso.gravidade === 'SEVERE';
  return (
    <div className={grave ? 'faixa alerta' : 'faixa'}>
      <h2>{aviso.titulo}</h2>
      <p>{aviso.texto}</p>
      <p className="secundario">
        {nomeDaCausa(aviso.causa)} · {nomeDoEfeito(aviso.efeito)}
        {/* As horas no fuso da região, e não no do servidor — que é UTC, e
            punha o aviso das 7h às 6h no verão (`prazoDoAviso`). */}
        {prazoDoAviso(aviso)}
      </p>
      {aviso.url ? (
        <p>
          <a href={aviso.url}>Mais informação</a>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A faixa das páginas que não são a de avisos: só os graves, e só os que
 * estão em vigor agora.
 *
 * `null` quando não se conseguiu ler — e aí não se mostra nada, porque uma
 * página de horários não é o sítio para dizer que a base não respondeu. A
 * página de avisos é, e diz.
 */
export default function FaixaDeAvisos({ avisos }: { avisos: Aviso[] | null }) {
  const agora = new Date();
  const mostrar = (avisos ?? []).filter((a) => emVigor(a, agora));
  if (mostrar.length === 0) return null;
  return (
    <section aria-labelledby="avisos">
      <h2 id="avisos">Avisos</h2>
      {mostrar.map((a) => (
        <CartaoDeAviso key={a.id} aviso={a} />
      ))}
    </section>
  );
}
