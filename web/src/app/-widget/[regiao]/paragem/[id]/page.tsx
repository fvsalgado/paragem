import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PartidasDaCaixa from '@/componentes/widget/PartidasDaCaixa';
import { compactar, exigirModo, linhas, paragem as lerParagem, regiao } from '@/lib/dados';
import { nomeDaRede } from '@/lib/prosa';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}): Promise<Metadata> {
  const { regiao: rid, id } = await params;
  const ficha = await lerParagem(rid, id);
  return { title: ficha ? `Próximas partidas · ${ficha.paragem.nome}` : 'Próximas partidas' };
}

/**
 * As próximas partidas de uma paragem, numa caixa para o sítio de uma câmara,
 * de uma junta, de uma escola (P4-007).
 *
 * É O MESMO «A SEGUIR» DA PÁGINA DA PARAGEM (`ProximasPartidas`): calcula-se
 * no navegador de quem lê, com a hora dele, porque a caixa é servida da cache
 * e a hora não. As ligações abrem noutro separador — quem está no sítio da
 * câmara não sai de lá sem querer — e dizem-no.
 */
export default async function CaixaDaParagem({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const [ficha, r, catalogo] = await Promise.all([lerParagem(rid, id), regiao(rid), linhas(rid)]);
  if (!ficha || !r) notFound();
  const cores = Object.fromEntries(catalogo.map((l) => [l.id, l.cor]));
  const pagina = `/rede/paragens/${encodeURIComponent(ficha.paragem.id)}/`;
  return (
    <section className="caixa" aria-labelledby="caixa-titulo">
      <h1 id="caixa-titulo" className="titulo-da-caixa">
        <a href={pagina} target="_blank" rel="noopener">
          {ficha.paragem.nome}
          <span className="so-para-leitores"> (abre noutro separador)</span>
        </a>
      </h1>
      <PartidasDaCaixa regiao={rid} partidas={compactar(ficha.partidas)} cores={cores} />
      <p className="rodape-da-caixa">
        Horários planeados, não em tempo real.{' '}
        <a href={pagina} target="_blank" rel="noopener">
          Horário completo<span className="so-para-leitores"> (abre noutro separador)</span>
        </a>
      </p>
      <p className="assinatura-da-caixa">{nomeDaRede(r)} · Paragem.pt</p>
    </section>
  );
}
