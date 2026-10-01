import Link from 'next/link';
import type { Metadata } from 'next';
import { estacoes, exigirModo, urlRede } from '@/lib/dados';
import { plural } from '@/lib/prosa';

export const metadata: Metadata = { title: 'Estações de comboio' };

export default async function Estacoes({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  await exigirModo(rid, 'comboio');
  const es = await estacoes(rid);
  const sozinhas = es.filter((e) => e.sem_ligacao);
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
            antes de apanhar o comboio do que depois.
          </p>
        </div>
      )}
      <ul className="lista">
        {es.map((e) => (
          <li key={e.id}>
            <Link href={urlRede(rid, `estacoes/${e.id}/`)}>
              <span>{e.nome}</span>
              <span className="secundario">
                {e.sem_ligacao
                  ? 'sem autocarro perto'
                  : plural(e.paragens_perto.length, 'paragem perto', 'paragens perto')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
