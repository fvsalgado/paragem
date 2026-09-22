import type { Metadata } from 'next';
import Link from 'next/link';
import Aviso from '@/componentes/painel/Aviso';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { criarRegiao } from '@/lib/painel/acoes';
import { temChaveDeServico } from '@/lib/painel/base';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Nova região' };

interface Props {
  searchParams: Promise<{
    aviso?: string;
    id?: string;
    nome?: string;
    artigo?: string;
    dominio?: string;
    ordem?: string;
  }>;
}

const ARTIGOS = [
  ['o', 'o — «o Baixo Sável»'],
  ['a', 'a — «a Serra da Pedra Alta»'],
  ['os', 'os'],
  ['as', 'as — «as Terras de …»'],
] as const;

/**
 * A linha de uma região nova.
 *
 * NÃO É UMA MIGRAÇÃO, e é por isso que este formulário existe: as migrações
 * trazem o produto e a sua demonstração, e o nome de um cliente numa migração
 * era o nome de um cliente publicado (`docs/BASE-DE-DADOS.md`). A região
 * nasce DESLIGADA — liga-se na ficha quando os dados dela estiverem no
 * armazém. Os quatro valores são os do `regiao.yaml` dela, letra a letra; o
 * CI compara os dois e reprova a diferença.
 */
export default async function NovaRegiao({ searchParams }: Props) {
  const params = await searchParams;
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Nova região" />;

  return (
    <>
      <h1>Nova região</h1>
      <p className="entrada">
        A região nasce desligada, com o que o <code>regiao.yaml</code> dela declara: o identificador
        é a pasta em <code>regioes/</code>, o nome e o artigo são os que lá estão, o domínio é o{' '}
        <code>dominio:</code>. O CI confere que a base e o ficheiro dizem o mesmo (
        <code>docs/NOVA-REGIAO.md</code>).
      </p>

      <Aviso texto={params.aviso} />

      <form action={criarRegiao} className="formulario">
        <label htmlFor="id">Identificador</label>
        <input
          id="id"
          name="id"
          type="text"
          required
          pattern="[a-z0-9][a-z0-9-]{0,63}"
          autoComplete="off"
          defaultValue={params.id ?? ''}
          aria-describedby="id-ajuda"
        />
        <p id="id-ajuda" className="secundario-texto">
          Minúsculas, dígitos e hífens; não muda depois.
        </p>

        <label htmlFor="nome">Nome</label>
        <input id="nome" name="nome" type="text" required defaultValue={params.nome ?? ''} />

        <label htmlFor="artigo">Artigo do nome</label>
        <select id="artigo" name="artigo" required defaultValue={params.artigo ?? 'o'}>
          {ARTIGOS.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>

        <label htmlFor="dominio">Domínio canónico</label>
        <input
          id="dominio"
          name="dominio"
          type="text"
          required
          inputMode="url"
          autoComplete="off"
          defaultValue={params.dominio ?? ''}
          aria-describedby="dominio-ajuda"
        />
        <p id="dominio-ajuda" className="secundario-texto">
          Sem esquema nem barra: <code>&lt;subdominio&gt;.paragem.pt</code>, ou o domínio da
          autoridade. Entra também no projeto da plataforma, à parte.
        </p>

        <label htmlFor="ordem">Ordem na montra</label>
        <input
          id="ordem"
          name="ordem"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={params.ordem ?? '10'}
        />

        <button type="submit">Criar a região, desligada</button>
      </form>

      <p>
        <Link href="/admin/">Todas as regiões</Link>
      </p>
    </>
  );
}
