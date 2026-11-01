import type { Metadata } from 'next';
import { CartaoDeAviso } from '@/componentes/Avisos';
import FiltroDosAvisos from '@/componentes/FiltroDosAvisos';
import { avisosEmVigor, redeToda, type AlcanceDoAviso, type Aviso } from '@/lib/avisos';
import { catalogoDosAvisos } from '@/lib/avisos-do-sitio';
import { concelhos, exigirRegiao, paragens, regiao } from '@/lib/dados';
import { aAutoridade } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  return metadadosDaRegiao(r, {
    titulo: 'Avisos',
    descricao: `Os avisos em vigor nos transportes ${r.de}.`,
    caminho: '/avisos/',
  });
}

/**
 * Um minuto, e a etiqueta dos avisos.
 *
 * Não é `force-dynamic`: publicar no painel invalida a etiqueta e esta página
 * rende-se de novo à visita seguinte, que é mais depressa do que qualquer
 * prazo. O minuto é o que sobra para o caso de o sinal se perder — e é também
 * o que faz um aviso marcado para as 8h aparecer às 8h e não quando alguém se
 * lembrar de publicar outra coisa.
 */
export const revalidate = 60;

export default async function Avisos({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const [r, as, catalogo] = await Promise.all([
    exigirRegiao(rid),
    avisosEmVigor(rid),
    catalogoDosAvisos(rid),
  ]);
  // O FILTRO SÓ COM AVISOS QUE CHEGUEM PARA ISSO: com um ou dois, duas caixas
  // de escolha por cima são mais ruído do que ajuda.
  const comFiltro = (as?.length ?? 0) >= 3;
  const filtro = comFiltro ? await alcancesDosAvisos(rid, as!, catalogo.linhas) : null;

  return (
    <>
      <h1>Avisos</h1>
      {/* NUMA DEMONSTRAÇÃO OS AVISOS SÃO EXEMPLOS, e diz-se antes deles. O
          título de cada um já o diz; isto diz porque é que estão aqui — para
          mostrar o que o painel publica —, e que nenhum é verdadeiro. */}
      {r.demonstracao && (
        <p>
          Nesta demonstração, os avisos são exemplos: mostram como a autoridade de transportes
          publica uma alteração ao serviço, e nenhum é verdadeiro.
        </p>
      )}

      {/* TRÊS ESTADOS, E NÃO DOIS. «Não há avisos» e «não consegui ler»
          dizem coisas opostas a quem está à espera do autocarro, e a
          diferença entre elas é exatamente a que custa caro. */}
      {as === null ? (
        <div className="faixa alerta">
          <p>
            <strong>Não foi possível ler os avisos.</strong> Isto não quer dizer que não haja
            nenhum: quer dizer que não conseguimos perguntar. Tente daqui a pouco; entretanto,
            confirme com a autoridade de transportes antes de contar com o serviço.
          </p>
        </div>
      ) : as.length === 0 ? (
        <>
          <p>Não há avisos em vigor.</p>
          {/* NUMA PROPOSTA, O SÍTIO NÃO FALA PELA AUTORIDADE. Dizia que aqui
              saíam «as alterações que a autoridade de transportes publica» —
              e numa região que ela ainda não adotou isso é falso: ela publica
              os avisos dela nos canais dela, e esta página pode não os ter.
              Quem lê «não há avisos» tem de saber onde confirmar. */}
          {r.proposta ? (
            <p className="secundario">
              O que aparece aqui são as alterações ao serviço publicadas neste sítio: supressões,
              desvios, greves. Este sítio ainda não é um serviço {aAutoridade(r, 'de')}, e por isso
              pode não ter os avisos oficiais — esses saem nos canais de quem gere e opera o
              serviço, e é lá que se confirma antes de contar com ele.
            </p>
          ) : (
            <p className="secundario">
              O que aparece aqui são as alterações ao serviço que a autoridade de transportes
              publica: supressões, desvios, greves. Um aviso cujo prazo já passou sai desta página.
            </p>
          )}
        </>
      ) : filtro ? (
        <FiltroDosAvisos
          linhas={filtro.linhas}
          concelhos={filtro.concelhos}
          alcances={filtro.alcances}
        >
          {as.map((a) => (
            <CartaoDeAviso key={a.id} aviso={a} catalogo={catalogo} />
          ))}
        </FiltroDosAvisos>
      ) : (
        as.map((a) => <CartaoDeAviso key={a.id} aviso={a} catalogo={catalogo} />)
      )}

      {/* DE QUE É QUE ESTES AVISOS SÃO, e é preciso dizê-lo: o sítio mostra
          comboios e expressos ao lado da rede da casa, e quem lê uma página de
          avisos sem avisos nenhuns tem direito a saber se isso quer dizer «não
          há» ou «não é aqui que se sabe». */}
      <p className="secundario">
        {r.proposta
          ? `Dizem respeito aos serviços geridos ${aAutoridade(r, 'por')}, e não são os avisos oficiais.`
          : `São os avisos dos serviços geridos ${aAutoridade(r, 'por')}.`}{' '}
        Para alterações noutros serviços que aparecem neste sítio, o aviso é de quem os opera, e é
        no sítio dele que sai a tempo.
      </p>
      <p className="secundario">
        Os avisos publicados saem também em <a href="gtfs-rt/alerts.pb">GTFS-RT Service Alerts</a>,
        para quem os quiser mostrar noutro lado — menos os que só dizem respeito a um modo inteiro,
        como as bicicletas, que esse formato não tem como dizer.
      </p>
    </>
  );
}

/**
 * A que linhas e concelhos diz respeito cada aviso, para o filtro: as linhas
 * que nomeia, e os concelhos das paragens que nomeia e das paragens dessas
 * linhas. Um aviso sem linhas nem paragens (a rede toda, ou um modo inteiro)
 * vale para tudo.
 */
async function alcancesDosAvisos(
  rid: string,
  as: Aviso[],
  linhasDoCatalogo: ReadonlyMap<string, { codigo: string; nome: string }>,
): Promise<{
  linhas: { id: string; nome: string }[];
  concelhos: { id: string; nome: string }[];
  alcances: AlcanceDoAviso[];
}> {
  const [ps, cs] = await Promise.all([paragens(rid), concelhos(rid)]);
  const concelhoDe = new Map(ps.map((p) => [p.id, p.concelho]));
  const nomeDoConcelho = new Map(cs.map((c) => [c.id, c.nome]));
  const alcances = as.map((a): AlcanceDoAviso => {
    const codigos = new Set(a.linhas.map((id) => linhasDoCatalogo.get(id)?.codigo).filter(Boolean));
    const daqui = new Set<string>();
    for (const id of a.paragens) {
      const c = concelhoDe.get(id);
      if (c) daqui.add(c);
    }
    for (const p of ps)
      if (p.concelho && p.linhas.some((c) => codigos.has(c))) daqui.add(p.concelho);
    return {
      linhas: a.linhas,
      concelhos: [...daqui],
      todos: redeToda(a) || (a.linhas.length === 0 && a.paragens.length === 0),
    };
  });
  const linhas = [...new Set(alcances.flatMap((a) => a.linhas))]
    .map((id) => {
      const l = linhasDoCatalogo.get(id);
      return { id, nome: l ? `${l.codigo} — ${l.nome}` : id };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { numeric: true }));
  const concelhosNosAvisos = [...new Set(alcances.flatMap((a) => a.concelhos))]
    .map((id) => ({ id, nome: nomeDoConcelho.get(id) ?? id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return { linhas, concelhos: concelhosNosAvisos, alcances };
}
