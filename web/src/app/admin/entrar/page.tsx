import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { entrar } from '@/lib/painel/acoes';
import { sessaoAtual } from '@/lib/painel/autenticacao';
import { destinoSeguro } from '@/lib/painel/guarda';
import { inicioDe } from '@/lib/painel/papeis';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Entrar' };

interface Props {
  searchParams: Promise<{ destino?: string; erro?: string; email?: string; ate?: string }>;
}

/*
 * A MENSAGEM NÃO DIZ SE O EMAIL EXISTE. «Esse email não tem conta» e
 * «palavra-passe errada» são duas respostas, e quem tenta às cegas aprende com
 * a diferença qual dos dois acertou. É uma frase só, para os dois casos.
 *
 * A do limite diz a hora, que é o que quem está do outro lado precisa de saber,
 * e diz porquê — sem sugerir um ataque a uma equipa que só se enganou a
 * escrever. São as frases do painel do Coreto, letra a letra: os dois painéis
 * são da mesma casa, e respondiam ao mesmo engano com duas frases diferentes.
 */
function mensagem(erro: string | undefined, ate: string | undefined): string | undefined {
  if (erro === 'credenciais') return 'O email ou a palavra-passe não estão certos.';
  if (erro === 'demasiadas') {
    // A hora vem da barra de endereços: só se mostra se tiver a forma de uma.
    const hora = ate && /^\d{2}h\d{2}$/.test(ate) ? ate : null;
    return (
      'Foram feitas demasiadas tentativas com a palavra-passe errada, a partir desta rede ou ' +
      `para este email. ${hora ? `Podes voltar a tentar às ${hora}.` : 'Podes voltar a tentar daqui a um quarto de hora.'}`
    );
  }
  if (erro === 'configuracao') return 'O painel ainda não está configurado.';
  return undefined;
}

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

  const erro = mensagem(params.erro, params.ate);

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
