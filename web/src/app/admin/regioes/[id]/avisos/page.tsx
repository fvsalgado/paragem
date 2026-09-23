import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Aviso from '@/componentes/painel/Aviso';
import SemChaveDeServico from '@/componentes/painel/SemChaveDeServico';
import { IDENTIFICADOR, regiao as fichaNoArmazem } from '@/lib/dados';
import { CAUSAS, EFEITOS, GRAVIDADES, emVigor } from '@/lib/avisos';
import { FUSO, paraCampoLocal, porExtenso } from '@/lib/fuso';
import { apagarAviso, guardarAviso, publicarAviso } from '@/lib/painel/acoes';
import { temChaveDeServico } from '@/lib/painel/base';
import { avisosDaRegiao } from '@/lib/painel/avisos';
import { listarRegioes } from '@/lib/painel/consultas';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; editar?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Avisos · ${id}` };
}

/**
 * Os avisos de uma região: escrever, publicar, retirar, apagar.
 *
 * UM FORMULÁRIO SÓ, e não um por aviso. Editar é o mesmo formulário com
 * `?editar=<id>`, preenchido — o que evita ter dezenas de formulários abertos
 * numa página e um leitor de ecrã a anunciar vinte «Título» seguidos.
 *
 * E PUBLICAR É UM BOTÃO À PARTE de gravar, porque são dois gestos com
 * consequências diferentes: gravar é para mim, publicar é para toda a gente.
 */
export default async function AvisosDaRegiao({ params, searchParams }: Props) {
  const [{ id }, { aviso, editar }] = await Promise.all([params, searchParams]);
  if (!IDENTIFICADOR.test(id)) notFound();
  if (!temChaveDeServico()) return <SemChaveDeServico titulo={`Avisos · ${id}`} />;

  const [regioes, avisos, noArmazem] = await Promise.all([
    listarRegioes(),
    avisosDaRegiao(id),
    fichaNoArmazem(id).catch(() => null),
  ]);
  const regiao = regioes.find((r) => r.id === id);
  if (!regiao) notFound();

  const aEditar = editar ? (avisos.find((a) => a.id === editar) ?? null) : null;
  const agora = new Date();
  const noAr = avisos.filter((a) => a.publicado && emVigor(a, agora));
  const modos = noArmazem?.modos ?? [];

  return (
    <>
      <h1>
        Avisos <span className="secundario-texto">{regiao.name}</span>
      </h1>
      <p className="entrada">
        O que a autoridade de transportes tem a dizer hoje: supressões, desvios, greves. O que
        estiver publicado e em vigor aparece na página de avisos da região, na faixa do catálogo e
        no feed <code>GTFS-RT Service Alerts</code>, que outras aplicações leem.
      </p>

      <Aviso texto={aviso} />

      <section aria-labelledby="estado" className="cartao">
        <h2 id="estado">Agora no ar</h2>
        {noAr.length === 0 ? (
          <p>
            Nada publicado e em vigor. A página de avisos de{' '}
            <a href={`https://${regiao.domain}/avisos/`}>{regiao.domain}</a> diz que não há avisos,
            e o feed sai vazio — que é o estado normal.
          </p>
        ) : (
          <p>
            <strong>
              {noAr.length} {noAr.length === 1 ? 'aviso' : 'avisos'} no ar.
            </strong>{' '}
            Em <a href={`https://${regiao.domain}/avisos/`}>{regiao.domain}/avisos/</a> e em{' '}
            <a href={`https://${regiao.domain}/gtfs-rt/alerts.pb`}>gtfs-rt/alerts.pb</a>.
          </p>
        )}
      </section>

      <section aria-labelledby="escrever" className="cartao">
        <h2 id="escrever">{aEditar ? 'Corrigir este aviso' : 'Escrever um aviso'}</h2>
        <form action={guardarAviso} className="formulario">
          <input type="hidden" name="regiao" value={regiao.id} />
          {aEditar ? <input type="hidden" name="id" value={aEditar.id} /> : null}

          <label htmlFor="titulo">Título</label>
          <input
            id="titulo"
            name="titulo"
            type="text"
            required
            maxLength={120}
            defaultValue={aEditar?.titulo ?? ''}
            aria-describedby="titulo-ajuda"
          />
          <p id="titulo-ajuda" className="secundario-texto">
            Uma linha, a dizer o que aconteceu: «Linha 10 desviada em Vale Escuro».
          </p>

          <label htmlFor="texto">Texto</label>
          <textarea
            id="texto"
            name="texto"
            required
            rows={4}
            defaultValue={aEditar?.texto ?? ''}
            aria-describedby="texto-ajuda"
          />
          <p id="texto-ajuda" className="secundario-texto">
            O que quem está na paragem precisa de saber para decidir: por onde passa, que paragens
            não são servidas, o que fazer em vez disso.
          </p>

          <div className="em-linha">
            <div>
              <label htmlFor="gravidade">Gravidade</label>
              <select
                id="gravidade"
                name="gravidade"
                defaultValue={aEditar?.gravidade ?? 'WARNING'}
              >
                {Object.entries(GRAVIDADES).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="causa">Causa</label>
              <select id="causa" name="causa" defaultValue={aEditar?.causa ?? 'UNKNOWN_CAUSE'}>
                {Object.entries(CAUSAS).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="efeito">Efeito</label>
              <select id="efeito" name="efeito" defaultValue={aEditar?.efeito ?? 'OTHER_EFFECT'}>
                {Object.entries(EFEITOS).map(([v, nome]) => (
                  <option key={v} value={v}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="secundario-texto">
            A gravidade decide a cor da faixa; a causa e o efeito são os campos que o GTFS-RT leva,
            e é por eles que outra aplicação sabe se isto é um desvio ou uma supressão.
          </p>

          <div className="em-linha">
            <div>
              <label htmlFor="inicio">Começa</label>
              <input
                id="inicio"
                name="inicio"
                type="datetime-local"
                defaultValue={paraCampoLocal(aEditar?.inicio ?? null)}
                aria-describedby="prazo-ajuda"
              />
            </div>
            <div>
              <label htmlFor="fim">Acaba</label>
              <input
                id="fim"
                name="fim"
                type="datetime-local"
                defaultValue={paraCampoLocal(aEditar?.fim ?? null)}
              />
            </div>
          </div>
          <p id="prazo-ajuda" className="secundario-texto">
            Horas de <strong>{FUSO}</strong>. Em branco no começo quer dizer «já está a acontecer»;
            em branco no fim quer dizer «não se sabe quando acaba», que é o caso mais honesto numa
            avaria — e é assim que sai no feed. Passado o fim, o aviso deixa de aparecer sozinho.
          </p>

          <label htmlFor="linhas">Linhas</label>
          <input
            id="linhas"
            name="linhas"
            type="text"
            defaultValue={(aEditar?.linhas ?? []).join(', ')}
            aria-describedby="entidades-ajuda"
          />
          <label htmlFor="paragens">Paragens</label>
          <input
            id="paragens"
            name="paragens"
            type="text"
            defaultValue={(aEditar?.paragens ?? []).join(', ')}
          />
          <label htmlFor="modos">Modos</label>
          <input
            id="modos"
            name="modos"
            type="text"
            defaultValue={(aEditar?.modos ?? []).join(', ')}
            aria-describedby="modos-ajuda"
          />
          <p id="entidades-ajuda" className="secundario-texto">
            Identificadores do GTFS desta região, separados por vírgula — os mesmos que aparecem nos
            endereços das páginas de linha e de paragem.{' '}
            <strong>Deixar tudo em branco quer dizer «a rede toda»</strong>, que é o que a
            especificação manda e é raro: convém ser de propósito.
          </p>
          <p id="modos-ajuda" className="secundario-texto">
            {modos.length
              ? `Esta região declara: ${modos.join(', ')}.`
              : 'Sem dados no armazém, não se sabe que modos esta região declara.'}
          </p>

          <label htmlFor="url">Mais informação (endereço)</label>
          <input
            id="url"
            name="url"
            type="url"
            defaultValue={aEditar?.url ?? ''}
            aria-describedby="url-ajuda"
          />
          <p id="url-ajuda" className="secundario-texto">
            Opcional: a página da autoridade ou da operadora com o pormenor.
          </p>

          <div className="em-linha">
            <button type="submit">{aEditar ? 'Gravar as correções' : 'Gravar'}</button>
            {aEditar ? (
              <Link href={`/admin/regioes/${encodeURIComponent(id)}/avisos/`}>
                Deixar de corrigir
              </Link>
            ) : null}
          </div>
          <p className="secundario-texto">
            Gravar não publica. Um aviso nasce por publicar — quem o escreve a meio de uma
            ocorrência não devia ter de escolher entre gravar a meio e mostrar a meio.
          </p>
        </form>
      </section>

      <section aria-labelledby="todos" className="cartao">
        <h2 id="todos">Todos os avisos desta região</h2>
        {avisos.length === 0 ? (
          <p className="secundario-texto">Ainda não há nenhum.</p>
        ) : (
          <ul className="lista-simples">
            {avisos.map((a) => {
              const vigente = emVigor(a, agora);
              return (
                <li key={a.id} id={`aviso-${a.id}`} className="cartao">
                  <h3>{a.titulo}</h3>
                  <p>
                    <strong className={a.publicado ? undefined : 'secundario-texto'}>
                      {a.publicado ? 'Publicado' : 'Rascunho'}
                    </strong>
                    {a.publicado && !vigente ? (
                      <span className="secundario-texto">
                        {' '}
                        · fora de prazo, não aparece no sítio
                      </span>
                    ) : null}
                  </p>
                  <p>{a.texto}</p>
                  <p className="secundario-texto">
                    {GRAVIDADES[a.gravidade as keyof typeof GRAVIDADES] ?? a.gravidade} ·{' '}
                    {CAUSAS[a.causa as keyof typeof CAUSAS] ?? a.causa} ·{' '}
                    {EFEITOS[a.efeito as keyof typeof EFEITOS] ?? a.efeito}
                    {a.inicio ? ` · desde ${porExtenso(a.inicio)}` : ' · já a acontecer'}
                    {a.fim ? ` até ${porExtenso(a.fim)}` : ', sem fim previsto'}
                  </p>
                  <p className="secundario-texto">
                    {a.linhas.length || a.paragens.length || a.modos.length
                      ? [
                          a.linhas.length ? `linhas ${a.linhas.join(', ')}` : '',
                          a.paragens.length ? `paragens ${a.paragens.join(', ')}` : '',
                          a.modos.length ? `modos ${a.modos.join(', ')}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'a rede toda'}
                    {' · '}escrito por {a.created_by}
                  </p>
                  <div className="em-linha">
                    <form action={publicarAviso}>
                      <input type="hidden" name="regiao" value={regiao.id} />
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="publicar" value={a.publicado ? '0' : '1'} />
                      <button type="submit" className={a.publicado ? 'secundario' : undefined}>
                        {a.publicado ? 'Retirar' : 'Publicar'}
                      </button>
                    </form>
                    <Link
                      href={`/admin/regioes/${encodeURIComponent(id)}/avisos/?editar=${encodeURIComponent(a.id)}#escrever`}
                    >
                      Corrigir
                    </Link>
                    <form action={apagarAviso}>
                      <input type="hidden" name="regiao" value={regiao.id} />
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="secundario pequeno">
                        Apagar
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="secundario-texto">
          Retirar é «isto deixou de ser verdade»; apagar é «isto nunca devia ter sido escrito».
          Apagar guarda o aviso inteiro na auditoria — apagar não é esquecer.
        </p>
      </section>

      <p>
        <Link href={`/admin/regioes/${encodeURIComponent(id)}/`}>Voltar à ficha da região</Link>
        {' · '}
        <Link href="/admin/auditoria/?tipo=aviso">A auditoria dos avisos</Link>
      </p>
    </>
  );
}
