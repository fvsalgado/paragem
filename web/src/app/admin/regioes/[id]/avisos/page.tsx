import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CartaoDeAviso } from '@/componentes/Avisos';
import Aviso from '@/componentes/painel/Aviso';
import EditorDeAviso, { type ValoresDoEditor } from '@/componentes/painel/EditorDeAviso';
import IrParaSecao from '@/componentes/painel/IrParaSecao';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import {
  IDENTIFICADOR,
  NOME_DOS_MODOS,
  concelhos as concelhosNoArmazem,
  linhas as linhasNoArmazem,
  paragens as paragensNoArmazem,
  regiao as fichaNoArmazem,
} from '@/lib/dados';
import { emVigor } from '@/lib/avisos';
import { FUSO, nomeDoFuso, paraCampoLocal, porExtenso } from '@/lib/fuso';
import { apagarAviso, publicarAviso } from '@/lib/painel/acoes';
import { quemFez } from '@/lib/painel/auditoria';
import { paginaDaRegiao } from '@/lib/painel/autenticacao';
import { temChaveDeServico } from '@/lib/painel/base';
import { avisosDaRegiao, type Aviso as AvisoNaBase } from '@/lib/painel/avisos';
import { listarRegioes } from '@/lib/painel/consultas';
import { naFrase } from '@/lib/painel/ficha';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; editar?: string; secao?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Avisos · ${id}` };
}

const VAZIO: ValoresDoEditor = {
  titulo: '',
  texto: '',
  gravidade: 'WARNING',
  causa: 'UNKNOWN_CAUSE',
  efeito: 'OTHER_EFFECT',
  inicio: '',
  fim: '',
  url: '',
  linhas: [],
  paragens: [],
  modos: [],
};

function valoresDe(a: AvisoNaBase): ValoresDoEditor {
  return {
    titulo: a.titulo,
    texto: a.texto,
    gravidade: a.gravidade,
    causa: a.causa,
    efeito: a.efeito,
    inicio: paraCampoLocal(a.inicio),
    fim: paraCampoLocal(a.fim),
    url: a.url ?? '',
    linhas: a.linhas,
    paragens: a.paragens,
    modos: a.modos,
  };
}

/**
 * Os avisos de uma região: escrever, ver como fica, publicar, retirar, apagar
 * (P4-017, P4-018).
 *
 * UM EDITOR SÓ, e não um por aviso. Corrigir é o mesmo editor com
 * `?editar=<id>`, preenchido — o que evita dezenas de formulários abertos numa
 * página e um leitor de ecrã a anunciar vinte «Título» seguidos.
 *
 * A LISTA MOSTRA CADA AVISO COMO O PÚBLICO O VÊ — o mesmo cartão da página de
 * avisos —, com o estado por cima e os gestos por baixo. Apagar abre-se
 * primeiro e confirma-se depois: é o único gesto daqui que não se desfaz.
 */
export default async function AvisosDaRegiao({ params, searchParams }: Props) {
  const [{ id }, { aviso, editar, secao }] = await Promise.all([params, searchParams]);
  if (!IDENTIFICADOR.test(id)) notFound();
  // Os avisos de uma região são de quem tem papel nela — editor, gestor — e do dono.
  await paginaDaRegiao(id, 'editor');
  if (!temChaveDeServico()) return <SemChaveDeServico titulo={`Avisos · ${id}`} />;

  const [regioes, avisos, noArmazem, linhas, paragens, concelhos] = await Promise.all([
    listarRegioes(),
    avisosDaRegiao(id),
    fichaNoArmazem(id).catch(() => null),
    linhasNoArmazem(id).catch(() => []),
    paragensNoArmazem(id).catch(() => []),
    concelhosNoArmazem(id).catch(() => []),
  ]);
  const regiao = regioes.find((r) => r.id === id);
  if (!regiao) notFound();
  const frase = naFrase(regiao);

  const aEditar = editar ? (avisos.find((a) => a.id === editar) ?? null) : null;
  const agora = new Date();
  const noAr = avisos.filter((a) => a.publicado && emVigor(a, agora));
  const rascunhos = avisos.filter((a) => !a.publicado).length;

  // OS MODOS SOBRE QUE ESTA AUTORIDADE PODE ESCREVER.
  //
  // Um modo alimentado só por feeds de outra entidade — o operador
  // ferroviário, o de expressos — aparece no sítio porque quem viaja não tem
  // de saber quem gere o quê (§1). Mas um aviso nosso sobre uma greve deles é
  // redistribuir a informação de serviço de outra entidade: que a publica nos
  // canais dela, que responde por ela estar certa, e que a pode desmentir uma
  // hora depois sem nos dizer. É a mesma regra das descargas, e vem do mesmo
  // sítio: a receita da região, não uma lista de modos escrita aqui.
  const declarados = noArmazem?.modos ?? [];
  const deTerceiros = noArmazem?.modos_de_terceiros ?? [];
  const modos = declarados
    .filter((m) => !deTerceiros.includes(m))
    .map((m) => ({ id: m, nome: NOME_DOS_MODOS[m] ?? m }));
  const nomeDoConcelho = new Map(concelhos.map((c) => [c.id, c.nome]));
  // As linhas da casa: as de outro operador não se escolhem (`resolverLinhas`).
  const linhasDaCasa = linhas
    .filter((l) => !l.operador && !deTerceiros.includes(l.modo))
    .map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome, cor: l.cor, modo: l.modo }));
  const catalogo = {
    linhas: new Map(linhas.map((l) => [l.id, l])),
    paragens: new Map(paragens.map((p) => [p.id, p.nome])),
    modos: NOME_DOS_MODOS,
  };
  // A mensagem de um gesto num aviso fica AO PÉ DELE, e o ecrã vai lá (P4-014).
  const noAviso = secao?.startsWith('aviso-') && avisos.some((a) => `aviso-${a.id}` === secao);

  return (
    <>
      <IrParaSecao secao={noAviso ? secao : undefined} />
      <h1>Avisos {frase.de}</h1>
      <p className="entrada">
        O que a autoridade de transportes tem a dizer hoje a quem viaja: desvios, supressões,
        greves. Publicado, o aviso aparece no sítio de imediato — na página de avisos, na página
        inicial e nas páginas das linhas e das paragens a que diz respeito.
      </p>

      {noAviso ? null : <Aviso texto={aviso} />}

      <section aria-labelledby="estado" className="cartao">
        <h2 id="estado">No ar agora</h2>
        {noAr.length === 0 ? (
          <p>
            Nenhum aviso. A página de avisos de{' '}
            <a href={`https://${regiao.domain}/avisos/`}>{regiao.domain}</a> diz que não há avisos —
            que é o estado normal.
          </p>
        ) : (
          <p>
            <strong>
              {noAr.length} {noAr.length === 1 ? 'aviso' : 'avisos'} no ar
            </strong>
            , em <a href={`https://${regiao.domain}/avisos/`}>{regiao.domain}/avisos/</a>.
          </p>
        )}
        {rascunhos > 0 ? (
          <p>
            <a href="#todos">
              {rascunhos === 1 ? 'Um rascunho' : `${rascunhos} rascunhos`} por publicar
            </a>
            .
          </p>
        ) : null}
      </section>

      <section aria-labelledby="escrever" className="cartao">
        <h2 id="escrever">{aEditar ? 'Corrigir este aviso' : 'Escrever um aviso'}</h2>
        <EditorDeAviso
          key={aEditar?.id ?? 'novo'}
          regiao={regiao.id}
          idDoAviso={aEditar?.id}
          publicado={!!aEditar?.publicado}
          inicial={aEditar ? valoresDe(aEditar) : VAZIO}
          linhas={linhasDaCasa}
          paragens={paragens.map((p) => [
            p.id,
            p.nome,
            (p.concelho && nomeDoConcelho.get(p.concelho)) || '',
          ])}
          modos={modos}
          fuso={FUSO}
          nomeDoFuso={nomeDoFuso(FUSO)}
        />
        {deTerceiros.length > 0 ? (
          <p className="secundario-texto">
            {deTerceiros.map((m) => NOME_DOS_MODOS[m] ?? m).join(' e ')}{' '}
            {deTerceiros.length === 1 ? 'aparece' : 'aparecem'} no sítio e não{' '}
            {deTerceiros.length === 1 ? 'está' : 'estão'} aqui: esta região mostra esses serviços e
            não os gere, e <strong>quem gere o serviço é quem avisa sobre ele</strong>.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="todos" className="cartao">
        <h2 id="todos">Todos os avisos {frase.de}</h2>
        {avisos.length === 0 ? (
          <p className="secundario-texto">Ainda não há nenhum.</p>
        ) : (
          <ul className="lista-simples lista-de-avisos">
            {avisos.map((a) => {
              const vigente = emVigor(a, agora);
              const estado = a.publicado
                ? vigente
                  ? 'Publicado · no ar'
                  : 'Publicado · fora de prazo, não aparece no sítio'
                : 'Rascunho · não aparece em lado nenhum';
              return (
                <li key={a.id} id={`aviso-${a.id}`}>
                  {secao === `aviso-${a.id}` ? <Aviso texto={aviso} /> : null}
                  <p className="estado-do-aviso">
                    <strong className={a.publicado && vigente ? undefined : 'secundario-texto'}>
                      {estado}
                    </strong>
                    <span className="secundario-texto">
                      {' '}
                      · escrito por {quemFez(a.created_by)}, {porExtenso(a.created_at)}
                    </span>
                  </p>
                  <CartaoDeAviso aviso={a} catalogo={catalogo} ligacoes={false} nivel={3} />
                  <div className="accoes-do-aviso">
                    <form action={publicarAviso}>
                      <input type="hidden" name="regiao" value={regiao.id} />
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="publicar" value={a.publicado ? '0' : '1'} />
                      <button type="submit" className={a.publicado ? 'secundario' : undefined}>
                        {a.publicado ? 'Retirar' : 'Publicar'}
                        <span className="so-para-leitores"> «{a.titulo}»</span>
                      </button>
                    </form>
                    <Link
                      className="botao"
                      href={`/admin/regioes/${encodeURIComponent(id)}/avisos/?editar=${encodeURIComponent(a.id)}#escrever`}
                    >
                      Corrigir<span className="so-para-leitores"> «{a.titulo}»</span>
                    </Link>
                    {/* APAGAR CONFIRMA (P4-018), e diz o que custa: é o único
                        gesto daqui que não se desfaz. */}
                    <details className="perigo apagar-aviso">
                      <summary>
                        Apagar…<span className="so-para-leitores"> «{a.titulo}»</span>
                      </summary>
                      <p>
                        Apagar não é retirar: retirar é «isto deixou de ser verdade», apagar é «isto
                        nunca devia ter sido escrito». O aviso sai daqui e do sítio, e fica inteiro
                        na auditoria.
                      </p>
                      <form action={apagarAviso}>
                        <input type="hidden" name="regiao" value={regiao.id} />
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="confirmado" value="1" />
                        <button type="submit" className="perigo">
                          Apagar este aviso
                        </button>
                      </form>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="para-quem-gere">
        <summary>Para quem gere a instalação</summary>
        <p>
          Os avisos publicados e em vigor saem também no feed GTFS-RT Service Alerts da região (
          <a href={`https://${regiao.domain}/gtfs-rt/alerts.pb`}>gtfs-rt/alerts.pb</a>), que as
          aplicações de terceiros leem. «O que se passa», «Porquê» e «Quão grave» são os campos
          desse feed (<code>effect</code>, <code>cause</code>, <code>severity_level</code>); «Outra
          coisa» e «Não dizer» são <code>OTHER_EFFECT</code> e <code>UNKNOWN_CAUSE</code>, que o
          sítio não mostra. As linhas e as paragens guardam-se pelos identificadores do GTFS da
          região. As horas são de <code>{FUSO}</code> (variável <code>PARAGEM_FUSO</code>). Os modos
          de outras entidades vêm de <code>modos_de_terceiros</code>, na receita da região.
        </p>
      </details>

      <p>
        <Link href={`/admin/regioes/${encodeURIComponent(id)}/`}>Voltar à ficha da região</Link>
        {' · '}
        <Link href="/admin/auditoria/?tipo=aviso">A auditoria dos avisos</Link>
      </p>
    </>
  );
}
