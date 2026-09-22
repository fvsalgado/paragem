import type { Metadata } from 'next';
import { exigirRegiao } from '@/lib/dados';
import Cabecalho from '@/componentes/Cabecalho';
import Rodape from '@/componentes/Rodape';
import MarcaDeDemonstracao from '@/componentes/MarcaDeDemonstracao';

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

/**
 * O que é de uma região: o cabeçalho, o rodapé e o título.
 *
 * Os caminhos estáticos são a lista VAZIA, e é isso que faz uma região nova
 * entrar sem um commit de código (§11.5) no modelo novo (§11.7): uma região
 * existe se os dados dela estiverem no armazém e o painel não a tiver
 * desligado, e a primeira visita a cada página rende-a e guarda-a. Não se
 * enumera nada na construção — a construção não precisa de dados nenhuns.
 *
 * `revalidate` é o prazo de validade de cada página desta região: uma hora,
 * a menos que o pipeline mande deitar fora antes (`/api/revalidate`). É o
 * mesmo número da cache de dados, de propósito — dois prazos diferentes eram
 * uma página nova a mostrar dados velhos.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: id } = await params;
  const r = await exigirRegiao(id);
  return {
    title: {
      default: `Paragem.pt — ${r.nome_com_artigo}`,
      template: `%s · Paragem.pt`,
    },
    description: `Todos os transportes ${r.de}, num sítio só.`,
  };
}

export default async function LayoutDaRegiao({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ regiao: string }>;
}) {
  const { regiao: id } = await params;
  // A região que não existe — ou que o painel desligou — é 404 aqui, antes de
  // qualquer página lá dentro tentar ler o que não há.
  await exigirRegiao(id);
  return (
    <>
      <Cabecalho regiao={id} />
      <main id="conteudo" className="pagina">
        <MarcaDeDemonstracao regiao={id} />
        {children}
      </main>
      <Rodape regiao={id} />
    </>
  );
}
