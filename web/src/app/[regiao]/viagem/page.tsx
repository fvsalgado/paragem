import type { Metadata } from 'next';
import { motorDaRegiao } from '@/lib/enderecos';
import DireccoesDaPagina from '@/componentes/DireccoesDaPagina';
import { exigirRegiao, lacunas, procura, servicosSemDatas } from '@/lib/dados';

export const metadata: Metadata = { title: 'Como chegar' };

/**
 * As direções em página própria.
 *
 * O mapa passou a ter as direções lá dentro, e esta página continua a existir
 * por três razões que não se resolvem no painel: é o destino das ligações
 * «Como chegar» das páginas estáticas de cada paragem, é o endereço que se
 * partilha, e é o caminho de quem não carrega o mapa.
 */
export default async function Viagem({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const pontos = await procura(rid);
  const l = await lacunas(rid);

  return (
    <>
      <h1>Como chegar</h1>
      {/* Sem contagem: «São 2573 sítios» contava paragens, docas e praças, e
          não os sítios que a procura também conhece — o mesmo sítio dava dois
          números diferentes para a mesma coisa. */}
      <p>Escreve de onde partes e para onde vais: uma paragem, uma estação ou um sítio {r.em}.</p>
      <DireccoesDaPagina
        pontos={pontos}
        regiao={rid}
        modosDesligados={r.modos_desligados ?? []}
        motorDaRegiao={motorDaRegiao(rid)}
        servicosSemDatas={servicosSemDatas(l)}
      />
    </>
  );
}
