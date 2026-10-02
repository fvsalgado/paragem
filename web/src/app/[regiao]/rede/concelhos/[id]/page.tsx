import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import {
  aPedido,
  concelhos,
  paragens,
  estacoes,
  exigirRegiao,
  linhas,
  linhaDetalhe,
  url,
  urlRede,
  urlDaParagem,
  modos as lerModos,
  NOME_DOS_MODOS,
  NAO_ENCONTRADA,
  type LinhaDetalhe,
  regiao,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import Distintivo from '@/componentes/Distintivo';
import { aAutoridade, lista, plural } from '@/lib/prosa';
import { paragemPrincipal, saidasDoConcelho } from '@/lib/concelho';
import { metadadosDaRegiao } from '@/lib/metadados';

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
  const [cs, r] = await Promise.all([concelhos(rid), regiao(rid)]);
  const c = cs.find((x) => x.id === id);
  if (!c || !r) return { title: NAO_ENCONTRADA };
  // Sem paragens não se fala de paragens: há concelhos servidos só por outros
  // modos, e «0 paragens» numa pré-visualização lê-se como uma avaria.
  const que = c.paragens
    ? `: ${plural(c.paragens, 'paragem', 'paragens')}, as linhas que lá passam e como sair do concelho`
    : '';
  return metadadosDaRegiao(r, {
    titulo: c.nome,
    descricao: `Os transportes em ${c.nome}${que}.`,
    caminho: urlRede(rid, `concelhos/${c.id}/`),
  });
}

/** Quantas horas de um tipo de dia se mostram antes de «e mais N». */
const HORAS_A_MOSTRAR = 6;

export default async function Concelho({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  const cs = await concelhos(rid);
  const c = cs.find((x) => x.id === id);
  if (!c) notFound();

  const r = await exigirRegiao(rid);
  const todas = await paragens(rid);
  const ps = todas.filter((p) => p.concelho === c.id);
  const es = (await estacoes(rid)).filter((e) => e.concelho === c.id);
  const pedido = await aPedido(rid);
  const indiceDeLinhas = await linhas(rid);

  // AS LINHAS DESTE CONCELHO, pelo identificador e não só pelo número: as
  // paragens dizem os NÚMEROS das linhas que lá param, e há números que se
  // repetem entre concessões. Lê-se a ficha de cada candidata e fica a que
  // passa mesmo aqui.
  const aqui = new Set(ps.map((p) => p.id));
  const codigos = new Set(ps.flatMap((p) => p.linhas));
  const candidatas = indiceDeLinhas.filter((l) => codigos.has(l.codigo));
  const detalhes = (await Promise.all(candidatas.map((l) => linhaDetalhe(rid, l.id)))).filter(
    (l): l is LinhaDetalhe =>
      !!l &&
      l.sentidos.some(
        (s) =>
          s.paragens.some((p) => aqui.has(p.id)) ||
          (s.quadro?.paragens ?? []).some((p) => aqui.has(p.id)),
      ),
  );
  const nomes = new Map(cs.map((x) => [x.id, x.nome]));
  const saidas = saidasDoConcelho(c.id, detalhes, todas, nomes);
  const principal = paragemPrincipal(ps).get(c.id) ?? null;
  const corDe = new Map(indiceDeLinhas.map((l) => [l.codigo, l.cor]));

  // O TRANSPORTE A PEDIDO DESTE CONCELHO, todo: as zonas dele, as ligações
  // entre concelhos que têm aqui uma ponta (o LINK), e os circuitos com
  // horário publicado. A página mostrava só a primeira zona — e havia
  // concelhos com seis, mais um horário de 28 viagens e uma ligação a outro.
  const zonas = (pedido?.zonas ?? []).filter(
    (z) => z.concelho === c.id || (z.entre ?? []).includes(c.id),
  );
  const horariosAPedido = (pedido?.horarios ?? []).filter((h) => h.concelho === c.id);
  const temAPedido = zonas.length > 0 || horariosAPedido.length > 0;

  // OS OUTROS MODOS, SÓ OS QUE HÁ AQUI. Cartões a dizer «nenhum aqui» e «por
  // levantar» ocupavam o mesmo espaço que os cheios, e o §3 diz que um modo
  // ausente não desenha secção. O que não se sabe (um levantamento por
  // fazer) diz-se numa frase, sem cartão.
  const outros = Object.entries(await lerModos(rid)).map(([m, d]) => ({
    modo: m,
    nome: NOME_DOS_MODOS[m] ?? m,
    // AS LINHAS CONTAM TAMBÉM: um urbano municipal é um traçado ou um
    // horário, e não um ponto — e a página dizia «sem registo neste concelho»
    // do urbano que corre de ponta a ponta da vila.
    quantos:
      d.sistemas.reduce((n, s) => n + s.estacoes.filter((e) => e.concelho === c.id).length, 0) +
      d.pontos.filter((x) => x.concelho === c.id).length +
      d.paragens.filter((x) => x.concelho === c.id).length +
      d.percursos.filter((x) => (x.concelhos ?? []).includes(c.id)).length +
      (d.horarios ?? []).filter((x) => x.concelho === c.id).length,
    incompleto: d.incompleto,
  }));
  const presentes = outros.filter((o) => o.quantos > 0).sort((a, b) => b.quantos - a.quantos);
  // OS QUE A REGIÃO TEM E ESTE CONCELHO NÃO, numa frase: quem mora cá tem o
  // direito de saber que o serviço existe na região e não aqui — mas sem um
  // cartão a ocupar o lugar de um cheio.
  const ausentes = outros.filter((o) => o.quantos === 0);
  const algumPorLevantar = ausentes.some((o) => o.incompleto);

  const numeros = [
    plural(ps.length, 'paragem', 'paragens'),
    plural(detalhes.length, 'linha', 'linhas'),
    es.length ? plural(es.length, 'estação de comboio', 'estações de comboio') : '',
    zonas.length
      ? plural(zonas.length, 'zona de transporte a pedido', 'zonas de transporte a pedido')
      : '',
  ].filter(Boolean);

  return (
    <>
      <h1>{c.nome}</h1>
      {/* «Município da <sigla>» cravava a contração no feminino: uma sigla
          masculina, ou uma autoridade que é ela própria um município, saía
          com o artigo errado. A contração vem da declaração da autoridade, ou
          fica com «a autoridade de transportes» (`prosa.ts`). */}
      <p>
        Distrito {c.distrito}.{' '}
        {r.autoridade?.tipo === 'municipio'
          ? c.membro
            ? ''
            : 'Fica fora do município, e a rede serve-o na mesma.'
          : c.membro
            ? `Município membro ${aAutoridade(r, 'de')}.`
            : `Não é município membro ${aAutoridade(r, 'de')}, e a rede serve-o na mesma.`}
      </p>
      <p className="secundario">{numeros.join(' · ')}.</p>
      <MarcaDeDados regiao={rid} />

      {/* «COMO SAIO DAQUI?», primeiro. É a pergunta de quem mora cá, e era a
          que a página não respondia: as linhas eram números soltos, sem
          destino nem ligação. Os destinos saem das viagens que param no
          concelho (`lib/concelho.ts`). */}
      {saidas.length > 0 && (
        <section aria-labelledby="c-sair">
          {/* «Sair do concelho», e não «Sair de Porto»: o artigo de um concelho
              não está nos dados («do Porto», «da Guarda»), e não se
              adivinha. */}
          <h2 id="c-sair">Sair do concelho</h2>
          <p className="secundario">
            Para onde se vai daqui de autocarro, sem mudar, e a que horas sai do concelho.
          </p>
          <ul className="saidas">
            {saidas.slice(0, 6).map((sd) => (
              <li key={sd.chave}>
                <h3>{sd.nome}</h3>
                <p className="linhas-da-saida">
                  <span className="so-para-leitores">
                    {sd.linhas.length === 1 ? 'Linha ' : 'Linhas '}
                  </span>
                  {sd.linhas.map((l) => (
                    <Distintivo key={l.id} codigo={l.codigo} cor={l.cor} />
                  ))}
                </p>
                {sd.porDia.slice(0, 2).map(({ dia, horas }) => (
                  <p key={dia} className="horas-da-saida">
                    <strong>{dia}:</strong> {horas.slice(0, HORAS_A_MOSTRAR).join(', ')}
                    {horas.length > HORAS_A_MOSTRAR && ` e mais ${horas.length - HORAS_A_MOSTRAR}`}
                  </p>
                ))}
                {sd.porDia.length > 2 && (
                  <p className="secundario">
                    E noutros dias:{' '}
                    {sd.porDia
                      .slice(2)
                      .map((d) => d.dia)
                      .join('; ')}
                    .
                  </p>
                )}
                <p className="cartao-accoes">
                  <Link
                    href={url(
                      rid,
                      `/viagem/?${new URLSearchParams({
                        ...(principal ? { de: principal.nome } : {}),
                        para: sd.para,
                      }).toString()}`,
                    )}
                  >
                    Como chegar a {sd.nome}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
          {saidas.length > 6 && (
            <p>
              <strong>Mais destinos:</strong> {lista(saidas.slice(6).map((sd) => sd.nome))}.
            </p>
          )}
        </section>
      )}

      {/* O A PEDIDO VEM ANTES DAS LINHAS, e é de propósito: num concelho
          rural há freguesias sem carreira nenhuma, e para quem mora lá esta é
          a única secção desta página que responde. */}
      {temAPedido && (
        <section aria-labelledby="c-a-pedido">
          <h2 id="c-a-pedido">Transporte a pedido</h2>
          <div className="faixa a-pedido">
            <p>
              Só circula se alguém o reservar
              {pedido?.reservas.prazo
                ? ` — ${pedido.reservas.prazo.charAt(0).toLowerCase()}${pedido.reservas.prazo.slice(1)}`
                : ''}
              .
            </p>
            {zonas.length > 0 && (
              <ul className="zonas-do-concelho">
                {zonas.map((z) => (
                  <li key={z.id}>
                    {z.circuitos.length
                      ? `${plural(z.circuitos.length, 'circuito', 'circuitos')} na zona ${z.nome}`
                      : z.entre?.length
                        ? `${z.nome}, ligação entre concelhos`
                        : `Zona ${z.nome}`}
                  </li>
                ))}
              </ul>
            )}
            {horariosAPedido.map((h) => (
              <p key={h.id}>
                <Link href={url(rid, `a-pedido/#tap-${h.id}`)}>
                  O horário dos circuitos do concelho
                  {h.circuito_de ? ` — ${h.circuito_de}` : ''}
                </Link>{' '}
                ({plural(h.viagens, 'viagem', 'viagens')}).
              </p>
            ))}
            <p className="cartao-accoes">
              {pedido?.reservas.telefone && (
                <a className="botao" href={`tel:${pedido.reservas.telefone}`}>
                  Ligar {pedido.reservas.telefone_apresentado ?? pedido.reservas.telefone}
                </a>
              )}
              <Link href={url(rid, 'a-pedido/')}>Como funciona</Link>
            </p>
          </div>
        </section>
      )}

      {detalhes.length > 0 && (
        <section aria-labelledby="c-linhas">
          <h2 id="c-linhas">Linhas que passam aqui</h2>
          <ul className="linhas-do-concelho">
            {detalhes
              .slice()
              .sort((a, b) => a.ordem.localeCompare(b.ordem))
              .map((l) => (
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

      {es.length > 0 && (
        <section aria-labelledby="c-estacoes">
          <h2 id="c-estacoes">Estações de comboio</h2>
          <ul className="lista">
            {es.map((e) => (
              <li key={e.id}>
                <Link href={urlRede(rid, `estacoes/${e.id.replace(/[^a-zA-Z0-9\-_]/g, '-')}/`)}>
                  <span>{e.nome}</span>
                  <span className="secundario">
                    {e.sem_ligacao ? 'sem autocarro perto' : 'com autocarro perto'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(presentes.length > 0 || ausentes.length > 0) && (
        <section aria-labelledby="c-outros">
          <h2 id="c-outros">Outros transportes</h2>
          {presentes.length > 0 && (
            <ul className="lista">
              {presentes.map((o) => (
                <li key={o.modo}>
                  <Link className={`cartao modo-${o.modo}`} href={url(rid, `modos/${o.modo}/`)}>
                    <span>{o.nome}</span>
                    <span className="secundario">{o.quantos}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {ausentes.length > 0 && (
            <p className="secundario">
              Sem registo neste concelho: {lista(ausentes.map((o) => o.nome))}.
              {algumPorLevantar &&
                ' Onde o levantamento ainda não está completo, não quer dizer que não haja — quer dizer que ainda não está nos dados.'}
            </p>
          )}
        </section>
      )}

      {/* AS PARAGENS, com o nome por inteiro e as linhas por baixo. Lado a
          lado, a coluna das linhas espremia o nome até o partir letra a letra
          («Abran / tes / (Termi / nal)») — precisamente nas paragens com mais
          linhas, que são as que se procuram. Muitas, ficam fechadas. */}
      <section aria-labelledby="c-paragens">
        <h2 id="c-paragens">Paragens</h2>
        <details className="paragens-do-concelho" open={ps.length <= 30}>
          <summary>
            {ps.length === 1 ? 'A paragem do concelho' : `As ${ps.length} paragens do concelho`}
          </summary>
          <ul className="lista paragens-com-linhas">
            {ps.slice(0, 300).map((p) => (
              <li key={p.id}>
                <Link href={urlDaParagem(rid, p.id)}>
                  <span className="nome">{p.nome}</span>
                  {p.linhas.length > 0 && (
                    <span className="linhas-da-paragem">
                      <span className="so-para-leitores">Linhas </span>
                      {p.linhas.map((codigo) => (
                        <Distintivo key={codigo} codigo={codigo} cor={corDe.get(codigo)} />
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          {ps.length > 300 && (
            <p className="secundario">
              São {ps.length} ao todo; mostram-se as primeiras 300. A lista inteira está em{' '}
              <Link href={urlRede(rid, 'paragens/')}>Paragens</Link>.
            </p>
          )}
        </details>
      </section>
    </>
  );
}
