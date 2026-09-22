import type { Metadata } from 'next';
import Link from 'next/link';
import Aviso from '@/componentes/painel/Aviso';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { revalidarSitio } from '@/lib/painel/acoes';
import { temChaveDeServico } from '@/lib/painel/base';
import {
  listarAliases,
  listarLicencas,
  listarModulos,
  listarRegioes,
} from '@/lib/painel/consultas';
import { estadoDaLicenca } from '@/lib/painel/licencas';
import { resumoDosModulos } from '@/lib/painel/modulos';

export const dynamic = 'force-dynamic';

/*
 * O modelo de título do layout de `app/admin` não se aplica à página do mesmo
 * segmento — só aos de baixo —, por isso esta escreve o «Painel» por extenso.
 */
export const metadata: Metadata = { title: 'Regiões · Painel' };

interface Props {
  searchParams: Promise<{ aviso?: string }>;
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
  const { aviso } = await searchParams;
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="Regiões" />;

  const [regioes, aliases, modulos, licencas] = await Promise.all([
    listarRegioes(),
    listarAliases(),
    listarModulos(),
    listarLicencas(),
  ]);
  const hoje = new Date().toISOString().slice(0, 10);
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
        Cada cartão é uma autoridade de transportes servida por esta instalação, no seu domínio. O
        que aqui se liga e desliga faz efeito sem publicação nenhuma; tudo o que se grava passa por
        uma função da base e fica na auditoria.
      </p>

      <Aviso texto={aviso} />

      <dl className="numeros">
        <div>
          <dt>Regiões</dt>
          <dd>{regioes.length}</dd>
        </div>
        <div>
          <dt>Ligadas</dt>
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
        <form action={revalidarSitio}>
          <button type="submit" className="secundario">
            Revalidar o sítio
          </button>
        </form>
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
                <Link href={ficha}>{regiao.name}</Link>{' '}
                <span className="secundario-texto">{regiao.id}</span>
              </h2>
              <p className={regiao.is_enabled ? undefined : 'alerta-texto'}>
                <strong>{regiao.is_enabled ? 'Ligada.' : 'Desligada.'}</strong>{' '}
                {regiao.is_enabled
                  ? `A responder em ${regiao.domain}.`
                  : `Fora do mapa: ${regiao.domain} mostra a montra.`}
              </p>
              <dl className="pares">
                <dt>Alias</dt>
                <dd>{osAlias.length ? osAlias.join(', ') : 'nenhum'}</dd>
                <dt>Módulos</dt>
                <dd>{resumoDosModulos(desligados)}</dd>
                <dt>Licença</dt>
                <dd className={licenca.alerta ? 'alerta-texto' : undefined}>{licenca.texto}</dd>
                <dt>Ordem</dt>
                <dd>{regiao.sort_order}</dd>
              </dl>
              <p className="linha-accoes">
                <Link href={ficha}>Ficha</Link>
                <Link href={`${ficha}#modulos`}>Módulos</Link>
                <Link href={`${ficha}#dominio`}>Domínio</Link>
                <Link href={`${ficha}#licencas`}>Licenças</Link>
              </p>
            </li>
          );
        })}
      </ul>
      {regioes.length === 0 ? (
        <p>Ainda não há regiões na base. A primeira nasce em «Nova região».</p>
      ) : null}
    </>
  );
}
