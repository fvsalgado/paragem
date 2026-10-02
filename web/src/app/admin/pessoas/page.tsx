import type { Metadata } from 'next';
import Aviso from '@/componentes/painel/Aviso';
import ConvidarPessoa from '@/componentes/painel/ConvidarPessoa';
import NovaLigacao from '@/componentes/painel/NovaLigacao';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { porExtenso } from '@/lib/fuso';
import { ativarOuDesativarPessoa, mudarPapeis } from '@/lib/painel/acoes-das-pessoas';
import { emailDoDono, paginaDoDono } from '@/lib/painel/autenticacao';
import { temChaveDeServico } from '@/lib/painel/base';
import { listarRegioes } from '@/lib/painel/consultas';
import { nomeDoPapel } from '@/lib/painel/papeis';
import { listarPessoas, type PessoaNaLista } from '@/lib/painel/pessoas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Pessoas' };

interface Props {
  searchParams: Promise<{ aviso?: string }>;
}

const ESTADO: Record<PessoaNaLista['estado'], string> = {
  convidada: 'Convidada — ainda não escolheu a palavra-passe',
  ativa: 'Ativa',
  desativada: 'Desativada — não pode entrar',
};

/**
 * Quem entra no painel além do dono — e o que cada pessoa pode fazer.
 *
 * Só o dono vê isto. Cada pessoa tem o seu email e a sua palavra-passe, e
 * papéis por região: editor (os avisos) ou gestor (a ficha). Convidar gera
 * uma ligação para a pessoa escolher a palavra-passe, que o dono envia pelos
 * seus meios. Desativar não apaga: o nome dela fica em cada linha da
 * auditoria, que é a razão de existirem pessoas em vez de uma palavra-passe.
 */
export default async function Pessoas({ searchParams }: Props) {
  await paginaDoDono();
  const { aviso } = await searchParams;
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Pessoas" />;

  const [pessoas, regioes] = await Promise.all([listarPessoas(), listarRegioes()]);
  const nomeDaRegiao = new Map(regioes.map((r) => [r.id, r.name]));
  const declarado = emailDoDono();

  if (pessoas === null) {
    return (
      <>
        <h1>Pessoas</h1>
        <p className="faixa">
          <strong>Esta instalação ainda não tem contas por pessoa.</strong> Até lá só entra o dono,
          com a palavra-passe de sempre — e nada mais muda.
        </p>
        <details className="para-quem-gere">
          <summary>Para quem gere a instalação</summary>
          <p>
            Falta aplicar à base a migração <code>0009_as_pessoas</code> (
            <code>supabase/migrations/</code>), como as anteriores: o ficheiro, o CI verde e só
            depois o <code>db push</code>. Este ecrã muda sozinho quando ela lá estiver.
          </p>
        </details>
      </>
    );
  }

  return (
    <>
      <h1>Pessoas</h1>
      <p className="entrada">
        Quem entra no painel, além de ti, com o seu email e a sua palavra-passe. Cada pessoa vê só
        as regiões onde tem um papel, e a auditoria escreve o nome dela em tudo o que fizer.
      </p>

      <Aviso texto={aviso} />

      {!declarado ? (
        <details className="para-quem-gere">
          <summary>Para quem gere a instalação: o teu email de dono</summary>
          <p>
            Entras com a palavra-passe do ambiente e qualquer email, porque <code>ADMIN_EMAIL</code>{' '}
            não está definido. Define-o com o teu email: passas a entrar só com ele, e uma pessoa
            convidada que escreva outro email nunca cai na tua porta (<code>docs/PAINEL.md</code>).
          </p>
        </details>
      ) : null}

      <section aria-labelledby="convidar" className="cartao">
        <h2 id="convidar">Convidar uma pessoa</h2>
        <ConvidarPessoa regioes={regioes.map((r) => ({ id: r.id, nome: r.name }))} />
      </section>

      <section aria-labelledby="quem" className="cartao">
        <h2 id="quem">Quem já tem conta</h2>
        {pessoas.length === 0 ? (
          <p className="secundario-texto">Ninguém, por enquanto: só tu entras.</p>
        ) : (
          <ul className="lista-simples pessoas">
            {pessoas.map((p) => {
              const papeis = Object.entries(p.papeis);
              return (
                <li key={p.id} id={`pessoa-${p.id}`} className="pessoa">
                  <h3>{p.nome}</h3>
                  <dl className="pares">
                    <dt>Email</dt>
                    <dd>{p.email}</dd>
                    <dt>Estado</dt>
                    <dd className={p.estado === 'desativada' ? 'alerta-texto' : undefined}>
                      {ESTADO[p.estado]}
                      {p.estado === 'convidada' && p.ligacaoAte
                        ? `. A ligação vale até ${porExtenso(p.ligacaoAte)}.`
                        : ''}
                    </dd>
                    <dt>Papéis</dt>
                    <dd>
                      {papeis.length === 0
                        ? 'nenhum — entra e não vê região nenhuma'
                        : papeis
                            .map(
                              ([r, papel]) =>
                                `${nomeDoPapel(papel)} de ${nomeDaRegiao.get(r) ?? r}`,
                            )
                            .join('; ')}
                    </dd>
                    <dt>Último acesso</dt>
                    <dd>{p.ultimo_acesso ? porExtenso(p.ultimo_acesso) : 'ainda não entrou'}</dd>
                  </dl>

                  <details className="mexer">
                    <summary>Mudar os papéis</summary>
                    <form action={mudarPapeis} className="formulario">
                      <input type="hidden" name="pessoa" value={p.id} />
                      <input type="hidden" name="nome" value={p.nome} />
                      <ul className="papeis-por-regiao">
                        {regioes.map((r) => (
                          <li key={r.id}>
                            <label htmlFor={`papel-${p.id}-${r.id}`}>{r.name}</label>
                            <select
                              id={`papel-${p.id}-${r.id}`}
                              name={`papel:${r.id}`}
                              defaultValue={p.papeis[r.id] ?? ''}
                            >
                              <option value="">Sem papel</option>
                              <option value="editor">Editor</option>
                              <option value="gestor">Gestor</option>
                            </select>
                          </li>
                        ))}
                      </ul>
                      <button type="submit" className="secundario">
                        Guardar os papéis de {p.nome}
                      </button>
                    </form>
                  </details>

                  {p.estado !== 'desativada' ? (
                    <>
                      <NovaLigacao
                        pessoa={{
                          id: p.id,
                          nome: p.nome,
                          email: p.email,
                          ativada: p.estado === 'ativa',
                        }}
                      />
                      <details className="perigo">
                        <summary>Desativar {p.nome}…</summary>
                        <p>
                          {p.nome} deixa de poder entrar já no próximo clique, e as ligações por
                          usar deixam de servir. Não se apaga nada: o nome fica em tudo o que fez,
                          na auditoria, e podes voltar a ativá-la.
                        </p>
                        <form action={ativarOuDesativarPessoa}>
                          <input type="hidden" name="pessoa" value={p.id} />
                          <input type="hidden" name="nome" value={p.nome} />
                          <input type="hidden" name="ativa" value="0" />
                          <button type="submit" className="perigo">
                            Desativar {p.nome}
                          </button>
                        </form>
                      </details>
                    </>
                  ) : (
                    <form action={ativarOuDesativarPessoa} className="em-linha">
                      <input type="hidden" name="pessoa" value={p.id} />
                      <input type="hidden" name="nome" value={p.nome} />
                      <input type="hidden" name="ativa" value="1" />
                      <button type="submit" className="secundario">
                        Voltar a ativar {p.nome}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
