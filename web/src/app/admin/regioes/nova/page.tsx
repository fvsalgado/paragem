import type { Metadata } from 'next';
import Link from 'next/link';
import Aviso from '@/componentes/painel/Aviso';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { criarRegiao } from '@/lib/painel/acoes';
import { paginaDoDono } from '@/lib/painel/autenticacao';
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
  ['as', 'as — «as Terras do Ameno»'],
] as const;

/**
 * A linha de uma região nova.
 *
 * NÃO É UMA MIGRAÇÃO, e é por isso que este formulário existe: as migrações
 * trazem o produto e a sua demonstração, e o nome de um cliente numa migração
 * era o nome de um cliente publicado (`docs/BASE-DE-DADOS.md`). A região
 * nasce DESLIGADA — liga-se na ficha quando os dados dela estiverem
 * publicados. Os quatro valores são os do `regiao.yaml` dela, letra a letra; o
 * CI compara os dois e reprova a diferença — e isso diz-se a quem gere a
 * instalação, no fim, e não a quem preenche o formulário, no meio dele.
 */
export default async function NovaRegiao({ searchParams }: Props) {
  const params = await searchParams;
  // Criar uma região é uma decisão comercial: só o dono.
  await paginaDoDono();
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Nova região" />;

  return (
    <>
      <h1>Nova região</h1>
      <p className="entrada">
        A região nasce desligada: ninguém a vê até a ligares na ficha dela, depois de os dados
        estarem publicados. O nome e o artigo não se mudam depois — são os da declaração da região.
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
          spellCheck={false}
          defaultValue={params.id ?? ''}
          aria-describedby="id-ajuda"
        />
        <p id="id-ajuda" className="secundario-texto">
          Minúsculas, algarismos e hífens, como <code>serra-da-pedra-alta</code>. Não muda depois.
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

        <label htmlFor="dominio">Endereço</label>
        <input
          id="dominio"
          name="dominio"
          type="text"
          required
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          defaultValue={params.dominio ?? ''}
          aria-describedby="dominio-ajuda"
        />
        <p id="dominio-ajuda" className="secundario-texto">
          Só o domínio, sem https:// — um subdomínio do Paragem.pt (<code>serra.paragem.pt</code>)
          ou o domínio da autoridade.
        </p>

        <label htmlFor="ordem">Posição na lista</label>
        <input
          id="ordem"
          name="ordem"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={params.ordem ?? '10'}
          aria-describedby="ordem-ajuda"
        />
        <p id="ordem-ajuda" className="secundario-texto">
          Os números mais baixos aparecem primeiro, aqui e na página do Paragem.pt.
        </p>

        <button type="submit">Criar a região, desligada</button>
      </form>

      <details className="para-quem-gere">
        <summary>Para quem gere a instalação</summary>
        <p>
          O identificador é a pasta da região em <code>regioes/</code>; o nome, o artigo e o
          endereço são os do <code>regiao.yaml</code> dela (<code>dominio:</code>), letra a letra —
          o CI compara a base com o ficheiro e reprova a diferença. O domínio tem de entrar também
          no projeto da plataforma (<code>docs/NOVA-REGIAO.md</code>, passo 4).
        </p>
      </details>

      <p>
        <Link href="/admin/">Todas as regiões</Link>
      </p>
    </>
  );
}
