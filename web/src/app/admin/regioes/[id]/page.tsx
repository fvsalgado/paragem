import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Aviso from '@/componentes/painel/Aviso';
import Mudanca from '@/componentes/painel/Mudanca';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { IDENTIFICADOR, regiao as fichaNoArmazem } from '@/lib/dados';
import {
  acrescentarAlias,
  alternarModulo,
  ligarOuDesligarRegiao,
  mudarDominio,
  registarLicenca,
  retirarAlias,
} from '@/lib/painel/acoes';
import { nomeDaAcao } from '@/lib/painel/auditoria';
import { temChaveDeServico } from '@/lib/painel/base';
import {
  acoesDaRegiao,
  listarAliases,
  listarLicencas,
  listarModulos,
  listarRegioes,
} from '@/lib/painel/consultas';
import { dataPorExtenso, estadoDaLicenca } from '@/lib/painel/licencas';
import { MODULOS, nomeDoModulo } from '@/lib/painel/modulos';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

function quandoEQuem(linha: { updated_at: string; updated_by: string | null }): string {
  const dia = dataPorExtenso(linha.updated_at);
  return linha.updated_by ? `${dia}, por ${linha.updated_by}` : dia;
}

/**
 * A ficha de uma região: o que se mexe, mexe-se aqui e fica na auditoria.
 *
 * O nome e o artigo NÃO se editam: são identidade da região e vivem no
 * `regiao.yaml` dela; a base guarda uma cópia que o CI confere. O que se mexe
 * é o que só faz sentido em tempo de execução — o interruptor, o domínio, os
 * alias, os módulos, as licenças.
 */
export default async function FichaDaRegiao({ params, searchParams }: Props) {
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  if (!IDENTIFICADOR.test(id)) notFound();
  if (!temChaveDeServico()) return <SemChaveDeServico titulo={id} />;

  const [regioes, aliases, modulos, licencas, acoes, noArmazem] = await Promise.all([
    listarRegioes(),
    listarAliases(),
    listarModulos(),
    listarLicencas(),
    acoesDaRegiao(id, 10),
    // O `regiao.yaml` dela, tal como o pipeline o publicou: é daqui que vem
    // a lista dos modos que a região declara. `null` sem dados no armazém.
    fichaNoArmazem(id).catch(() => null),
  ]);
  const regiao = regioes.find((r) => r.id === id);
  if (!regiao) notFound();

  const osAlias = aliases.filter((a) => a.region_id === id);
  const estadoDoModulo = new Map(modulos.filter((m) => m.region_id === id).map((m) => [m.id, m]));
  const asLicencas = licencas.filter((l) => l.region_id === id);
  const licenca = estadoDaLicenca(asLicencas, new Date().toISOString().slice(0, 10));
  const declarados = noArmazem?.modos ?? null;
  const ficha = `/admin/regioes/${encodeURIComponent(id)}/`;

  return (
    <>
      <h1>
        {regiao.name} <span className="secundario-texto">{regiao.id}</span>
      </h1>
      <p className="entrada">
        Tudo o que aqui se grava passa pela função da base e deixa linha na auditoria, com o antes e
        o depois. O nome e o artigo («{regiao.article} {regiao.name}») vêm do{' '}
        <code>regiao.yaml</code> e não se mudam aqui.
      </p>

      <Aviso texto={aviso} />

      <section aria-labelledby="estado" className="cartao">
        <h2 id="estado">Estado</h2>
        <p className={regiao.is_enabled ? undefined : 'alerta-texto'}>
          <strong>{regiao.is_enabled ? 'Ligada.' : 'Desligada.'}</strong>{' '}
          {regiao.is_enabled
            ? `A responder em ${regiao.domain}; a montra lista-a.`
            : 'Fora do mapa: o domínio mostra a montra, e a montra não a lista.'}
          {noArmazem
            ? ''
            : ' Ainda não há dados dela no armazém — ligá-la agora punha o domínio a responder 404.'}
        </p>
        <form action={ligarOuDesligarRegiao} className="em-linha">
          <input type="hidden" name="regiao" value={regiao.id} />
          <input type="hidden" name="ligar" value={regiao.is_enabled ? '0' : '1'} />
          <button type="submit" className={regiao.is_enabled ? 'secundario' : undefined}>
            {regiao.is_enabled ? 'Desligar a região' : 'Ligar a região'}
          </button>
        </form>
        {regiao.is_enabled ? (
          <p className="secundario-texto">
            Nunca se desliga a última região ligada — a base recusa, e o painel diz.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="dominio" className="cartao">
        <h2 id="dominio">Domínio</h2>
        <dl className="pares">
          <dt>Canónico</dt>
          <dd>
            <a href={`https://${regiao.domain}/`}>{regiao.domain}</a>
          </dd>
          <dt>Alias</dt>
          <dd>
            {osAlias.length === 0 ? (
              'nenhum — um alias redireciona (308) para o canónico, nunca serve'
            ) : (
              <ul className="lista-simples">
                {osAlias.map((alias) => (
                  <li key={alias.domain}>
                    <form action={retirarAlias} className="em-linha">
                      <input type="hidden" name="regiao" value={regiao.id} />
                      <input type="hidden" name="dominio" value={alias.domain} />
                      <span>{alias.domain}</span>
                      <button type="submit" className="secundario pequeno">
                        Retirar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
        <form action={acrescentarAlias} className="formulario">
          <input type="hidden" name="regiao" value={regiao.id} />
          <label htmlFor="alias">Acrescentar um alias</label>
          <input
            id="alias"
            name="dominio"
            type="text"
            required
            inputMode="url"
            autoComplete="off"
            aria-describedby="alias-ajuda"
          />
          <p id="alias-ajuda" className="secundario-texto">
            Um domínio, sem esquema nem barra: <code>www.{regiao.domain}</code>. Tem de entrar
            também no projeto da plataforma para responder.
          </p>
          <button type="submit" className="secundario">
            Acrescentar
          </button>
        </form>
        <form action={mudarDominio} className="formulario">
          <input type="hidden" name="regiao" value={regiao.id} />
          <label htmlFor="dominio-novo">Mudar o domínio canónico</label>
          <input
            id="dominio-novo"
            name="dominio"
            type="text"
            required
            inputMode="url"
            autoComplete="off"
            defaultValue={regiao.domain}
            aria-describedby="dominio-ajuda"
          />
          <p id="dominio-ajuda" className="secundario-texto">
            É o dia em que a autoridade traz o domínio dela. O <code>regiao.yaml</code> e o projeto
            da plataforma têm de dizer o mesmo — o CI confere o primeiro (
            <code>docs/NOVA-REGIAO.md</code>).
          </p>
          <label className="caixa">
            <input type="checkbox" name="manter_alias" value="1" defaultChecked />O domínio antigo
            fica a redirecionar para o novo
          </label>
          <button type="submit" className="secundario">
            Mudar o domínio
          </button>
        </form>
      </section>

      <section aria-labelledby="modulos" className="cartao">
        <h2 id="modulos">Módulos</h2>
        <p className="secundario-texto">
          Um módulo é um modo de transporte. Desligar «expresso» é tirar a FlixBus do sítio;
          desligar «comboio» é tirar a CP. Que fonte alimenta cada modo é da receita da região, não
          daqui.
          {declarados === null
            ? ' Sem dados no armazém não se sabe que modos a região declara: mostram-se os sete.'
            : ''}
        </p>
        <ul className="interruptores">
          {MODULOS.map((modulo) => {
            const linha = estadoDoModulo.get(modulo);
            const ligado = linha?.is_enabled ?? true;
            const declarado = declarados === null || declarados.includes(modulo);
            return (
              <li key={modulo}>
                <div>
                  <p>
                    <strong>{nomeDoModulo(modulo)}</strong>{' '}
                    <span className="secundario-texto">{modulo}</span>
                  </p>
                  {!declarado ? (
                    <p className="secundario-texto">
                      A região não declara este modo no <code>regiao.yaml</code>: não há nada para
                      ligar.
                    </p>
                  ) : null}
                  {!ligado && linha ? (
                    <p className="alerta-texto">Desligado em {quandoEQuem(linha)}.</p>
                  ) : null}
                </div>
                {declarado || !ligado ? (
                  <form action={alternarModulo}>
                    <input type="hidden" name="regiao" value={regiao.id} />
                    <input type="hidden" name="modulo" value={modulo} />
                    <input type="hidden" name="ligar" value={ligado ? '0' : '1'} />
                    <span className={`estado${ligado ? '' : ' alerta-texto'}`}>
                      {ligado ? 'Ligado' : 'Desligado'}
                    </span>
                    <button type="submit" className="secundario pequeno">
                      {ligado ? 'Desligar' : 'Ligar'}
                    </button>
                  </form>
                ) : (
                  <span className="estado secundario-texto">Não declarado</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="licencas" className="cartao">
        <h2 id="licencas">Licenças</h2>
        <p className={licenca.alerta ? 'alerta-texto' : undefined}>{licenca.texto}</p>
        <p className="secundario-texto">
          Uma linha por contrato ou renovação, nunca reescrita. Expirar avisa; desligar é sempre um
          gesto humano, no interruptor lá em cima.
        </p>
        {asLicencas.length > 0 ? (
          <div className="rolavel">
            <table className="registo">
              <caption className="so-para-leitores">O histórico das licenças desta região</caption>
              <thead>
                <tr>
                  <th scope="col">Início</th>
                  <th scope="col">Fim</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Notas</th>
                  <th scope="col">Registada por</th>
                </tr>
              </thead>
              <tbody>
                {asLicencas.map((l) => (
                  <tr key={l.id}>
                    <td>{dataPorExtenso(l.starts_on)}</td>
                    <td>{l.ends_on ? dataPorExtenso(l.ends_on) : 'sem prazo'}</td>
                    <td>{l.kind}</td>
                    <td>{l.notes ?? '—'}</td>
                    <td>{l.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <form action={registarLicenca} className="formulario">
          <input type="hidden" name="regiao" value={regiao.id} />
          <h3>Registar uma licença</h3>
          <div className="em-linha">
            <div>
              <label htmlFor="inicio">Início</label>
              <input id="inicio" name="inicio" type="date" required />
            </div>
            <div>
              <label htmlFor="fim">Fim</label>
              <input id="fim" name="fim" type="date" aria-describedby="fim-ajuda" />
              <p id="fim-ajuda" className="secundario-texto">
                Em branco: sem prazo.
              </p>
            </div>
          </div>
          <label htmlFor="tipo">Tipo</label>
          <input
            id="tipo"
            name="tipo"
            type="text"
            required
            placeholder="contrato, piloto, demo, cortesia"
          />
          <label htmlFor="notas">Notas</label>
          <input id="notas" name="notas" type="text" />
          <button type="submit" className="secundario">
            Registar
          </button>
        </form>
      </section>

      <section aria-labelledby="rasto" className="cartao">
        <h2 id="rasto">As últimas ações sobre esta região</h2>
        {acoes.length === 0 ? (
          <p className="secundario-texto">Ainda ninguém mexeu nesta região pelo painel.</p>
        ) : (
          <div className="rolavel">
            <table className="registo">
              <caption className="so-para-leitores">As últimas dez ações sobre esta região</caption>
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
                {acoes.map((acao) => (
                  <tr key={acao.id}>
                    <td>{acao.created_at.slice(0, 16).replace('T', ' ')}</td>
                    <td>{acao.actor}</td>
                    <td>{nomeDaAcao(acao.action)}</td>
                    <td>
                      <code>{acao.entity_id}</code>
                    </td>
                    <td>
                      <Mudanca before={acao.before} after={acao.after} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          <Link href={`/admin/auditoria/?tipo=region`}>Toda a auditoria</Link>
        </p>
      </section>

      <p>
        <Link href="/admin/">Todas as regiões</Link>
        {' · '}
        <Link href={ficha}>Esta ficha</Link>
      </p>
    </>
  );
}
