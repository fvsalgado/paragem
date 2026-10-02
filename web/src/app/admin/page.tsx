import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Aviso from '@/componentes/painel/Aviso';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { revalidarSitio } from '@/lib/painel/acoes';
import { dentroDaPagina, type Dentro } from '@/lib/painel/autenticacao';
import { temChaveDeServico } from '@/lib/painel/base';
import { naFrase } from '@/lib/painel/ficha';
import { inicioDe, nomeDoPapel, pode } from '@/lib/painel/papeis';
import {
  listarAliases,
  listarLicencas,
  listarModulos,
  listarRegioes,
} from '@/lib/painel/consultas';
import { diaNoFuso } from '@/lib/fuso';
import { estadoDaLicenca } from '@/lib/painel/licencas';
import { resumoDosModulos } from '@/lib/painel/modulos';

export const dynamic = 'force-dynamic';

/*
 * O modelo de título do layout de `app/admin` não se aplica à página do mesmo
 * segmento — só aos de baixo —, por isso esta escreve o «Painel» por extenso.
 */
export const metadata: Metadata = { title: 'Regiões · Painel' };

interface Props {
  searchParams: Promise<{ aviso?: string; regiao?: string }>;
}

/** A página de uma região para quem a abre: a ficha a quem a gere, os avisos a quem os escreve. */
function paginaDaRegiaoPara(dentro: Dentro, regiao: string): string {
  const ficha = `/admin/regioes/${encodeURIComponent(regiao)}/`;
  return pode(dentro, regiao, 'gestor') ? ficha : `${ficha}avisos/`;
}

/**
 * O início de uma pessoa com mais de uma região — ou com nenhuma, que é o
 * estado de quem foi convidada e ainda não recebeu papel.
 */
async function AsMinhasRegioes({ dentro, aviso }: { dentro: Dentro; aviso?: string }) {
  const regioes = (await listarRegioes()).filter((r) => dentro.papeis[r.id]);
  return (
    <>
      <h1>As minhas regiões</h1>
      <Aviso texto={aviso} />
      {regioes.length === 0 ? (
        <p>
          Ainda não tens nenhuma região atribuída. Quem gere o painel dá-te o papel numa região, e
          ela aparece aqui no clique seguinte.
        </p>
      ) : (
        <ul className="lista cartoes">
          {regioes.map((r) => {
            const papel = dentro.papeis[r.id];
            return (
              <li key={r.id} className="cartao">
                <h2>
                  <Link href={paginaDaRegiaoPara(dentro, r.id)}>{r.name}</Link>
                </h2>
                <p className="secundario-texto">
                  És {papel ? nomeDoPapel(papel) : ''} desta região.{' '}
                  {r.is_enabled
                    ? `O sítio dela está em ${r.domain}.`
                    : 'O sítio dela está desligado.'}
                </p>
                <p className="linha-accoes">
                  {pode(dentro, r.id, 'gestor') ? (
                    <Link href={`/admin/regioes/${encodeURIComponent(r.id)}/`}>A região</Link>
                  ) : null}
                  <Link href={`/admin/regioes/${encodeURIComponent(r.id)}/avisos/`}>Avisos</Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * As regiões que esta instalação serve — quantas são, em que estado está cada
 * uma, e por onde se mexe em cada coisa.
 *
 * É uma lista de cartões e não uma tabela: com o estado, o domínio, os alias,
 * os módulos e a licença, uma tabela tinha sete colunas, e num telemóvel isso
 * é uma barra de deslocação por cima de outra. O que se compara entre
 * regiões — quantas, e em que estado — está nas contas de cima.
 */
export default async function Regioes({ searchParams }: Props) {
  const { aviso, regiao: pedida } = await searchParams;
  const dentro = await dentroDaPagina();

  // O SELETOR DE REGIÃO do cabeçalho manda para aqui (`?regiao=`), e daqui
  // vai-se para a página que essa pessoa pode abrir nessa região.
  if (pedida && pode(dentro, pedida, 'editor')) redirect(paginaDaRegiaoPara(dentro, pedida));

  if (!dentro.dono) {
    // Com UMA região, a lista era um clique a mais todos os dias. O aviso de
    // uma ação recusada vem com ela.
    if (Object.keys(dentro.papeis).length === 1) {
      redirect(`${inicioDe(dentro)}${aviso ? `?aviso=${encodeURIComponent(aviso)}` : ''}`);
    }
    if (!temChaveDeServico()) return <SemChaveDeServico titulo="As minhas regiões" />;
    return <AsMinhasRegioes dentro={dentro} aviso={aviso} />;
  }

  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Regiões" />;

  const [regioes, aliases, modulos, licencas] = await Promise.all([
    listarRegioes(),
    listarAliases(),
    listarModulos(),
    listarLicencas(),
  ]);
  // O dia de hoje NO FUSO DA CASA: em UTC, à meia-noite e meia de Lisboa,
  // ainda era ontem, e uma licença que acaba hoje dizia «falta um dia».
  const hoje = diaNoFuso(new Date());
  const ligadas = regioes.filter((r) => r.is_enabled).length;
  const aAcabar = regioes.filter(
    (r) =>
      estadoDaLicenca(
        licencas.filter((l) => l.region_id === r.id),
        hoje,
      ).alerta,
  ).length;

  return (
    <>
      <h1>Regiões</h1>
      <p className="entrada">
        Cada cartão é uma autoridade de transportes servida por esta instalação, no seu endereço. O
        que aqui se liga e desliga faz efeito sem publicação nenhuma, e fica na auditoria com o nome
        de quem o fez.
      </p>

      <Aviso texto={aviso} />

      <dl className="numeros">
        <div>
          <dt>Regiões</dt>
          <dd>{regioes.length}</dd>
        </div>
        <div>
          <dt>No ar</dt>
          <dd>{ligadas}</dd>
        </div>
        <div>
          <dt>Desligadas</dt>
          <dd>{regioes.length - ligadas}</dd>
        </div>
        <div>
          <dt>Licenças a acabar</dt>
          <dd>{aAcabar}</dd>
        </div>
      </dl>

      <div className="linha-accoes">
        <Link href="/admin/regioes/nova/" className="botao">
          Nova região
        </Link>
      </div>

      <ul className="lista cartoes">
        {regioes.map((regiao) => {
          const ficha = `/admin/regioes/${encodeURIComponent(regiao.id)}/`;
          const osAlias = aliases.filter((a) => a.region_id === regiao.id).map((a) => a.domain);
          const desligados = modulos
            .filter((m) => m.region_id === regiao.id && !m.is_enabled)
            .map((m) => m.id);
          const licenca = estadoDaLicenca(
            licencas.filter((l) => l.region_id === regiao.id),
            hoje,
          );
          return (
            <li key={regiao.id} className="cartao">
              <h2>
                <Link href={ficha}>{regiao.name}</Link>
              </h2>
              <p className={regiao.is_enabled ? undefined : 'alerta-texto'}>
                {regiao.is_enabled ? (
                  <>
                    <strong>No ar</strong> em {regiao.domain}.
                  </>
                ) : (
                  <>
                    <strong>{naFrase(regiao).adj('Desligad')}:</strong> {regiao.domain} mostra a
                    página do Paragem.pt.
                  </>
                )}
              </p>
              <dl className="pares">
                <dt>Outros endereços</dt>
                <dd>{osAlias.length ? osAlias.join(', ') : 'nenhum'}</dd>
                <dt>Modos</dt>
                <dd>{resumoDosModulos(desligados)}</dd>
                <dt>Licença</dt>
                <dd className={licenca.alerta ? 'alerta-texto' : undefined}>{licenca.texto}</dd>
              </dl>
              <p className="linha-accoes">
                <Link href={ficha}>Abrir a ficha</Link>
                <Link href={`${ficha}avisos/`}>Avisos</Link>
              </p>
            </li>
          );
        })}
      </ul>
      {regioes.length === 0 ? (
        <p>Ainda não há regiões. A primeira nasce em «Nova região».</p>
      ) : null}

      <details className="para-quem-gere">
        <summary>Para quem gere a instalação</summary>
        <p>
          O pipeline avisa o sítio sempre que publica dados, e as páginas de cada região refazem-se
          à visita seguinte. Se esse aviso se perder — as páginas a mostrarem dados de ontem depois
          de uma publicação —, este botão faz o mesmo à mão, para todas as regiões.
        </p>
        <form action={revalidarSitio}>
          <button type="submit" className="secundario">
            Atualizar as páginas do sítio
          </button>
        </form>
        <p className="secundario-texto">
          A ordem dos cartões é a da página do Paragem.pt (a posição de cada região na lista), e o
          identificador de cada uma está na ficha dela.
        </p>
      </details>
    </>
  );
}
