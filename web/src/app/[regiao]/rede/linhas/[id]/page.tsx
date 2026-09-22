import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { exigirModo, linhas, linhaDetalhe, urlRede, urlDaParagem } from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import Distintivo from '@/componentes/Distintivo';

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
  return { title: l ? `${l.codigo} — ${l.nome}` : 'Linha' };
}

const NOME_DO_SENTIDO: Record<string, string> = { '0': 'Ida', '1': 'Volta' };

export default async function Linha({
  params,
}: {
  params: Promise<{ regiao: string; id: string }>;
}) {
  const { regiao: rid, id } = await params;
  await exigirModo(rid, 'autocarro');
  const l = await linhaDetalhe(rid, id);
  if (!l) notFound();

  return (
    <>
      <h1>
        <Distintivo codigo={l.codigo} cor={l.cor} /> {l.nome}
      </h1>
      <p>
        {l.viagens} viagens no horário.
        {/* «GERIDO POR …», que é o §1 por extenso: quem viaja não precisa de
          saber quem gere cada serviço para o encontrar, mas precisa de o saber
          para comprar o título certo. Só aparece nas linhas que NÃO são da
          rede da região — pô-lo em todas fazia da entidade o assunto, que é o
          contrário do que o briefing pede. */}
        {l.operador && (
          <>
            {' '}
            <span className="secundario">Gerido por {l.operador}.</span>
          </>
        )}
      </p>
      <MarcaDeDados regiao={rid} />

      {l.sentidos.map((s) => (
        <section key={s.sentido}>
          <h2>{NOME_DO_SENTIDO[s.sentido] ?? `Sentido ${s.sentido}`}</h2>
          <p className="secundario">
            {s.viagens} viagens
            {s.variantes > 1 && (
              <>
                {' '}
                em {s.variantes} percursos diferentes. Mostra-se o mais servido (
                {s.viagens_deste_percurso} viagens) —{' '}
                <strong>há viagens que não param em todas estas paragens</strong>.
              </>
            )}
          </p>
          <ol className="lista">
            {s.paragens.map((p, i) => (
              <li key={`${p.id}-${i}`}>
                <Link href={urlDaParagem(rid, p.id)}>
                  <span>{p.nome}</span>
                  <span className="secundario">{i + 1}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
