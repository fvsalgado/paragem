import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import { concelhos, exigirRegiao, urlRede, regiao } from '@/lib/dados';
import { aAutoridade, aRede, maiuscula, plural } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  const n = (await concelhos(rid)).length;
  return metadadosDaRegiao(r, {
    titulo: 'Concelhos',
    descricao: `${maiuscula(plural(n, 'concelho', 'concelhos'))} ${r.em}: as linhas, as paragens e os outros transportes de cada um.`,
    caminho: '/rede/concelhos/',
  });
}

export default async function Concelhos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const cs = await concelhos(rid);
  const membros = cs.filter((c) => c.membro);
  const outros = cs.filter((c) => !c.membro);
  // UMA CÂMARA NÃO TEM MUNICÍPIOS MEMBROS: é um. A região de um município
  // dizia «O Município de Sável tem 1 municípios», e o produto licencia-se a
  // uma câmara sozinha (§2) — a frase tem de servir as duas.
  const municipio = r.autoridade?.tipo === 'municipio';
  return (
    <>
      <h1>Concelhos</h1>
      {/* Os dois números nunca se misturam e nenhum se esconde (§2). */}
      {/* UM MUNICÍPIO FALA COMO UM MUNICÍPIO (P4-009): diz que rede gere, e
          quantos concelhos ela serve — sem «municípios membros», que é a
          frase de uma comunidade intermunicipal. */}
      <p>
        {municipio
          ? `${maiuscula(aAutoridade(r, 'com_artigo'))} gere ${aRede(r)}, que serve ${plural(
              r.concelhos_servidos,
              'concelho',
              'concelhos',
            )}.`
          : `${maiuscula(aAutoridade(r, 'com_artigo'))} tem ${plural(
              r.municipios_membros,
              'município membro',
              'municípios membros',
            )}. A rede serve ${plural(r.concelhos_servidos, 'concelho', 'concelhos')}.`}
      </p>

      <h2>{municipio ? 'O município' : 'Municípios membros'}</h2>
      <ul className="lista">
        {membros.map((c) => (
          <li key={c.id}>
            <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
              <span>{c.nome}</span>
              <span className="secundario">{plural(c.paragens, 'paragem', 'paragens')}</span>
            </Link>
          </li>
        ))}
      </ul>

      {outros.length > 0 && (
        <>
          <h2>Também servidos pela rede</h2>
          <p>
            {municipio
              ? 'Ficam fora do município, e a rede serve-os na mesma.'
              : 'Não são municípios membros, e a rede serve-os na mesma.'}
          </p>
          <ul className="lista">
            {outros.map((c) => (
              <li key={c.id}>
                <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
                  <span>{c.nome}</span>
                  <span className="secundario">
                    {plural(c.paragens, 'paragem', 'paragens')}
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
