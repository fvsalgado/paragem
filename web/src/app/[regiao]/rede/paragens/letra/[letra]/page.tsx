import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import {
  exigirModo,
  paragens,
  concelhos,
  sitios,
  urlRede,
  urlDaParagem,
  regiao,
  paragem as lerParagem,
} from '@/lib/dados';
import { plural } from '@/lib/prosa';
import { letraDe, LETRAS, paraUrl, daUrl, vizinhas } from '@/lib/letras';
import {
  agruparParagens,
  paraOnde,
  pontoDoGrupo,
  posicoesRelativas,
  type GrupoDeParagens,
} from '@/lib/lista-de-paragens';
import { oQueOsDistingue } from '@/lib/homonimos';
import { metadadosDaRegiao } from '@/lib/metadados';
import BarraDeIniciais from '@/componentes/BarraDeIniciais';

/**
 * VAZIO DE PROPÓSITO, E NÃO SE APAGA. Sem `generateStaticParams`, o Next trata
 * uma rota com segmento dinâmico como DINÂMICA: rende-a a cada pedido e manda
 * `no-store`. Com a função a devolver uma lista vazia, a rota é «estática com
 * caminhos a pedido»: a primeira visita rende e guarda, as seguintes servem a
 * cópia, até ao `revalidate` ou ao sinal do pipeline. Medido antes de escrever
 * isto — com a função apagada, `Cache-Control: private, no-cache, no-store`
 * em todas as páginas de região.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string; letra: string }>;
}): Promise<Metadata> {
  const { regiao: rid, letra } = await params;
  await exigirModo(rid, 'autocarro');
  const l = daUrl(letra);
  const titulo = `Paragens em ${l === '#' ? 'número' : l}`;
  const r = await regiao(rid);
  if (!r) return { title: titulo };
  return metadadosDaRegiao(r, {
    titulo,
    descricao: `As paragens ${r.de} cujo nome começa por ${l === '#' ? 'um número' : l}.`,
    caminho: urlRede(rid, `paragens/letra/${paraUrl(l)}/`),
  });
}

const nomeDaLetra = (l: string) => (l === '#' ? 'Começam por número' : l);

export default async function PorLetra({
  params,
}: {
  params: Promise<{ regiao: string; letra: string }>;
}) {
  const { regiao: rid, letra } = await params;
  await exigirModo(rid, 'autocarro');
  const l = daUrl(letra);
  const todas = await paragens(rid);
  const comParagens = [...new Set(todas.map((p) => letraDe(p.nome)))];
  // UMA LINHA POR SÍTIO, e não por poste (`lista-de-paragens.ts`, #15).
  const grupos = agruparParagens(todas.filter((p) => letraDe(p.nome) === l));
  const cs = await concelhos(rid);
  const nomes = Object.fromEntries(cs.map((c) => [c.id, c.nome]));

  // O MESMO NOME EM SÍTIOS DIFERENTES distingue-se: pelo concelho, que a
  // linha já diz, e quando é o mesmo, pela terra mais perto (`homonimos.ts`).
  const repetidos = new Set(
    grupos.map((g) => g.nome.toLowerCase()).filter((n, i, todos) => todos.indexOf(n) !== i),
  );
  const aDistinguir = grupos.filter((g) => repetidos.has(g.nome.toLowerCase()));
  const pistas = new Map<GrupoDeParagens, string>();
  if (aDistinguir.length) {
    const pontos = aDistinguir.map(pontoDoGrupo);
    const distingue = oQueOsDistingue(pontos, () => 'paragem', nomes, await sitios(rid));
    aDistinguir.forEach((g, i) => {
      // O concelho já está na coluna da direita; o que se junta é o resto.
      const extra = (distingue.get(pontos[i]) ?? []).filter((x) => x !== nomes[g.concelho ?? '']);
      if (extra.length) pistas.set(g, extra.join(', '));
    });
  }

  // E SE AINDA HÁ DUAS IGUAIS — o mesmo nome perto da mesma terra, com as
  // mesmas linhas —, distinguem-se pelo sítio para onde vão as partidas de
  // cada uma, lido das fichas delas. São poucas: só as que sobram.
  const textoDe = (g: GrupoDeParagens) =>
    [g.nome, pistas.get(g) ?? '', g.concelho ?? '', g.linhas.join(' ')].join('|');
  const vezes = new Map<string, number>();
  for (const g of grupos) vezes.set(textoDe(g), (vezes.get(textoDe(g)) ?? 0) + 1);
  const aindaIguais = grupos.filter((g) => (vezes.get(textoDe(g)) ?? 0) > 1);
  await Promise.all(
    aindaIguais.map(async (g) => {
      const para = paraOnde((await lerParagem(rid, g.principal.id))?.partidas ?? [], g.nome);
      const sentido = para.length ? `para ${para[0]}` : 'só chegadas';
      pistas.set(g, [pistas.get(g), sentido].filter(Boolean).join(', '));
    }),
  );

  // E SE NEM ASSIM, onde fica cada uma em relação às outras («a norte», «a sul»).
  const outraVez = new Map<string, GrupoDeParagens[]>();
  for (const g of grupos) outraVez.set(textoDe(g), [...(outraVez.get(textoDe(g)) ?? []), g]);
  for (const iguais of outraVez.values()) {
    if (iguais.length < 2) continue;
    const onde = posicoesRelativas(iguais.map((g) => g.principal));
    iguais.forEach((g, i) => pistas.set(g, [pistas.get(g), onde[i]].filter(Boolean).join(', ')));
  }

  // AS DE FORA DA REGIÃO À PARTE, no fim e fechadas (#106). Eram quase metade
  // das da letra A, intercaladas por ordem alfabética com as de dentro.
  const dentro = grupos.filter((g) => g.concelho);
  const fora = grupos.filter((g) => !g.concelho);
  const { antes, depois } = vizinhas(l, comParagens);

  const item = (g: GrupoDeParagens) => (
    <li key={g.principal.id}>
      <Link href={urlDaParagem(rid, g.principal.id)}>
        <span>
          {g.nome}
          {pistas.has(g) && <span className="secundario"> · {pistas.get(g)}</span>}
        </span>
        <span className="secundario">
          {g.concelho ? (nomes[g.concelho] ?? g.concelho) : 'fora da região'}
          {g.linhas.length > 0 && (
            <>
              <br />
              {g.linhas.slice(0, 6).join(' · ')}
              {g.linhas.length > 6 ? ' …' : ''}
            </>
          )}
        </span>
      </Link>
    </li>
  );

  return (
    <>
      <h1>{l === '#' ? 'Paragens que começam por número' : `Paragens em ${l}`}</h1>
      <BarraDeIniciais
        atual={l}
        letras={LETRAS.filter((x) => comParagens.includes(x)).map((x) => ({
          letra: x,
          href: urlRede(rid, `paragens/letra/${paraUrl(x)}/`),
        }))}
      />
      <p>
        {dentro.length > 0 ? plural(dentro.length, 'paragem', 'paragens') : 'Nenhuma paragem'} na
        região
        {fora.length > 0 ? `, e ${plural(fora.length, 'outra', 'outras')} fora dela, no fim` : ''}.
        As dos dois lados da mesma estrada contam como uma: a página de cada uma mostra as outras.
      </p>
      {dentro.length > 0 && <ul className="lista">{dentro.map(item)}</ul>}
      {fora.length > 0 && (
        <details className="lista-fechada fora-da-regiao">
          <summary>
            Fora da região <span className="secundario">({fora.length})</span>
          </summary>
          <p className="secundario">
            Paragens de linhas que entram na região ou saem dela, já do outro lado da fronteira.
          </p>
          <ul className="lista">{fora.map(item)}</ul>
        </details>
      )}
      <nav aria-label="Outras iniciais" className="letras-vizinhas">
        <ul>
          {antes && (
            <li>
              <Link href={urlRede(rid, `paragens/letra/${paraUrl(antes)}/`)} rel="prev">
                <span aria-hidden="true">‹ </span>
                {nomeDaLetra(antes)}
              </Link>
            </li>
          )}
          <li>
            <Link href={urlRede(rid, 'paragens/')}>Todas as iniciais</Link>
          </li>
          {depois && (
            <li>
              <Link href={urlRede(rid, `paragens/letra/${paraUrl(depois)}/`)} rel="next">
                {nomeDaLetra(depois)}
                <span aria-hidden="true"> ›</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
