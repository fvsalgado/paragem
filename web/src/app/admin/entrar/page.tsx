import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { entrar } from '@/lib/painel/acoes';
import { sessaoAtual } from '@/lib/painel/autenticacao';
import { destinoSeguro } from '@/lib/painel/guarda';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Entrar' };

interface Props {
  searchParams: Promise<{ destino?: string; erro?: string }>;
}

const MENSAGENS: Record<string, string> = {
  credenciais: 'Palavra-passe incorreta.',
  demasiadas: 'Demasiadas tentativas. Tenta daqui a um quarto de hora.',
  configuracao: 'O painel ainda não está configurado.',
};

/**
 * A porta. Uma palavra-passe e mais nada: não há contas nem registo, porque
 * quem entra aqui é quem responde pelo produto. Sem configuração a porta não
 * abre — e diz porquê a quem a saiba ler.
 */
export default async function Entrar({ searchParams }: Props) {
  const portao = await sessaoAtual();
  if (portao.ok) redirect('/admin/');

  const params = await searchParams;

  if (portao.razao === 'por-configurar') {
    return (
      <>
        <h1>Painel por configurar</h1>
        <p>
          Faltam as variáveis <code>ADMIN_PASSWORD_HASH</code> e <code>ADMIN_SESSION_SECRET</code>{' '}
          no ambiente do servidor. A primeira gera-se com <code>node scripts/senha.mjs</code>; a
          segunda é uma cadeia aleatória com pelo menos 32 caracteres. Enquanto faltarem, esta área
          não abre — que é o comportamento pretendido (<code>docs/PAINEL.md</code>).
        </p>
      </>
    );
  }

  const erro = params.erro ? MENSAGENS[params.erro] : undefined;

  return (
    <>
      <h1>Entrar no painel</h1>
      {erro ? (
        <p role="alert" className="faixa alerta">
          {erro}
        </p>
      ) : null}
      <form action={entrar} className="formulario">
        <input type="hidden" name="destino" value={destinoSeguro(params.destino)} />
        <label htmlFor="senha">Palavra-passe</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        <button type="submit">Entrar</button>
      </form>
    </>
  );
}
