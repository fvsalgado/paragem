import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { entrar } from '@/lib/painel/acoes';
import { sessaoAtual } from '@/lib/painel/autenticacao';
import { destinoSeguro } from '@/lib/painel/guarda';
import { inicioDe } from '@/lib/painel/papeis';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Entrar' };

interface Props {
  searchParams: Promise<{ destino?: string; erro?: string; email?: string }>;
}

/*
 * A MENSAGEM NÃO DIZ SE O EMAIL EXISTE. «Esse email não tem conta» e
 * «palavra-passe errada» são duas respostas, e quem tenta às cegas aprende com
 * a diferença qual dos dois acertou. É uma frase só, para os dois casos.
 */
const MENSAGENS: Record<string, string> = {
  credenciais: 'Email ou palavra-passe incorretos.',
  demasiadas:
    'Demasiadas tentativas falhadas. Tenta outra vez daqui a um quarto de hora — ou pede ajuda a quem gere o painel.',
  configuracao: 'O painel ainda não está configurado.',
};

/**
 * A porta: o email e a palavra-passe de cada pessoa (0009).
 *
 * O dono entra com a palavra-passe do ambiente, como sempre entrou — e com o
 * email declarado em `ADMIN_EMAIL`, quando está; sem ele, com qualquer email.
 * As outras pessoas entram com o email e a palavra-passe que escolheram ao
 * abrir a ligação que o dono lhes mandou. Sem configuração a porta não abre —
 * e diz porquê a quem a saiba ler.
 */
export default async function Entrar({ searchParams }: Props) {
  const portao = await sessaoAtual();
  if (portao.ok) redirect(inicioDe(portao));

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
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          spellCheck={false}
          defaultValue={params.email ?? ''}
        />
        <label htmlFor="senha">Palavra-passe</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        <button type="submit">Entrar</button>
      </form>
      <p className="secundario-texto">
        Ainda não tens palavra-passe, ou esqueceste-a? Pede a quem gere o painel uma ligação para a
        escolher: chega-te pelo meio que usarem, e vale sete dias.
      </p>
    </>
  );
}
