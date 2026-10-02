import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Aviso from '@/componentes/painel/Aviso';
import IrParaSecao from '@/componentes/painel/IrParaSecao';
import Mudanca from '@/componentes/painel/Mudanca';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { IDENTIFICADOR, regiao as fichaNoArmazem } from '@/lib/dados';
import { emVigor } from '@/lib/avisos';
import {
  acrescentarAlias,
  alternarModulo,
  guardarContactos,
  ligarOuDesligarRegiao,
  mudarDominio,
  registarLicenca,
  retirarAlias,
} from '@/lib/painel/acoes';
import { diaNoFuso, porExtenso } from '@/lib/fuso';
import { paginaDaRegiao } from '@/lib/painel/autenticacao';
import { nomeDaAcao, quemFez } from '@/lib/painel/auditoria';
import { avisosDaRegiao } from '@/lib/painel/avisos';
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
import { naFrase } from '@/lib/painel/ficha';
import { nomeDoPapel } from '@/lib/painel/papeis';
import { pessoasDaRegiao } from '@/lib/painel/pessoas';
import { contactosDoPainel } from '@/lib/painel/contactos';
import { aAutoridade, lista } from '@/lib/prosa';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    aviso?: string;
    secao?: string;
    desfazer?: string;
    /** O que se escreveu nos contactos, de volta depois de uma recusa (`c_<campo>`). */
    [campo: `c_${string}`]: string | undefined;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // O nome e não o identificador: é por ele que se reconhece um separador.
  const nome = temChaveDeServico()
    ? (await listarRegioes().catch(() => [])).find((r) => r.id === id)?.name
    : undefined;
  return { title: nome ?? 'Região' };
}

const maiusculaInicial = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Quem criou uma linha numa migração não é ninguém da casa: é a instalação. */
function autor(quem: string | null): string {
  if (!quem) return '';
  return quem.startsWith('migracao-') ? 'a instalação' : quemFez(quem);
}

/**
 * A ficha de uma região, PELA ORDEM EM QUE SE USA (P4-023).
 *
 * Abria com «Desligar a região» — o gesto mais raro e o mais perigoso, no
 * primeiro ecrã de um telemóvel — e escondia a tarefa de todos os dias, que é
 * escrever um aviso, numa ligação de texto mais abaixo. Agora: os avisos; o
 * endereço; os módulos; quem tem papel; as licenças; o rasto; e, no fim, numa
 * zona à parte, o que tira o sítio do ar — com o nome da região escrito para
 * confirmar (P4-011, P4-013).
 *
 * CADA UM VÊ O QUE PODE FAZER. A ficha é de quem gere a região e do dono; o
 * gestor não vê as licenças (o contrato é da casa com o cliente), nem as
 * pessoas, nem a zona de perigo — e o endereço, para ele, só se lê.
 *
 * E FALA A LÍNGUA DE QUEM A USA (P4-022): endereço principal, e não
 * «canónico»; a página do Paragem.pt, e não a «montra»; os modos pelo nome,
 * sem os identificadores ao lado. O pormenor técnico — o `regiao.yaml`, o que
 * o CI confere — está recolhido no fim, para quem gere a instalação.
 */
export default async function FichaDaRegiao({ params, searchParams }: Props) {
  const [{ id }, pedidos] = await Promise.all([params, searchParams]);
  const { aviso, secao, desfazer } = pedidos;
  if (!IDENTIFICADOR.test(id)) notFound();
  const dentro = await paginaDaRegiao(id, 'gestor');
  const dono = dentro.dono;
  if (!temChaveDeServico()) return <SemChaveDeServico titulo="A região" />;

  const [regioes, aliases, modulos, licencas, acoes, avisos, noArmazem, pessoas, contactos] =
    await Promise.all([
      listarRegioes(),
      listarAliases(),
      listarModulos(),
      // As licenças são o contrato da casa com cada cliente: só o dono as lê.
      dono ? listarLicencas() : Promise.resolve([]),
      acoesDaRegiao(id, 10, dono),
      avisosDaRegiao(id),
      // A declaração da região, tal como o pipeline a publicou: é daqui que
      // vem a lista dos modos que ela tem. `null` sem dados publicados.
      fichaNoArmazem(id).catch(() => null),
      dono ? pessoasDaRegiao(id) : Promise.resolve([]),
      contactosDoPainel(id),
    ]);
  const regiao = regioes.find((r) => r.id === id);
  if (!regiao) notFound();

  const osAlias = aliases.filter((a) => a.region_id === id);
  const estadoDoModulo = new Map(modulos.filter((m) => m.region_id === id).map((m) => [m.id, m]));
  const asLicencas = licencas.filter((l) => l.region_id === id);
  const licenca = estadoDaLicenca(asLicencas, diaNoFuso(new Date()));
  const ficha = `/admin/regioes/${encodeURIComponent(id)}/`;
  const agora = new Date();
  const noAr = avisos.filter((a) => a.publicado && emVigor(a, agora));
  const rascunhos = avisos.filter((a) => !a.publicado).length;

  // OS MODOS QUE A REGIÃO TEM — os ligados e os que o painel desligou. Os que
  // ela não declara não têm interruptor: desligar o que não existe é sinal de
  // que alguém confundiu regiões, e a ficha deixava escrito «FlixBus» e «CP»
  // em regiões sem expressos nem comboios (P4-022).
  const declarados = noArmazem
    ? MODULOS.filter(
        (m) => noArmazem.modos.includes(m) || (noArmazem.modos_desligados ?? []).includes(m),
      )
    : null;
  const comInterruptor = declarados ?? [...MODULOS];
  const semEles = declarados ? MODULOS.filter((m) => !declarados.includes(m)) : [];

  const mensagem = (s: string) => (secao === s ? aviso : undefined);
  const frase = naFrase(regiao);

  return (
    <>
      <IrParaSecao secao={secao} />
      <h1>{regiao.name}</h1>

      {/* O ESTADO É A FRASE DE ENTRADA, e não um cartão: diz-se uma vez, por
          baixo do nome, e o que se faz com ele está nos sítios próprios — ligar
          aqui, quando há o que ligar; desligar na zona de perigo. */}
      <section aria-label="Estado" id="estado" className="estado-da-regiao">
        <Aviso texto={mensagem('estado') ?? (secao ? undefined : aviso)} />
        <p className={regiao.is_enabled ? 'entrada' : 'entrada alerta-texto'}>
          {regiao.is_enabled ? (
            <>
              <strong>No ar</strong> em{' '}
              <a href={`https://${regiao.domain}/`} rel="noreferrer">
                {regiao.domain}
              </a>
              .
            </>
          ) : (
            <>
              <strong>{frase.adj('Desligad')}.</strong> Quem abre {regiao.domain} vê a página do
              Paragem.pt, e não os transportes {frase.de}.
            </>
          )}
          {dono ? ` ${licenca.texto}` : null}
        </p>
        {/* LIGAR é o gesto de quem estreia uma região, e por isso está aqui e
            não na zona de perigo — mas só quando há o que ligar (P4-015). */}
        {dono && !regiao.is_enabled ? (
          noArmazem ? (
            <form action={ligarOuDesligarRegiao} className="em-linha">
              <input type="hidden" name="regiao" value={regiao.id} />
              <input type="hidden" name="ligar" value="1" />
              <button type="submit">Ligar {frase.com}</button>
            </form>
          ) : (
            <p className="secundario-texto">
              Ainda não há dados {frase.de} publicados, e ligar agora punha {regiao.domain} a
              responder «página não encontrada». O botão aparece aqui quando a primeira construção
              estiver publicada.
            </p>
          )
        ) : null}
      </section>

      <section aria-labelledby="titulo-avisos" id="avisos" className="cartao">
        <h2 id="titulo-avisos">Avisos</h2>
        {noAr.length === 0 ? (
          <p>Nada no ar agora — que é o estado normal de uma rede sem perturbações.</p>
        ) : (
          <>
            <p>
              <strong>
                {noAr.length === 1 ? '1 aviso no ar' : `${noAr.length} avisos no ar`}:
              </strong>{' '}
              {lista(noAr.map((a) => `«${a.titulo}»`))}.
            </p>
          </>
        )}
        <p className="linha-accoes">
          <Link href={`${ficha}avisos/#escrever`} className="botao primario">
            Escrever um aviso
          </Link>
          <Link href={`${ficha}avisos/`}>
            {rascunhos > 0
              ? `Ver todos, com ${rascunhos === 1 ? 'o rascunho' : `os ${rascunhos} rascunhos`}`
              : 'Ver todos os avisos'}
          </Link>
        </p>
      </section>

      <section aria-labelledby="titulo-endereco" id="endereco" className="cartao">
        <h2 id="titulo-endereco">Endereço</h2>
        <Aviso texto={mensagem('endereco')} />
        <dl className="pares">
          <dt>Endereço principal</dt>
          <dd>
            <a href={`https://${regiao.domain}/`} rel="noreferrer">
              {regiao.domain}
            </a>
          </dd>
          <dt>Outros endereços</dt>
          <dd>
            {osAlias.length === 0 ? (
              'nenhum'
            ) : (
              <ul className="lista-simples">
                {osAlias.map((alias) => (
                  <li key={alias.domain}>
                    {alias.domain}
                    {dono ? (
                      <details className="perigo em-linha-curta">
                        <summary>Retirar…</summary>
                        <p>
                          {alias.domain} deixa de levar ao endereço principal: quem o usar fica sem
                          resposta.
                        </p>
                        <form action={retirarAlias}>
                          <input type="hidden" name="regiao" value={regiao.id} />
                          <input type="hidden" name="dominio" value={alias.domain} />
                          <button type="submit" className="perigo">
                            Retirar {alias.domain}
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
        <p className="secundario-texto">
          Um endereço a mais leva sempre ao principal — nunca mostra uma cópia do sítio.
        </p>
        {dono ? (
          <form action={acrescentarAlias} className="formulario">
            <input type="hidden" name="regiao" value={regiao.id} />
            <label htmlFor="alias">Acrescentar um endereço que leve ao principal</label>
            <input
              id="alias"
              name="dominio"
              type="text"
              required
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="alias-ajuda"
            />
            <p id="alias-ajuda" className="secundario-texto">
              Só o domínio, sem https:// — por exemplo, <code>www.{regiao.domain}</code>. Se colares
              o endereço inteiro, o painel fica só com o domínio. Responde depois de entrar também
              no DNS e no projeto da plataforma.
            </p>
            <button type="submit" className="secundario">
              Acrescentar
            </button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="titulo-modulos" id="modulos" className="cartao">
        <h2 id="titulo-modulos">Modos de transporte</h2>
        <Aviso texto={mensagem('modulos')}>
          {desfazer && MODULOS.includes(desfazer as (typeof MODULOS)[number]) ? (
            <form action={alternarModulo}>
              <input type="hidden" name="regiao" value={regiao.id} />
              <input type="hidden" name="modulo" value={desfazer} />
              <input type="hidden" name="ligar" value="1" />
              <button type="submit" className="secundario">
                Desfazer: voltar a ligar {nomeDoModulo(desfazer).toLowerCase()}
              </button>
            </form>
          ) : null}
        </Aviso>
        <p className="secundario-texto">
          Desligar um modo tira-o do sítio — a página dele, os pontos no mapa, a procura, os
          ficheiros e as viagens do planeador — sem apagar nada: volta quando o ligares.
          {declarados === null
            ? ' Sem dados publicados não se sabe que modos a região tem: mostram-se os sete.'
            : ''}
        </p>
        <ul className="interruptores">
          {comInterruptor.map((modulo) => {
            const linha = estadoDoModulo.get(modulo);
            const ligado = linha?.is_enabled ?? true;
            const nome = nomeDoModulo(modulo);
            return (
              <li key={modulo}>
                <div>
                  <p>
                    <strong>{nome}</strong>{' '}
                    <span className={`estado${ligado ? '' : ' alerta-texto'}`}>
                      {ligado ? '— no sítio' : '— desligado'}
                    </span>
                  </p>
                  {!ligado && linha ? (
                    <p className="secundario-texto">
                      Desligado a {dataPorExtenso(diaNoFuso(linha.updated_at))}
                      {linha.updated_by ? `, por ${autor(linha.updated_by)}` : ''}.
                    </p>
                  ) : null}
                </div>
                {ligado ? (
                  <details className="perigo">
                    <summary>Desligar…</summary>
                    <p>
                      {nome} sai do sítio {frase.de} à próxima visita de cada página. Os dados ficam
                      guardados.
                    </p>
                    <form action={alternarModulo}>
                      <input type="hidden" name="regiao" value={regiao.id} />
                      <input type="hidden" name="modulo" value={modulo} />
                      <input type="hidden" name="ligar" value="0" />
                      <input type="hidden" name="confirmado" value="1" />
                      <button type="submit" className="perigo">
                        Desligar {nome.toLowerCase()}
                      </button>
                    </form>
                  </details>
                ) : (
                  <form action={alternarModulo}>
                    <input type="hidden" name="regiao" value={regiao.id} />
                    <input type="hidden" name="modulo" value={modulo} />
                    <input type="hidden" name="ligar" value="1" />
                    <button type="submit" className="secundario pequeno">
                      Ligar {nome.toLowerCase()}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {semEles.length > 0 ? (
          <p className="secundario-texto">
            {frase.Com} não tem {lista(semEles.map((m) => nomeDoModulo(m).toLowerCase()))}: não há
            nada para ligar.
          </p>
        ) : null}
      </section>

      {/* OS CONTACTOS DA DECLARAÇÃO E DA PRIVACIDADE (P4-024). A declaração de
          acessibilidade dizia «Por preencher» também na região a sério, e não
          havia onde a autoridade pusesse o contacto. São da autoridade, e por
          isso de quem gere a região — guardados na base, com rasto. */}
      <section aria-labelledby="titulo-contactos" id="contactos" className="cartao">
        <h2 id="titulo-contactos">Acessibilidade e privacidade</h2>
        <Aviso texto={mensagem('contactos')} />
        {contactos === 'por-aplicar' ? (
          <>
            <p>
              Esta instalação ainda não guarda estes contactos: a declaração de acessibilidade e a
              página de privacidade dizem «Por preencher».
            </p>
            <details className="para-quem-gere">
              <summary>Para quem gere a instalação</summary>
              <p>
                Falta aplicar à base a migração <code>0010_os_contactos</code> (
                <code>supabase/migrations/</code>), como as anteriores. Este ecrã muda sozinho
                quando ela lá estiver.
              </p>
            </details>
          </>
        ) : (
          <>
            <p className="secundario-texto">
              O que as páginas{' '}
              <a href={`https://${regiao.domain}/acessibilidade/`}>Acessibilidade</a> e{' '}
              <a href={`https://${regiao.domain}/privacidade/`}>Privacidade</a> {frase.de} dizem a
              quem quer reclamar ou saber dos dados. O que ficar em branco aparece como «Por
              preencher»: um contacto inventado é pior do que nenhum, porque quem reclama fica à
              espera.
            </p>
            <form action={guardarContactos} className="formulario formulario-largo">
              <input type="hidden" name="regiao" value={regiao.id} />
              <fieldset className="grupo-de-campos">
                <legend>Acessibilidade</legend>
                <label htmlFor="acessibilidade_email">Email para problemas de acessibilidade</label>
                <input
                  id="acessibilidade_email"
                  name="acessibilidade_email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={
                    pedidos.c_acessibilidade_email ?? contactos?.acessibilidade_email ?? ''
                  }
                />
                <label htmlFor="acessibilidade_telefone">
                  Telefone <span className="opcional">(opcional)</span>
                </label>
                <input
                  id="acessibilidade_telefone"
                  name="acessibilidade_telefone"
                  type="tel"
                  autoComplete="off"
                  defaultValue={
                    pedidos.c_acessibilidade_telefone ?? contactos?.acessibilidade_telefone ?? ''
                  }
                />
                <label htmlFor="reclamacao_url">
                  Onde se reclama <span className="opcional">(opcional)</span>
                </label>
                <input
                  id="reclamacao_url"
                  name="reclamacao_url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={pedidos.c_reclamacao_url ?? contactos?.reclamacao_url ?? ''}
                  aria-describedby="reclamacao-ajuda"
                />
                <p id="reclamacao-ajuda" className="secundario-texto">
                  A página onde se apresenta uma reclamação quando a resposta não chega ou não
                  resolve. Sem ela, a declaração diz que o mecanismo está por indicar.
                </p>
              </fieldset>
              <fieldset className="grupo-de-campos">
                <legend>Privacidade</legend>
                <fieldset className="pilulas-de-escolha">
                  <legend>Quem responde pelos dados das medições do sítio</legend>
                  <div className="pilulas">
                    {(
                      [
                        [
                          'autoridade',
                          maiusculaInicial(
                            aAutoridade(noArmazem ?? { autoridade: {} }, 'com_artigo'),
                          ),
                        ],
                        ['outra', 'Outra entidade'],
                        ['por-preencher', 'Ainda não se sabe'],
                      ] as const
                    ).map(([valor, nome]) => (
                      <label key={valor}>
                        <input
                          type="radio"
                          name="responsavel"
                          value={valor}
                          defaultChecked={
                            (pedidos.c_responsavel ?? contactos?.responsavel ?? 'por-preencher') ===
                            valor
                          }
                        />
                        {nome}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="em-linha">
                  <div>
                    <label htmlFor="responsavel_nome">Nome da outra entidade</label>
                    <input
                      id="responsavel_nome"
                      name="responsavel_nome"
                      type="text"
                      defaultValue={pedidos.c_responsavel_nome ?? contactos?.responsavel_nome ?? ''}
                      aria-describedby="responsavel-ajuda"
                    />
                  </div>
                  <div>
                    <label htmlFor="responsavel_artigo">Artigo</label>
                    <select
                      id="responsavel_artigo"
                      name="responsavel_artigo"
                      defaultValue={
                        pedidos.c_responsavel_artigo ?? contactos?.responsavel_artigo ?? ''
                      }
                    >
                      <option value="">sem artigo</option>
                      <option value="a">a</option>
                      <option value="o">o</option>
                      <option value="as">as</option>
                      <option value="os">os</option>
                    </select>
                  </div>
                </div>
                <p id="responsavel-ajuda" className="secundario-texto">
                  Só com «Outra entidade». O artigo é o da frase «o responsável pelo tratamento é a
                  …» — sem artigo, o nome vai sozinho, e nunca se adivinha um.
                </p>
                <label htmlFor="privacidade_email">
                  Email para questões de privacidade <span className="opcional">(opcional)</span>
                </label>
                <input
                  id="privacidade_email"
                  name="privacidade_email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={pedidos.c_privacidade_email ?? contactos?.privacidade_email ?? ''}
                />
              </fieldset>
              <button type="submit">Guardar os contactos</button>
            </form>
            {contactos ? (
              <p className="secundario-texto">
                Mudados pela última vez a {porExtenso(contactos.updated_at)}.
              </p>
            ) : null}
          </>
        )}
      </section>

      {dono ? (
        <section aria-labelledby="titulo-pessoas" id="pessoas" className="cartao">
          <h2 id="titulo-pessoas">Quem trabalha nesta região</h2>
          {pessoas.length === 0 ? (
            <p>Ninguém, além de ti.</p>
          ) : (
            <ul className="lista-simples">
              {pessoas.map((p) => (
                <li key={p.id}>
                  <strong>{p.nome}</strong>, {nomeDoPapel(p.papel)}
                  {p.ativa ? '' : ' (desativada)'}
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/admin/pessoas/">Convidar ou mudar papéis em «Pessoas»</Link>
          </p>
        </section>
      ) : null}

      {dono ? (
        <section aria-labelledby="titulo-licencas" id="licencas" className="cartao">
          <h2 id="titulo-licencas">Licenças</h2>
          <Aviso texto={mensagem('licencas')} />
          <p className={licenca.alerta ? 'alerta-texto' : undefined}>{licenca.texto}</p>
          <p className="secundario-texto">
            Uma linha por contrato ou renovação, nunca reescrita. Expirar avisa; desligar é sempre
            um gesto de alguém, na zona de perigo.
          </p>
          {asLicencas.length > 0 ? (
            <div
              className="rolavel"
              tabIndex={0}
              role="region"
              aria-label="As licenças, deslocável na horizontal"
            >
              <table className="registo">
                <caption className="so-para-leitores">
                  O histórico das licenças desta região
                </caption>
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
                      <td>{autor(l.created_by)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <details className="mexer">
            <summary>Registar uma licença</summary>
            <form action={registarLicenca} className="formulario">
              <input type="hidden" name="regiao" value={regiao.id} />
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
                placeholder="contrato, piloto, demonstração"
              />
              <label htmlFor="notas">Notas</label>
              <input id="notas" name="notas" type="text" />
              <button type="submit" className="secundario">
                Registar
              </button>
            </form>
          </details>
        </section>
      ) : null}

      <section aria-labelledby="titulo-rasto" id="rasto" className="cartao">
        <h2 id="titulo-rasto">O que se mexeu nesta região</h2>
        {acoes.length === 0 ? (
          <p className="secundario-texto">Ainda ninguém mexeu nesta região pelo painel.</p>
        ) : (
          <ul className="lista-simples rasto">
            {acoes.map((acao) => (
              <li key={acao.id}>
                <p>
                  <strong>{quemFez(acao.actor)}</strong> {nomeDaAcao(acao.action)}
                  <span className="secundario-texto"> · {porExtenso(acao.created_at)}</span>
                </p>
                <Mudanca before={acao.before} after={acao.after} />
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/admin/auditoria/">Toda a auditoria</Link>
        </p>
      </section>

      {dono ? (
        <section aria-labelledby="titulo-perigo" id="perigo" className="cartao zona-de-perigo">
          <h2 id="titulo-perigo">Zona de perigo</h2>
          <Aviso texto={mensagem('perigo')} />
          <p>
            O que está aqui tira o sítio {frase.de} do ar, ou muda onde ele responde. Cada gesto
            pede o nome da região escrito, e fica na auditoria.
          </p>

          {regiao.is_enabled ? (
            <details className="perigo">
              <summary>Desligar {frase.com}…</summary>
              <p>
                Em cinco minutos, no máximo, {regiao.domain} deixa de mostrar os transportes e passa
                a mostrar a página do Paragem.pt. Os dados e os avisos ficam guardados, e volta-se a
                ligar no topo desta página. Nunca se desliga a última região ligada.
              </p>
              <form action={ligarOuDesligarRegiao} className="formulario">
                <input type="hidden" name="regiao" value={regiao.id} />
                <input type="hidden" name="ligar" value="0" />
                <label htmlFor="confirmar-desligar">
                  Para confirmar, escreve <strong>{regiao.name}</strong>
                </label>
                <input
                  id="confirmar-desligar"
                  name="confirmacao"
                  type="text"
                  required
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="perigo">
                  Desligar {frase.com}
                </button>
              </form>
            </details>
          ) : null}

          <details className="perigo">
            <summary>Mudar o endereço principal…</summary>
            <p>
              É o dia em que a autoridade traz o domínio dela. Pela ordem: (1) acrescenta o endereço
              novo em «Endereço», mais acima; (2) trata do DNS e do projeto da plataforma; (3) volta
              aqui. O painel confirma que o endereço novo já responde antes de mudar — mudar antes
              punha o sítio em baixo.
            </p>
            <form action={mudarDominio} className="formulario">
              <input type="hidden" name="regiao" value={regiao.id} />
              <label htmlFor="dominio-novo">O endereço novo</label>
              {osAlias.length > 0 ? (
                <select id="dominio-novo" name="dominio" required defaultValue="">
                  <option value="" disabled>
                    Escolher um dos outros endereços…
                  </option>
                  {osAlias.map((a) => (
                    <option key={a.domain} value={a.domain}>
                      {a.domain}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="dominio-novo"
                  name="dominio"
                  type="text"
                  required
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="dominio-novo-ajuda"
                />
              )}
              {osAlias.length === 0 ? (
                <p id="dominio-novo-ajuda" className="secundario-texto">
                  Ainda não há outros endereços: acrescenta primeiro o novo em «Endereço».
                </p>
              ) : null}
              <label className="caixa">
                <input type="checkbox" name="manter_alias" value="1" defaultChecked />
                {regiao.domain} fica a levar ao endereço novo
              </label>
              <label className="caixa">
                <input type="checkbox" name="mesmo_sem_resposta" value="1" />
                Mudar mesmo que o endereço novo ainda não responda — sei que o sítio fica em baixo
                até responder
              </label>
              <label htmlFor="confirmar-dominio">
                Para confirmar, escreve <strong>{regiao.name}</strong>
              </label>
              <input
                id="confirmar-dominio"
                name="confirmacao"
                type="text"
                required
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="perigo">
                Mudar o endereço principal
              </button>
            </form>
          </details>
        </section>
      ) : null}

      {dono ? (
        <details className="para-quem-gere">
          <summary>Para quem gere a instalação</summary>
          <dl className="pares">
            <dt>Identificador</dt>
            <dd>
              <code>{regiao.id}</code>
            </dd>
            <dt>Nome e artigo</dt>
            <dd>
              «{regiao.article} {regiao.name}» — vêm do <code>regiao.yaml</code> da região e não se
              mudam aqui; o CI confere que a base diz o mesmo.
            </dd>
            <dt>Endereço</dt>
            <dd>
              O <code>dominio:</code> do <code>regiao.yaml</code> tem de dizer o mesmo que o
              endereço principal (o CI reprova a diferença), e o domínio tem de estar no projeto da
              plataforma (<code>docs/NOVA-REGIAO.md</code>, passo 4).
            </dd>
            <dt>Modos</dt>
            <dd>
              Que fonte alimenta cada modo é da receita da região (<code>fontes.yaml</code>), e não
              daqui. Os interruptores guardam-se em <code>modulos</code>, com rasto.
            </dd>
          </dl>
        </details>
      ) : null}

      <p>
        <Link href="/admin/">{dono ? 'Todas as regiões' : 'O início'}</Link>
      </p>
    </>
  );
}
