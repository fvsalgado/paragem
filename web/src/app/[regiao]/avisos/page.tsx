import type { Metadata } from 'next';
import { avisos } from '@/lib/dados';

export const metadata: Metadata = { title: 'Avisos' };

export default async function Avisos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const as = await avisos(rid);
  return (
    <>
      <h1>Avisos</h1>
      {as.length === 0 ? (
        <>
          <p>Não há avisos publicados.</p>
          {/* Um aviso de exemplo publicado é um aviso falso. Enquanto não
              houver de onde os tirar, esta página diz que está vazia e porquê. */}
          <div className="faixa">
            <p>
              <strong>Esta página ainda não recebe avisos da autoridade de transportes.</strong> A
              gestão de avisos — e o feed em tempo real que dela sai — é trabalho a seguir. Até lá,
              uma supressão ou um desvio não aparece aqui.
            </p>
          </div>
        </>
      ) : (
        as.map((a) => (
          <div key={a.id} className={`faixa ${a.gravidade === 'grave' ? 'alerta' : ''}`}>
            <h2>{a.titulo}</h2>
            <p>{a.texto}</p>
            {a.desde && (
              <p className="secundario">
                Desde {a.desde}
                {a.ate ? ` até ${a.ate}` : ''}.
              </p>
            )}
          </div>
        ))
      )}
    </>
  );
}
