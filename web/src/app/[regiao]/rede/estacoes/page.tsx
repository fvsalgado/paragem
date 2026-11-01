import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import { estacoes, exigirModo, paragensPertoPorNome, urlRede, regiao } from '@/lib/dados';
import { plural, maiuscula } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  const n = (await estacoes(rid)).length;
  return metadadosDaRegiao(r, {
    titulo: 'Estações de comboio',
    descricao: `${maiuscula(plural(n, 'estação de comboio', 'estações de comboio'))} ${r.em}, com os comboios de cada uma e o autocarro à porta.`,
    caminho: '/rede/estacoes/',
  });
}

export default async function Estacoes({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  await exigirModo(rid, 'comboio');
  const es = await estacoes(rid);
  // AS QUE NÃO TÊM AUTOCARRO PERTO, À PARTE E NO FIM (auditoria de 1/11/2026,
  // #86). A faixa anunciava quantas eram, e na lista tinham o mesmo cinzento
  // pequeno de «1 paragem perto»: era preciso ler as linhas todas para as
  // encontrar. Agora têm um subtítulo delas, e a faixa leva lá.
  const comAutocarro = es.filter((e) => !e.sem_ligacao);
  const sozinhas = es.filter((e) => e.sem_ligacao);
  const item = (e: (typeof es)[number]) => {
    // UMA POR NOME, como a página da estação as mostra (#85): os dois lados
    // da estrada são o mesmo sítio para quem sai do comboio, e a lista dizia
    // «2 paragens perto» de uma estação cuja página mostrava uma.
    const perto = paragensPertoPorNome(e.paragens_perto);
    return (
      <li key={e.id}>
        <Link href={urlRede(rid, `estacoes/${e.id}/`)}>
          <span>{e.nome}</span>
          <span className="secundario contagem">
            {e.sem_ligacao
              ? 'sem autocarro perto'
              : plural(perto.length, 'paragem perto', 'paragens perto')}
          </span>
        </Link>
      </li>
    );
  };
  return (
    <>
      <h1>Estações de comboio</h1>
      <p>{plural(es.length, 'estação', 'estações')} na região.</p>
      {/* UM FACTO ESTÁVEL, numa faixa de informação: o vermelho de alerta é
          para o que mudou hoje — usado para isto, gasta-se, e a região parece
          em crise. */}
      {sozinhas.length > 0 && (
        <div className="faixa informacao">
          <p>
            <strong>
              {sozinhas.length === 1
                ? 'Uma destas estações não tem paragem de autocarro a menos de 300 m.'
                : `${sozinhas.length} destas estações não têm paragem de autocarro a menos de 300 m.`}
            </strong>{' '}
            Quem lá chegar de comboio tem de arranjar outra maneira de sair — e é melhor saber isso
            antes de apanhar o comboio do que depois.{' '}
            <a href="#sem-autocarro">{sozinhas.length === 1 ? 'Qual é' : 'Quais são'}</a>.
          </p>
        </div>
      )}
      <ul className="lista">{comAutocarro.map(item)}</ul>
      {sozinhas.length > 0 && (
        <section aria-labelledby="sem-autocarro">
          <h2 id="sem-autocarro">Sem autocarro a menos de 300 m</h2>
          <ul className="lista">{sozinhas.map(item)}</ul>
        </section>
      )}
    </>
  );
}
