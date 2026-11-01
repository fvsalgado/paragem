import { Fragment } from 'react';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import {
  aPedido,
  concelhos,
  estacoes,
  exigirRegiao,
  modos as lerModos,
  urlRede,
  regiao,
} from '@/lib/dados';
import { quantosNoConcelho, resumoDoConcelho } from '@/lib/concelho';
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
  // O QUE CADA CONCELHO TEM, e não só as paragens (`resumoDoConcelho`): «10
  // paragens» escondia a estação, o urbano e as bicicletas de quem as tem.
  const [es, pedido, ms] = await Promise.all([estacoes(rid), aPedido(rid), lerModos(rid)]);
  // Cada parte inteira na mesma linha: «· 6» numa e «estações de bicicletas»
  // na seguinte lia-se mal.
  const resumo = (id: string, paragens: number) =>
    resumoDoConcelho({
      paragens,
      estacoes: es.filter((e) => e.concelho === id).length,
      aPedido: (pedido?.zonas ?? []).some((z) => z.concelho === id || z.entre?.includes(id)),
      modos: Object.entries(ms).map(([m, d]) => [m, quantosNoConcelho(d, id)]),
    })
      .split(' · ')
      .map((parte, i) => (
        <Fragment key={parte}>
          {i > 0 ? ' · ' : ''}
          <span className="sem-quebra">{parte}</span>
        </Fragment>
      ));
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
      <ul className="lista concelhos-com-resumo">
        {membros.map((c) => (
          <li key={c.id}>
            <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
              <span>{c.nome}</span>
              <span className="secundario">{resumo(c.id, c.paragens)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {outros.length > 0 && (
        <>
          {/* «TAMBÉM SERVIDOS PELA REDE <nome>», sem soar a desculpa. Dizia
              «Não são municípios membros, e a rede serve-os na mesma» — como
              se fosse um favor —, e no telemóvel partia «serve-» de «os»
              (auditoria de 1/11/2026). */}
          <h2>Também servidos pel{aRede(r)}</h2>
          <p>
            {municipio ? 'Ficam fora do município' : `Não são membros ${aAutoridade(r, 'de')}`}, mas{' '}
            {aRede(r)} <span className="sem-quebra">serve-os</span>.
          </p>
          <ul className="lista concelhos-com-resumo">
            {outros.map((c) => (
              <li key={c.id}>
                <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
                  <span>{c.nome}</span>
                  <span className="secundario">{resumo(c.id, c.paragens)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
