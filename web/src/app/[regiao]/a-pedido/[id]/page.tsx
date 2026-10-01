import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { aPedido, exigirRegiao, url, urlRede, NAO_ENCONTRADA } from '@/lib/dados';
import QuadroDeHorario from '@/componentes/QuadroDeHorario';
import Transcricao from '@/componentes/Transcricao';
import AbrirPeloEndereco from '@/componentes/AbrirPeloEndereco';
import { idDoQuadro } from '@/lib/a-pedido';
import { plural } from '@/lib/prosa';

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
  const h = (await aPedido(rid))?.horarios.find((x) => x.id === id);
  return { title: h ? h.nome : NAO_ENCONTRADA };
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
      <h1>{h.nome}</h1>
      <p className="secundario">
        {[
          plural(h.paragens.length, 'paragem', 'paragens'),
          // A TABELA DE PARTIDAS NÃO TEM VIAGENS, e dizer «0 viagens» era
          // anunciar um serviço que não existe.
          h.viagens > 0 ? plural(h.viagens, 'viagem', 'viagens') : 'tabela de partidas',
        ].join(' · ')}
      </p>

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
          {v.online && (
            <a href={v.online} rel="noreferrer">
              Reservar online
            </a>
          )}
        </p>
        {v.telefone_nota && <p className="secundario">{v.telefone_nota}</p>}
      </div>

      {h.regras.map((regra) => (
        <p key={regra}>{regra}</p>
      ))}

      <h2>{h.quadros.length === 1 ? 'O horário' : 'Os circuitos'}</h2>
      <p className="secundario">
        {h.quadros.length === 1 ? 'Toca no quadro' : 'Toca num circuito'} para ver as horas, paragem
        a paragem.
      </p>
      {h.quadros.map((q, iq) => (
        <QuadroDeHorario key={iq} quadro={q} titulo={h.nome} id={ids[iq]} />
      ))}
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
