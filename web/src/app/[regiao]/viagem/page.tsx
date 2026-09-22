import type { Metadata } from 'next';
import { motorDaRegiao } from '@/lib/enderecos';
import DireccoesDaPagina from '@/componentes/DireccoesDaPagina';
import { exigirRegiao, procura } from '@/lib/dados';

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

  return (
    <>
      <h1>Como chegar</h1>
      <p>
        Escreve de onde partes e para onde vais. São {pontos.length} sítios {r.em}.
      </p>
      <DireccoesDaPagina
        pontos={pontos}
        regiao={rid}
        modosDesligados={r.modos_desligados ?? []}
        motorDaRegiao={motorDaRegiao(rid)}
      />
    </>
  );
}
