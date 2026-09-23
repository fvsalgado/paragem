import { emVigor, nomeDaCausa, nomeDoEfeito, type Aviso } from '@/lib/avisos';

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
  const desde = aviso.inicio ? new Date(aviso.inicio) : null;
  const ate = aviso.fim ? new Date(aviso.fim) : null;
  const quando = (d: Date) => d.toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' });
  return (
    <div className={grave ? 'faixa alerta' : 'faixa'}>
      <h2>{aviso.titulo}</h2>
      <p>{aviso.texto}</p>
      <p className="secundario">
        {nomeDaCausa(aviso.causa)} · {nomeDoEfeito(aviso.efeito)}
        {desde ? ` · desde ${quando(desde)}` : ''}
        {/* SEM FIM NÃO SE INVENTA UM: é o que a operadora sabe, e é isso que
            se diz. «Até às 18h» num aviso que ninguém datou é uma promessa. */}
        {ate ? ` até ${quando(ate)}` : desde ? ', sem fim previsto' : ''}
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
