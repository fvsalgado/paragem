import type { Metadata } from 'next';
import Link from 'next/link';
import Mudanca from '@/componentes/painel/Mudanca';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { nomeDaAcao } from '@/lib/painel/auditoria';
import { temChaveDeServico } from '@/lib/painel/base';
import {
  listarAcoes,
  opcoesDaAuditoria,
  type OpcoesDaAuditoria,
  type RecorteDaAuditoria,
} from '@/lib/painel/consultas';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Auditoria' };

const POR_PAGINA = 50;

interface Props {
  searchParams: Promise<{
    pagina?: string;
    quem?: string;
    accao?: string;
    tipo?: string;
    mes?: string;
  }>;
}

/** Os recortes na barra de endereços, para a paginação os levar consigo. */
function comRecorte(recorte: RecorteDaAuditoria, pagina: number): string {
  const params = new URLSearchParams();
  if (recorte.actor) params.set('quem', recorte.actor);
  if (recorte.action) params.set('accao', recorte.action);
  if (recorte.entityType) params.set('tipo', recorte.entityType);
  if (recorte.mes) params.set('mes', recorte.mes);
  if (pagina > 1) params.set('pagina', String(pagina));
  const consulta = params.toString();
  return consulta ? `/admin/auditoria/?${consulta}` : '/admin/auditoria/';
}

/**
 * Os recortes, num formulário que funciona sem JavaScript: `method="get"`
 * põe-nos na barra de endereços, que é o que os torna partilháveis —
 * «manda-me a ligação do que se mexeu em agosto» é como uma auditoria se usa.
 */
function Recortes({ opcoes, recorte }: { opcoes: OpcoesDaAuditoria; recorte: RecorteDaAuditoria }) {
  const temRecorte = recorte.actor || recorte.action || recorte.entityType || recorte.mes;
  return (
    <form method="get" action="/admin/auditoria/" className="em-linha recortes">
      <div>
        <label htmlFor="quem">Quem</label>
        <select id="quem" name="quem" defaultValue={recorte.actor ?? ''}>
          <option value="">Todos</option>
          {opcoes.actors.map((actor) => (
            <option key={actor} value={actor}>
              {actor}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="accao">O quê</label>
        <select id="accao" name="accao" defaultValue={recorte.action ?? ''}>
          <option value="">Tudo</option>
          {opcoes.actions.map((action) => (
            <option key={action} value={action}>
              {nomeDaAcao(action)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="tipo">Sobre</label>
        <select id="tipo" name="tipo" defaultValue={recorte.entityType ?? ''}>
          <option value="">Tudo</option>
          {opcoes.entityTypes.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="mes">Mês</label>
        <input id="mes" name="mes" type="month" defaultValue={recorte.mes ?? ''} />
      </div>
      <div className="botoes">
        <button type="submit" className="secundario">
          Filtrar
        </button>
        {temRecorte ? <Link href="/admin/auditoria/">Limpar</Link> : null}
      </div>
    </form>
  );
}

export default async function Auditoria({ searchParams }: Props) {
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Auditoria" />;

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina ?? '1') || 1);
  const recorte: RecorteDaAuditoria = {
    actor: params.quem || undefined,
    action: params.accao || undefined,
    entityType: params.tipo || undefined,
    mes: params.mes || undefined,
  };
  const [acoes, opcoes] = await Promise.all([
    listarAcoes(pagina, POR_PAGINA, recorte),
    opcoesDaAuditoria(),
  ]);

  return (
    <>
      <h1>Auditoria</h1>
      <p className="entrada">
        Todas as escritas do painel passam pelas funções da base, e todas deixam rasto aqui: quem,
        quando, sobre o quê, e o antes e o depois.
      </p>

      <Recortes opcoes={opcoes} recorte={recorte} />

      <div
        className="rolavel"
        tabIndex={0}
        role="region"
        aria-label="Tabela, deslocável na horizontal"
      >
        <table className="registo">
          <caption className="so-para-leitores">Registo de ações do painel</caption>
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Quem</th>
              <th scope="col">O quê</th>
              <th scope="col">Sobre</th>
              <th scope="col">O que mudou</th>
            </tr>
          </thead>
          <tbody>
            {acoes.map((acao) => {
              const regiao = acao.entity_id.split('/')[0] ?? acao.entity_id;
              return (
                <tr key={acao.id}>
                  <td>{acao.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td>{acao.actor}</td>
                  <td>{nomeDaAcao(acao.action)}</td>
                  <td>
                    <span className="secundario-texto">{acao.entity_type}</span>{' '}
                    {acao.entity_type === 'region' || acao.entity_type === 'module' ? (
                      <Link href={`/admin/regioes/${encodeURIComponent(regiao)}/`}>
                        <code>{acao.entity_id}</code>
                      </Link>
                    ) : (
                      <code>{acao.entity_id}</code>
                    )}
                  </td>
                  <td>
                    <Mudanca before={acao.before} after={acao.after} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {acoes.length === 0 ? (
        <p className="secundario-texto">
          {recorte.actor || recorte.action || recorte.entityType || recorte.mes
            ? 'Nenhuma ação com estes recortes. Não quer dizer que não tenha acontecido nada — quer dizer que não aconteceu isto.'
            : 'Sem registos nesta página.'}
        </p>
      ) : null}

      <nav aria-label="Paginação" className="linha-accoes">
        {pagina > 1 ? (
          <Link href={comRecorte(recorte, pagina - 1)} className="botao">
            Mais recentes
          </Link>
        ) : null}
        {acoes.length === POR_PAGINA ? (
          <Link href={comRecorte(recorte, pagina + 1)} className="botao">
            Mais antigas
          </Link>
        ) : null}
      </nav>
    </>
  );
}
