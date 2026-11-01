import { notFound } from 'next/navigation';
import Link from '@/componentes/Ligacao';
import type { Metadata } from 'next';
import { nomeDoSistema } from '@/lib/prosa';
import { aPedido, exigirRegiao, tarifas, url, urlRede, NAO_ENCONTRADA, regiao } from '@/lib/dados';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao, { DataDoDocumento } from '@/componentes/Transcricao';
import AbrirPeloEndereco from '@/componentes/AbrirPeloEndereco';
import {
  caminhoDoHorario,
  concelhoDoCircuito,
  idDoQuadro,
  reservaOnlineDoHorario,
} from '@/lib/a-pedido';
import { lista, plural, regraLegivel } from '@/lib/prosa';
import { metadadosDaRegiao } from '@/lib/metadados';

/**
 * VAZIO DE PROPÓSITO, E NÃO SE APAGA. Sem `generateStaticParams`, o Next trata
 * uma rota com segmento dinâmico como DINÂMICA: rende-a a cada pedido e manda
 * `no-store`. Com a função a devolver uma lista vazia, a rota é «estática com
 * caminhos a pedido»: a primeira visita rende e guarda, as seguintes servem a
 * cópia, até ao `revalidate` ou ao sinal do pipeline.
 */
export function generateStaticParams() {
  return [];
}

type Params = { regiao: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { regiao: rid, id } = await params;
  const [d, r] = await Promise.all([aPedido(rid), regiao(rid)]);
  const h = d?.horarios.find((x) => x.id === id);
  if (!h || !r) return { title: NAO_ENCONTRADA };
  return metadadosDaRegiao(r, {
    titulo: nomeDoSistema(h.nome),
    descricao: `${nomeDoSistema(h.nome)}: o horário do transporte a pedido ${r.em}, e como reservar.`,
    caminho: url(rid, caminhoDoHorario(h.id)),
  });
}

/**
 * O HORÁRIO DE UM GRUPO DE CIRCUITOS A PEDIDO — uma brochura, um folheto.
 *
 * Estavam todos na página do transporte a pedido, com as tabelas todas: 833 kB
 * de HTML e dez mil elementos, que um telemóvel levava cinco segundos a
 * pintar. Cada grupo tem agora a sua página, e a do modo fica com a regra, a
 * procura pela terra e as zonas.
 *
 * **A REGRA VEM PRIMEIRO, outra vez.** Quem chega aqui por uma ligação direta
 * — a procura, uma partilha — não passou pela página do modo, e um circuito
 * que ninguém chama não passa: o prazo e o telefone vêm antes das horas.
 */
export default async function HorarioAPedido({ params }: { params: Promise<Params> }) {
  const { regiao: rid, id } = await params;
  await exigirRegiao(rid);
  const d = await aPedido(rid);
  const h = d?.horarios.find((x) => x.id === id);
  if (!d || !h) notFound();
  const { reservas: v } = d;
  // O PREÇO, QUANDO A RECEITA DIZ QUE TÍTULOS SE PAGAM AQUI. A página de um
  // folheto de ligações entre cidades não dizia quanto custa — o preço só estava no tarifário.
  const t = h.tarifas?.length ? await tarifas(rid) : null;
  const precos = (t?.titulos ?? []).filter(
    (x) => h.tarifas!.includes(x.id) && typeof x.valor === 'number',
  );
  const euros = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: t?.moeda ?? 'EUR' });
  // QUE TERRAS LIGA, numa tabela de partidas: a primeira pergunta de quem
  // chega a um folheto de ligações era «que cidades liga?», e a resposta só aparecia ao abrir
  // a tabela.
  const partidas = h.quadros.filter((q) => q.tipo === 'partidas');
  const terras = [...new Set(partidas.flatMap((q) => q.paragens))];
  const porDia = Math.max(0, ...partidas.flatMap((q) => (q.horas ?? []).map((x) => x.length)));
  // UM GRUPO QUE NÃO É DE CONCELHO NENHUM diz o concelho de cada circuito, pela
  // zona onde o catálogo o põe: «Circuito Amarelo» sozinho não diz a ninguém
  // de que concelho é.
  const comConcelho = (q: (typeof h.quadros)[number]) => {
    if (h.concelho || !q.nome) return q;
    const c = concelhoDoCircuito(d, q.nome);
    return c ? { ...q, nome: `${c} — ${q.nome}` } : q;
  };
  // A RESERVA ONLINE SÓ ONDE ELA SERVE. Esta página mostrava a ligação sempre
  // que a região tinha reserva online — e a página geral, na mesma região,
  // dizia que ela só servia alguns serviços: quem a seguisse daqui não
  // conseguia reservar. Onde não serve, fica o telefone com o horário dele.
  const online = v.online ? reservaOnlineDoHorario(d, h) : null;
  // UM IDENTIFICADOR POR QUADRO, para as ligações da procura e das zonas
  // apontarem o circuito certo. Dois quadros com o mesmo nome na mesma folha
  // não podem ter o mesmo: o segundo leva o número de ordem.
  const usados = new Set<string>();
  const ids = h.quadros.map((q) => {
    if (!q.nome) return undefined;
    let i = idDoQuadro(q.nome);
    for (let n = 2; usados.has(i); n++) i = `${idDoQuadro(q.nome)}-${n}`;
    usados.add(i);
    return i;
  });

  return (
    <>
      <AbrirPeloEndereco />
      <h1>{nomeDoSistema(h.nome)}</h1>
      <p className="secundario">
        {[
          plural(h.paragens.length, 'paragem', 'paragens'),
          // A TABELA DE PARTIDAS NÃO TEM VIAGENS, e dizer «0 viagens» era
          // anunciar um serviço que não existe.
          h.viagens > 0 ? plural(h.viagens, 'viagem', 'viagens') : 'tabela de partidas',
        ].join(' · ')}
      </p>
      {terras.length > 1 && (
        <p>
          Liga {lista(terras)}
          {porDia > 0 ? ` — até ${plural(porDia, 'partida', 'partidas')} por dia de cada uma` : ''}.
        </p>
      )}
      {precos.length > 0 && (
        <p>
          {precos.map((x, i) => (
            <span key={x.id}>
              {i > 0 ? ' · ' : ''}
              {precos.length > 1 ? `${x.nome}: ` : 'Cada viagem: '}
              <strong className="preco-em-linha">
                {x.valor === 0 ? 'grátis' : euros.format(x.valor!)}
              </strong>
              {!x.confirmado && (
                <>
                  {' '}
                  <span className="por-confirmar">por confirmar</span>
                </>
              )}
            </span>
          ))}
          . <Link href={urlRede(rid, 'tarifario/')}>Ver o tarifário</Link>
        </p>
      )}

      <div className="faixa a-pedido">
        <p>
          <strong>Só passa se alguém o reservar</strong>
          {v.prazo ? ` — ${v.prazo.charAt(0).toLowerCase()}${v.prazo.slice(1)}` : ''}. Estas horas
          só se cumprem com reserva feita.
        </p>
        <p className="cartao-accoes">
          {v.telefone && (
            <a className="botao" href={`tel:${v.telefone}`}>
              Ligar {v.telefone_apresentado ?? v.telefone}
            </a>
          )}
          {v.online && online?.serve !== false && (
            <a href={v.online} rel="noreferrer">
              Reservar online
            </a>
          )}
        </p>
        {v.telefone_nota && <p className="secundario">{v.telefone_nota}</p>}
        {online?.serve === false && v.telefone && (
          <p>
            {h.quadros.length === 1
              ? 'Este circuito reserva-se pelo telefone: a reserva online não o serve.'
              : 'Estes circuitos reservam-se pelo telefone: a reserva online não os serve.'}
          </p>
        )}
        {online?.so.length ? (
          <p>
            A reserva online só serve {online.so.length === 1 ? 'a zona' : 'as zonas'}{' '}
            {lista(online.so)}; nas outras zonas, reserva-se pelo telefone.
          </p>
        ) : null}
        {/* AS REGRAS DA FOLHA DENTRO DA CAIXA DA RESERVA, e não soltas por
            baixo dela: é o que se tem de saber antes de contar com uma hora —
            e um horário que é o exemplo de um dia lia-se, cá fora, como o
            horário do circuito (auditoria de 1/11/2026). */}
        {h.regras.map((regra) => (
          <p key={regra}>{regraLegivel(regra)}</p>
        ))}
      </div>

      <h2>{h.quadros.length === 1 ? 'O horário' : 'Os circuitos'}</h2>
      {h.quadros.length > 1 && (
        <p className="secundario">Toque num circuito para ver as horas, paragem a paragem.</p>
      )}
      {/* UM QUADRO SÓ VEM ABERTO: não há o que escolher, e as horas eram o
          segundo toque de quem chegava. */}
      {h.quadros.map((q, iq) => (
        <QuadroDeHorario
          key={iq}
          quadro={comConcelho(q)}
          titulo={nomeDoSistema(h.nome)}
          id={ids[iq]}
          aberto={h.quadros.length === 1}
        />
      ))}
      <DataDoDocumento conteudo={h.conteudo_de} documento="o documento" />
      <Transcricao por={h.transcrito_por} em={h.transcrito_em} de="da brochura" />

      <p className="cartao-accoes">
        <Link href={url(rid, 'a-pedido/')}>Todo o transporte a pedido</Link>
        {h.concelho && (
          <Link href={urlRede(rid, `concelhos/${h.concelho}/`)}>O concelho {h.concelho_nome}</Link>
        )}
      </p>
    </>
  );
}
