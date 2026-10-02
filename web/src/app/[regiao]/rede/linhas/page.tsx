import type { Metadata } from 'next';
import { exigirModo, linhas, operadorCurto, urlRede, regiao } from '@/lib/dados';
import { plural, maiuscula } from '@/lib/prosa';
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
  const ls = await linhas(rid);
  // DOIS OPERADORES COM O MESMO NÚMERO DE CARREIRA. Acontece: a rede da região
  // tem uma 1109 e a concessão vizinha tem outra, que não têm nada a ver uma
  // com a outra. O identificador distingue-as e o distintivo não — quem lê a
  // lista vê dois «1109» e não sabe qual escolheu. Nestes casos, e só nestes,
  // o operador aparece ao lado: é o §1 outra vez, a entidade como informação
  // secundária que só se mostra quando é precisa para decidir.
  //
  // Só na de FORA: a rede da região não se anuncia, e não precisa — basta uma
  // das duas estar identificada para que a outra deixe de ser ambígua. E
  // escrever aqui o nome da rede da casa era cravar no código o nome de um
  // cliente, que é o que o §11.1 proíbe.
  const quantas = new Map<string, number>();
  for (const l of ls) quantas.set(l.codigo, (quantas.get(l.codigo) ?? 0) + 1);

  return (
    <>
      <h1>Linhas</h1>
      <p>{plural(ls.length, 'linha', 'linhas')}.</p>
      <FiltroDasLinhas
        linhas={ls.map((l) => ({
          id: l.id,
          href: urlRede(rid, `linhas/${l.id}/`),
          codigo: l.codigo,
          nome: l.nome,
          cor: l.cor ?? null,
          operador:
            (quantas.get(l.codigo) ?? 0) > 1 && l.operador ? operadorCurto(l.operador) : null,
          viagens: l.viagens,
        }))}
      />
    </>
  );
}
