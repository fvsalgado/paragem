import { diferencaLegivel } from '@/lib/painel/auditoria';

/**
 * O antes e o depois de uma ação, em palavras (P4-020): «publicado: não →
 * sim», e não `publicado: false → true`. Com uma ou duas mudanças vê-se logo;
 * com mais — um aviso escrito de raiz — dobra-se numa gaveta, para a linha da
 * auditoria continuar a ler-se como uma frase.
 */
export default function Mudanca({ before, after }: { before: unknown; after: unknown }) {
  const linhas = diferencaLegivel(before, after);
  if (linhas.length === 0) return null;
  const valor = (texto: string | null) =>
    texto === null ? <em className="secundario-texto">nada</em> : texto;
  const lista = (
    <dl className="mudanca-lista">
      {linhas.map((linha) => (
        <div key={linha.campo}>
          <dt>{linha.campo}</dt>
          <dd>
            {linha.antes === null ? null : (
              <>
                {valor(linha.antes)} <span aria-hidden="true">→</span>
                <span className="so-para-leitores"> passou a </span>{' '}
              </>
            )}
            {valor(linha.depois)}
          </dd>
        </div>
      ))}
    </dl>
  );
  if (linhas.length <= 2) return lista;
  return (
    <details className="mudanca">
      <summary>O que mudou ({linhas.length} campos)</summary>
      {lista}
    </details>
  );
}
