import type { Metadata } from 'next';
import { regiao } from '@/lib/dados';
import CatalogoDaRegiao from '@/componentes/CatalogoDaRegiao';
import { lista } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

/**
 * O título próprio da rede. Tinha o mesmo do mapa — «Paragem.pt — <a região>
 * · Paragem.pt» —, e dois separadores iguais não se distinguem.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  // O que a página lista, e só isso: uma região sem autocarros não tem
  // paragens nem linhas, e sem comboio não tem estações.
  const partes = [
    ...(r.modos.includes('autocarro') ? ['as paragens', 'as linhas'] : []),
    ...(r.modos.includes('comboio') ? ['as estações'] : []),
    'os concelhos',
    'o tarifário',
  ];
  return metadadosDaRegiao(r, {
    titulo: 'A rede',
    descricao: `Os transportes ${r.de} em listas: ${lista(partes)} — o caminho de quem não usa o mapa.`,
    caminho: '/rede/',
  });
}

/**
 * O CATÁLOGO, em `/rede/`. O que ele tem vive em `CatalogoDaRegiao`, porque é
 * também o início de uma região que ainda não tem mapa — e duas cópias das
 * mesmas listas divergiam.
 */
export default async function Rede({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  return <CatalogoDaRegiao regiao={rid} />;
}
