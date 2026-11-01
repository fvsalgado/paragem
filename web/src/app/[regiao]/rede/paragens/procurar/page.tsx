import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import {
  concelhos,
  exigirModo,
  linhas as lerLinhas,
  paragens,
  regiao,
  sitios,
  urlDaParagem,
  urlRede,
} from '@/lib/dados';
import { agruparParagens, coresPorNumero, type GrupoDeParagens } from '@/lib/lista-de-paragens';
import { procurarParagens, RAIO_DA_TERRA } from '@/lib/procura-de-paragens';
import { metadadosDaRegiao } from '@/lib/metadados';
import { numero, plural } from '@/lib/prosa';
import Distintivo from '@/componentes/Distintivo';
import ItemDaParagem from '@/componentes/ItemDaParagem';
import ProcurarParagem from '@/componentes/ProcurarParagem';

/**
 * RENDE-SE A CADA PEDIDO, e tem de o dizer. O invólucro da região é «estático
 * com caminhos a pedido» (`generateStaticParams` e `revalidate`), e uma página
 * por baixo dele herda isso: guardava a primeira renderização — sem procura
 * nenhuma — e servia-a a toda a gente, com o `?q=` ignorado. Medido na
 * primeira construção, antes de esta linha existir.
 */
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ regiao: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const doPedido = (q: string | string[] | undefined): string =>
  (Array.isArray(q) ? (q[0] ?? '') : (q ?? '')).slice(0, 80).trim();

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { regiao: rid } = await params;
  const q = doPedido((await searchParams).q);
  const r = await regiao(rid);
  const titulo = q ? `Procurar «${q}»` : 'Procurar uma paragem';
  if (!r) return { title: titulo };
  return {
    ...metadadosDaRegiao(r, {
      titulo,
      descricao: `Procurar uma paragem ou uma linha ${r.em}, pelo nome, pela terra ou pelo número.`,
    }),
    // Uma página por procura não é uma página a indexar: a lista das
    // paragens e as fichas de cada uma já o são.
    robots: { index: false, follow: true },
  };
}

/**
 * OS RESULTADOS DA PROCURA NAS PARAGENS, feitos no servidor (#103).
 *
 * Responde ao formulário de `ProcurarParagem`: o que se escreveu vem no
 * endereço (`?q=`), e a página é a lista do que se encontrou — as linhas com
 * esse número ou nome, as paragens com esse nome, e as que ficam perto de uma
 * terra com esse nome. Sem JavaScript nenhum no navegador.
 *
 * É a única página da rede que se rende a cada pedido: depende do que se
 * escreveu. Lê os mesmos ficheiros, em cache, que a lista e as fichas.
 */
export default async function ProcurarParagens({ params, searchParams }: Props) {
  const { regiao: rid } = await params;
  await exigirModo(rid, 'autocarro');
  const q = doPedido((await searchParams).q);
  const [ps, cs, ls, terras] = await Promise.all([
    paragens(rid),
    concelhos(rid),
    lerLinhas(rid),
    sitios(rid),
  ]);
  const nomes = Object.fromEntries(cs.map((c) => [c.id, c.nome]));
  const r = q
    ? procurarParagens(q, {
        grupos: agruparParagens(ps),
        nomesDosConcelhos: nomes,
        linhas: ls,
        terras,
      })
    : null;
  const cores = coresPorNumero(ls);
  const onde = (g: GrupoDeParagens) =>
    g.concelho ? (nomes[g.concelho] ?? g.concelho) : 'fora da região';
  const item = (g: GrupoDeParagens) => (
    <ItemDaParagem
      key={g.principal.id}
      grupo={g}
      href={urlDaParagem(rid, g.principal.id)}
      onde={onde(g)}
      cores={cores}
    />
  );
  const nada = r && !r.linhas.length && !r.paragens.length && !r.perto.length;

  return (
    <>
      <h1>{q ? `Procurar «${q}»` : 'Procurar uma paragem'}</h1>
      <ProcurarParagem valor={q} />

      {r && r.palavras.join('').length < 2 && !r.linhas.length && (
        <p role="status">
          Escreva pelo menos duas letras do nome da paragem, da terra ou da linha.
        </p>
      )}

      {nada && r.palavras.join('').length >= 2 && (
        <div role="status" className="sem-resultados">
          <p>
            <strong>Nenhuma paragem nem linha com «{q}».</strong> Experimente só uma parte do nome,
            sem o que vem entre parênteses, ou procure pela inicial.
          </p>
          <p className="cartao-accoes">
            <Link href={urlRede(rid, 'paragens/')}>Ver as paragens pela inicial</Link>
          </p>
        </div>
      )}

      {r && r.linhas.length > 0 && (
        <section aria-labelledby="linhas-encontradas">
          <h2 id="linhas-encontradas">
            {r.linhas.length === 1 ? 'Uma linha' : `${r.linhas.length} linhas`}
          </h2>
          <ul className="linhas-do-concelho">
            {r.linhas.map((l) => (
              <li key={l.id}>
                <Link href={urlRede(rid, `linhas/${l.id}/`)}>
                  <Distintivo codigo={l.codigo} cor={l.cor} tamanho="medio" />
                  <span>{l.nome}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r && r.paragens.length > 0 && (
        <section aria-labelledby="paragens-encontradas">
          <h2 id="paragens-encontradas">
            {r.total === 1 ? 'Uma paragem' : `${numero(r.total)} paragens`}
          </h2>
          {r.total > r.paragens.length && (
            <p className="secundario">
              Mostram-se as {r.paragens.length} mais servidas. Escreva mais do nome para afinar.
            </p>
          )}
          <ul className="lista">{r.paragens.map(item)}</ul>
        </section>
      )}

      {r?.perto.map((t) => (
        <section key={t.terra} aria-labelledby={`perto-${t.terra}`}>
          <h2 id={`perto-${t.terra}`}>
            Perto de {t.terra}{' '}
            <span className="secundario">· {plural(t.grupos.length, 'paragem', 'paragens')}</span>
          </h2>
          <p className="secundario">
            Paragens com outro nome, a menos de {RAIO_DA_TERRA}
            {'\u00a0'}m de {t.terra}.
          </p>
          <ul className="lista">{t.grupos.map(item)}</ul>
        </section>
      ))}
    </>
  );
}
