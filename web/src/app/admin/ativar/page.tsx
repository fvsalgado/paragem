import type { Metadata } from 'next';
import Link from 'next/link';
import { createHash } from 'node:crypto';
import { ativarConta } from '@/lib/painel/acoes-das-pessoas';
import { temChaveDeServico } from '@/lib/painel/base';
import { porExtenso } from '@/lib/fuso';
import { lerLigacao, type LeituraDaLigacao } from '@/lib/painel/pessoas';
import { COMPRIMENTO_MINIMO } from '@/lib/painel/senha';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Escolher a palavra-passe' };

interface Props {
  searchParams: Promise<{ t?: string; erro?: string; mensagem?: string }>;
}

const PROBLEMAS: Record<Exclude<LeituraDaLigacao['estado'], 'valida'>, string> = {
  invalida:
    'Esta ligação não é válida. Confirma que a copiaste inteira — é comprida —, ou pede uma nova a quem te convidou.',
  usada:
    'Esta ligação já foi usada. Se já escolheste a palavra-passe, entra com ela; se a esqueceste, pede uma ligação nova a quem te convidou.',
  expirada: 'Esta ligação expirou: valem sete dias. Pede uma nova a quem te convidou.',
  desativada: 'Esta conta está desativada. Fala com quem gere o painel.',
  'por-aplicar': 'O painel desta instalação ainda não tem contas por pessoa.',
};

const ERROS: Record<string, string> = {
  curta: `A palavra-passe tem de ter pelo menos ${COMPRIMENTO_MINIMO} caracteres.`,
  diferentes: 'As duas palavras-passe não são iguais. Escreve a mesma nas duas caixas.',
};

/**
 * Onde quem foi convidado escolhe a palavra-passe — e entra.
 *
 * Abre-se sem sessão, com a ligação que o dono mandou (`?t=…`). O token é
 * reduzido ao sha256 antes de ir à base, como foi guardado; o que se mostra
 * antes de escrever é o nome da pessoa e até quando a ligação vale, para que
 * uma ligação expirada se saiba ANTES de escrever duas vezes uma palavra-passe
 * de doze caracteres.
 */
export default async function Ativar({ searchParams }: Props) {
  const { t = '', erro, mensagem } = await searchParams;
  const leitura: LeituraDaLigacao = temChaveDeServico()
    ? await lerLigacao(createHash('sha256').update(t).digest('hex'))
    : { estado: 'por-aplicar' };

  if (leitura.estado !== 'valida') {
    return (
      <>
        <h1>Escolher a palavra-passe</h1>
        <p role="alert" className="faixa alerta">
          {erro === 'base' && mensagem
            ? `Não foi possível: ${mensagem}.`
            : PROBLEMAS[leitura.estado]}
        </p>
        <p>
          <Link href="/admin/entrar/">Ir para a entrada do painel</Link>
        </p>
      </>
    );
  }

  const problema = erro === 'base' ? (mensagem ? `Não foi possível: ${mensagem}.` : null) : erro;
  return (
    <>
      <h1>{leitura.jaAtivada ? 'Escolher uma palavra-passe nova' : 'Escolher a palavra-passe'}</h1>
      <p className="entrada">
        Olá, {leitura.nome}. Vais entrar no painel com o email <strong>{leitura.email}</strong> e a
        palavra-passe que escolheres aqui. Esta ligação serve uma vez, até {porExtenso(leitura.ate)}
        {leitura.jaAtivada
          ? ', e a palavra-passe antiga deixa de valer quando escolheres esta'
          : ''}
        .
      </p>
      {problema ? (
        <p role="alert" className="faixa alerta">
          {ERROS[problema] ?? problema}
        </p>
      ) : null}
      <form action={ativarConta} className="formulario">
        <input type="hidden" name="t" value={t} />
        {/* O email vai no formulário, escondido, para o gestor de palavras-passe
            do navegador a guardar com o nome certo. */}
        <input
          type="email"
          name="email"
          value={leitura.email}
          autoComplete="username"
          readOnly
          hidden
        />
        <label htmlFor="senha">Palavra-passe</label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          minLength={COMPRIMENTO_MINIMO}
          autoComplete="new-password"
          aria-describedby="senha-ajuda"
        />
        <p id="senha-ajuda" className="secundario-texto">
          Pelo menos {COMPRIMENTO_MINIMO} caracteres. Uma frase que só tu saibas serve melhor do que
          uma palavra com símbolos.
        </p>
        <label htmlFor="confirmacao">A mesma palavra-passe, outra vez</label>
        <input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          minLength={COMPRIMENTO_MINIMO}
          autoComplete="new-password"
        />
        <button type="submit">Guardar e entrar</button>
      </form>
    </>
  );
}
