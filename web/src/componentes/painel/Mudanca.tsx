import { diferenca } from '@/lib/painel/auditoria';

/**
 * O antes e o depois de uma ação, dobrado numa gaveta: quem lê a auditoria
 * quer ver quem fez o quê; quem quer o pormenor abre a linha.
 */
export default function Mudanca({ before, after }: { before: unknown; after: unknown }) {
  const linhas = diferenca(before, after);
  if (linhas.length === 0) return <span className="secundario-texto">—</span>;
  const valor = (texto: string | null) =>
    texto === null ? <em className="secundario-texto">não havia</em> : texto;
  return (
    <details className="mudanca">
      <summary>{linhas.length === 1 ? '1 campo' : `${linhas.length} campos`}</summary>
      <dl>
        {linhas.map((linha) => (
          <div key={linha.campo}>
            <dt>{linha.campo}</dt>
            <dd>
              {valor(linha.antes)} <span aria-hidden="true">→</span>
              <span className="so-para-leitores"> passou a </span> {valor(linha.depois)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
