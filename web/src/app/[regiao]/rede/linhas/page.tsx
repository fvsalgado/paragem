import type { Metadata } from 'next';
import { exigirModo, linhas, operadorCurto, urlRede, regiao } from '@/lib/dados';
import { daRede, maiuscula, nomeDaRede, plural } from '@/lib/prosa';
import FiltroDasLinhas from '@/componentes/FiltroDasLinhas';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  const n = (await linhas(rid)).length;
  return metadadosDaRegiao(r, {
    titulo: 'Linhas',
    descricao: `${maiuscula(plural(n, 'linha', 'linhas'))} ${r.em}, cada uma com o horário e as paragens.`,
    caminho: '/rede/linhas/',
  });
}

export default async function Linhas({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  await exigirModo(rid, 'autocarro');
  const r = await regiao(rid);
  const ls = await linhas(rid);
  // A REDE DA REGIÃO E AS LINHAS DE OUTROS OPERADORES, em dois grupos, e quantas
  // são de cada (auditoria de 1/11/2026, #16 e #97). A lista misturava as
  // carreiras de fora — oito com o mesmo nome, de um terminal a outro, sem cor
  // e sem operador — com as da rede, e o mesmo número de carreira aparecia duas
  // vezes, uma de cada concessão, sem dizer qual era qual. As de fora levam todas o
  // nome de quem as gere, e cada uma vive no seu grupo.
  const daRegiao = ls.filter((l) => !l.operador);
  const deFora = ls.filter((l) => l.operador);
  const comoItem = (l: (typeof ls)[number]) => ({
    id: l.id,
    href: urlRede(rid, `linhas/${l.id}/`),
    codigo: l.codigo,
    nome: l.nome,
    cor: l.cor ?? null,
    operador: l.operador ? operadorCurto(l.operador) : null,
    viagens: l.viagens,
  });
  const rede = r ? nomeDaRede(r) : 'A rede';

  return (
    <>
      <h1>Linhas</h1>
      <p>
        {deFora.length
          ? `${plural(daRegiao.length, 'linha', 'linhas')} ${r ? daRede(r) : 'da rede'}, e ${plural(deFora.length, 'linha', 'linhas')} de outros operadores que entram na região.`
          : `${plural(ls.length, 'linha', 'linhas')}.`}
      </p>
      <FiltroDasLinhas
        grupos={[
          { id: 'rede', titulo: rede, linhas: daRegiao.map(comoItem) },
          {
            id: 'outros',
            titulo: 'Outras linhas que entram na região',
            nota: 'Geridas por outros operadores, com paragens na região.',
            linhas: deFora.map(comoItem),
          },
        ]}
      />
    </>
  );
}
