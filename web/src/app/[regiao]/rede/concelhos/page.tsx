import Link from 'next/link';
import type { Metadata } from 'next';
import { concelhos, exigirRegiao, urlRede } from '@/lib/dados';

export const metadata: Metadata = { title: 'Concelhos' };

export default async function Concelhos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const cs = await concelhos(rid);
  const membros = cs.filter((c) => c.membro);
  const outros = cs.filter((c) => !c.membro);
  return (
    <>
      <h1>Concelhos</h1>
      {/* Os dois números nunca se misturam e nenhum se esconde (§2). */}
      <p>
        {r.autoridade?.nome} tem {r.municipios_membros} municípios. A rede serve{' '}
        {r.concelhos_servidos}.
      </p>

      <h2>Municípios {r.autoridade?.sigla ? `da ${r.autoridade.sigla}` : 'da autoridade'}</h2>
      <ul className="lista">
        {membros.map((c) => (
          <li key={c.id}>
            <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
              <span>{c.nome}</span>
              <span className="secundario">{c.paragens} paragens</span>
            </Link>
          </li>
        ))}
      </ul>

      {outros.length > 0 && (
        <>
          <h2>Também servidos pela rede</h2>
          <p>
            Não são municípios {r.autoridade?.sigla ? `da ${r.autoridade.sigla}` : 'da autoridade'},
            e a rede serve-os na mesma.
          </p>
          <ul className="lista">
            {outros.map((c) => (
              <li key={c.id}>
                <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
                  <span>{c.nome}</span>
                  <span className="secundario">
                    {c.paragens} paragens
                    {c.servido_por && (
                      <>
                        <br />
                        {c.servido_por}
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
