import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import {
  exigirModo,
  horaLegivel,
  linhaDetalhe,
  urlDaParagem,
  NAO_ENCONTRADA,
  type PontaDoSentido,
  type Sentido,
  type ViagemDoQuadro,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import { lista, plural } from '@/lib/prosa';
import Distintivo, { corDoTraco } from '@/componentes/Distintivo';
import QuadrosPorDia, { type QuadroDoDia } from '@/componentes/QuadrosPorDia';

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
  params: Promise<{ regiao: string; id: string }>;
}): Promise<Metadata> {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const l = await linhaDetalhe(rid, id);
  return { title: l ? `${l.codigo} — ${l.nome}` : NAO_ENCONTRADA };
}

/** As pontas de um sentido: as das viagens, se os dados as trazem; senão, as do percurso. */
function pontas(s: Sentido): { origens: PontaDoSentido[]; destinos: PontaDoSentido[] } {
  if (s.origens?.length && s.destinos?.length) return { origens: s.origens, destinos: s.destinos };
  const primeira = s.paragens[0]?.nome ?? '';
  const ultima = s.paragens[s.paragens.length - 1]?.nome ?? '';
  return {
    origens: primeira ? [{ nome: primeira, viagens: s.viagens }] : [],
    destinos: ultima ? [{ nome: ultima, viagens: s.viagens }] : [],
  };
}

/**
 * O TÍTULO DE UM SENTIDO É PARA ONDE ELE VAI. Era «Ida» e «Volta», que não
 * dizem nada a quem está na paragem — e numa linha chamada «A - B», a «Ida»
 * começava numa terceira terra. Quando a maior parte das viagens parte e
 * acaba no mesmo sítio, é uma circular, e diz-se.
 */
function tituloDoSentido(s: Sentido): string {
  const { origens, destinos } = pontas(s);
  const para = destinos[0]?.nome;
  if (!para) return `Sentido ${s.sentido}`;
  if (origens[0]?.nome === para) return `Circular, a partir de ${para}`;
  return `Para ${para}`;
}

/**
 * «Tomar (Terminal) (5 viagens), Abrantes (Terminal) (4) e Fátima (2)». As
 * contas só quando há mais do que uma ponta; as que passam de três juntam-se
 * numa — uma urbana com cinco pontas de uma viagem cada era uma frase de
 * quatro linhas.
 */
function pontasEmTexto(ps: PontaDoSentido[]): string {
  if (ps.length === 1) return ps[0].nome;
  const nomeadas = ps
    .slice(0, 3)
    .map((p, i) => `${p.nome} (${i === 0 ? plural(p.viagens, 'viagem', 'viagens') : p.viagens})`);
  const resto = ps.slice(3);
  if (resto.length) {
    const viagens = resto.reduce((n, p) => n + p.viagens, 0);
    nomeadas.push(`mais ${plural(resto.length, 'paragem', 'paragens')} (${viagens})`);
  }
  return lista(nomeadas);
}

/**
 * O horário de um sentido, um quadro por tipo de dia — paragens nas linhas,
 * viagens nas colunas, como o horário de papel.
 *
 * Só as paragens com HORA MARCADA (`quadros.py`): as outras têm a hora
 * estimada por nós e estão no percurso, por baixo. Nas viagens em que a hora
 * de uma destas paragens é estimada, sai em itálico e diz-se ao leitor de
 * ecrã — o §4.4 não deixa que uma estimativa passe por hora publicada.
 */
function quadrosDoSentido(s: Sentido, titulo: string): QuadroDoDia[] {
  const q = s.quadro;
  if (!q || !q.paragens.length || !q.viagens.length) return [];
  const porDia = new Map<string, ViagemDoQuadro[]>();
  for (const v of q.viagens) {
    porDia.set(v.servico_nome, [...(porDia.get(v.servico_nome) ?? []), v]);
  }
  return [...porDia.entries()].map(([dia, viagens]) => {
    // A linha de uma paragem por onde nenhuma viagem deste dia passa não diz
    // nada neste quadro: sai.
    const linhas = q.paragens
      .map((p, i) => ({ ...p, i }))
      .filter(({ i }) => viagens.some((v) => v.horas[i]));
    const comEstimadas = viagens.some((v) => v.estimadas.length > 0);
    return {
      chave: dia,
      nome: dia,
      servicos: [...new Set(viagens.map((v) => v.servico_id))],
      contagem: viagens.length === 1 ? '1 viagem' : `${viagens.length} viagens`,
      conteudo: (
        <>
          <div
            className="rolar-na-horizontal quadro-da-linha"
            tabIndex={0}
            role="group"
            aria-label={`${titulo}, ${dia}`}
          >
            <table>
              <caption className="so-para-leitores">
                {titulo}, {dia}: as horas de cada viagem, paragem a paragem
              </caption>
              <thead>
                <tr>
                  <th scope="col">Paragem</th>
                  {viagens.map((v, j) => (
                    <th key={j} scope="col">
                      <span className="so-para-leitores">Viagem das </span>
                      {horaLegivel(v.horas.find(Boolean) ?? '').texto}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ id, nome, i }) => (
                  <tr key={`${id}-${i}`}>
                    <th scope="row">{nome}</th>
                    {viagens.map((v, j) => {
                      const hora = v.horas[i];
                      if (!hora) {
                        return (
                          <td key={j} className="nao-passa">
                            <span aria-hidden="true">—</span>
                            <span className="so-para-leitores">não passa</span>
                          </td>
                        );
                      }
                      const { texto, diaSeguinte } = horaLegivel(hora);
                      const estimada = v.estimadas.includes(i);
                      return (
                        <td key={j} className={estimada ? 'estimada' : undefined}>
                          {estimada && <span className="so-para-leitores">cerca das </span>}
                          {texto}
                          {diaSeguinte && (
                            <span className="so-para-leitores"> do dia seguinte</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {comEstimadas && (
            <p className="nota-do-quadro">
              <em>Em itálico</em>: hora estimada por nós entre duas horas do horário publicado.
            </p>
          )}
        </>
      ),
    };
  });
}

export default async function Linha({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const l = await linhaDetalhe(rid, id);
  if (!l) notFound();

  // A COR DA LINHA NO PERCURSO, com o contraste garantido: um fio amarelo-claro
  // num fundo claro não se via (`corDoTraco`).
  const cor = { '--cor-da-linha': corDoTraco(l.cor) } as CSSProperties;
  const sentidos = l.sentidos.map((s, i) => ({
    s,
    ancora: `sentido-${i + 1}`,
    titulo: tituloDoSentido(s),
  }));

  return (
    <>
      <h1 className="titulo-da-linha">
        <Distintivo codigo={l.codigo} cor={l.cor} tamanho="grande" />{' '}
        <span className="nome-da-linha">{l.nome}</span>
      </h1>
      <p>
        {plural(l.viagens, 'viagem', 'viagens')} no horário.
        {/* «GERIDO POR …», que é o §1 por extenso: quem viaja não precisa de
          saber quem gere cada serviço para o encontrar, mas precisa de o saber
          para comprar o título certo. Só aparece nas linhas que NÃO são da
          rede da região — pô-lo em todas fazia da entidade o assunto, que é o
          contrário do que o briefing pede. */}
        {l.operador && (
          <>
            {' '}
            <span className="secundario">Quem gere: {l.operador}.</span>
          </>
        )}
      </p>
      <MarcaDeDados regiao={rid} />

      {/* Com dois sentidos, a página é comprida: o segundo começa depois do
          horário e do percurso do primeiro. Os dois à mão, logo em cima. */}
      {sentidos.length > 1 && (
        <nav aria-label="Sentidos desta linha" className="sentidos">
          <ul>
            {sentidos.map(({ ancora, titulo }) => (
              <li key={ancora}>
                <a href={`#${ancora}`}>{titulo}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {sentidos.map(({ s, ancora, titulo }) => {
        const quadros = quadrosDoSentido(s, titulo);
        const ultima = s.paragens.length - 1;
        return (
          <section key={s.sentido} aria-labelledby={ancora}>
            <h2 id={ancora}>{titulo}</h2>
            {/* DE ONDE PARTEM E ATÉ ONDE VÃO, DE VERDADE, com as contas: há
                sentidos em que as viagens não começam todas no mesmo sítio, e
                o título só diz o destino mais comum. */}
            <dl className="pontas-do-sentido">
              <dt>De</dt>
              <dd>{pontasEmTexto(pontas(s).origens)}</dd>
              <dt>Até</dt>
              <dd>{pontasEmTexto(pontas(s).destinos)}</dd>
            </dl>
            <p className="secundario">{plural(s.viagens, 'viagem', 'viagens')} neste sentido.</p>

            <h3 className="parte-do-sentido">Horário</h3>
            {quadros.length > 0 ? (
              <QuadrosPorDia regiao={rid} quadros={quadros} />
            ) : (
              // DADOS DE ANTES DO HORÁRIO DA LINHA: diz-se onde estão as
              // horas, em vez de deixar a secção vazia a parecer que não há.
              <p>
                As horas desta linha estão nas páginas de cada paragem do percurso, aqui em baixo.
              </p>
            )}

            <h3 className="parte-do-sentido">Percurso</h3>
            {s.variantes > 1 && (
              <p className="secundario">
                {s.variantes} percursos diferentes neste sentido. Mostra-se o mais servido (
                {plural(s.viagens_deste_percurso, 'viagem', 'viagens')}) — há viagens que não param
                em todas estas paragens.
              </p>
            )}
            {/* O PERCURSO DESENHADO NA COR DA LINHA, como nos mapas de rede:
                um fio com um nó por paragem, cheio nas pontas. Era uma lista
                numerada, com o número de ordem à direita a fazer de ruído, e
                a cor da linha não aparecia em lado nenhum além do distintivo. */}
            <ol className="percurso-da-linha" style={cor}>
              {s.paragens.map((p, i) => (
                <li
                  key={`${p.id}-${i}`}
                  className={i === 0 ? 'ponta primeira' : i === ultima ? 'ponta ultima' : undefined}
                >
                  <Link href={urlDaParagem(rid, p.id)}>{p.nome}</Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </>
  );
}
