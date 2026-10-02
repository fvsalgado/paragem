import { Fragment } from 'react';
import Distintivo from '@/componentes/Distintivo';
import {
  causaDeclarada,
  efeitoDeclarado,
  emVigor,
  nomeDaCausa,
  nomeDoEfeito,
  quandoVale,
  redeToda,
  type Aviso,
  type LinhaDoAviso,
} from '@/lib/avisos';

/**
 * O que um cartão de aviso precisa de saber da rede para falar a língua de
 * quem viaja: o número e o nome de cada linha, o nome de cada paragem, o nome
 * de cada modo. Sem ele, o aviso dizia «RA11» e «pam_fonte» — os
 * identificadores do GTFS, que ninguém na paragem reconhece (P2-025).
 */
export type CatalogoDosAvisos = {
  linhas: ReadonlyMap<string, LinhaDoAviso & { modo?: string }>;
  paragens: ReadonlyMap<string, string>;
  modos?: Readonly<Record<string, string>>;
};

const SEM_CATALOGO: CatalogoDosAvisos = { linhas: new Map(), paragens: new Map() };

const maiuscula = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Um aviso, como quem está na paragem precisa de o ler — e é o MESMO cartão na
 * página de avisos, na da linha, na da paragem e na pré-visualização do
 * painel. Quem escreve vê o que o público vai ver, letra a letra (P4-017).
 *
 * O QUE MUDOU, e porquê:
 *
 *   · AS LINHAS AFETADAS À VISTA, com o número e a cor que a linha tem no
 *     resto do sítio, e a levar à página dela. Um aviso que não dizia a que
 *     linhas se aplicava obrigava a lê-lo inteiro para saber se era connosco;
 *   · O EFEITO EM CIMA, numa etiqueta — «Desvio», «Sem serviço» —, porque é a
 *     primeira pergunta de quem lê. E SÓ QUANDO FOI DECLARADO: o público lia
 *     «causa não declarada · outro efeito», que são os valores por omissão do
 *     formulário e não querem dizer nada a ninguém (P4-018);
 *   · O PRAZO NUMA FRASE QUE SE LÊ SOZINHA, no fuso da região e não no do
 *     servidor (`quandoVale`).
 *
 * A gravidade decide a cor e mais nada: `SEVERE` leva o vermelho de alerta,
 * `WARNING` o âmbar, o resto o azul da marca.
 */
export function CartaoDeAviso({
  aviso,
  catalogo = SEM_CATALOGO,
  ligacoes = true,
  nivel = 2,
  fuso,
}: {
  aviso: Aviso;
  catalogo?: CatalogoDosAvisos;
  /**
   * Na pré-visualização do painel, `false`: as ligações levariam ao painel e
   * não ao sítio, e um clique sem querer perdia o que se estava a escrever.
   */
  ligacoes?: boolean;
  /** O nível do título: 2 na página de avisos, 3 dentro da secção de uma linha ou paragem. */
  nivel?: 2 | 3 | 4;
  fuso?: string;
}) {
  const Titulo = nivel === 4 ? 'h4' : nivel === 3 ? 'h3' : 'h2';
  const gravidade =
    aviso.gravidade === 'SEVERE' ? ' grave' : aviso.gravidade === 'WARNING' ? ' atencao' : '';
  const linhas = aviso.linhas.map(
    (id) => catalogo.linhas.get(id) ?? { id, codigo: id, nome: '', cor: null },
  );
  const paragens = aviso.paragens.map((id) => ({ id, nome: catalogo.paragens.get(id) ?? id }));
  const soModos = linhas.length === 0 && paragens.length === 0 && aviso.modos.length > 0;
  const porque = causaDeclarada(aviso.causa) ? maiuscula(nomeDaCausa(aviso.causa)) : '';
  const rodape = [quandoVale(aviso, fuso), porque].filter(Boolean).join(' · ');

  return (
    <article className={`aviso${gravidade}`} id={ligacoes ? `aviso-${aviso.id}` : undefined}>
      {efeitoDeclarado(aviso.efeito) && (
        <p className="etiqueta-do-aviso">{maiuscula(nomeDoEfeito(aviso.efeito))}</p>
      )}
      <Titulo className="titulo-do-aviso">{aviso.titulo || 'Sem título'}</Titulo>
      {linhas.length > 0 && (
        <ul className="linhas-do-aviso" aria-label="Linhas afetadas">
          {linhas.map((l) => {
            const dentro = (
              <>
                <span className="so-para-leitores">Linha </span>
                <Distintivo codigo={l.codigo} cor={l.cor} modo={'modo' in l ? l.modo : undefined} />
                {l.nome && <span className="nome-da-linha-do-aviso">{l.nome}</span>}
              </>
            );
            return (
              <li key={l.id}>
                {ligacoes ? (
                  <a href={`/rede/linhas/${encodeURIComponent(l.id)}/`}>{dentro}</a>
                ) : (
                  <span>{dentro}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {aviso.texto && <p className="texto-do-aviso">{aviso.texto}</p>}
      {rodape && <p className="secundario">{rodape}</p>}
      {paragens.length > 0 && (
        <p className="secundario">
          {paragens.length === 1 ? 'Paragem afetada: ' : 'Paragens afetadas: '}
          {/* NUMA FRASE, e não cada nome num `<span>` à parte: a ligação ao
              nome de uma paragem é um alvo em linha, como qualquer ligação
              num parágrafo (WCAG 2.5.8), e só o é se estiver na frase. */}
          {paragens.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 ? (i === paragens.length - 1 ? ' e ' : ', ') : null}
              {ligacoes ? (
                <a href={`/rede/paragens/${encodeURIComponent(p.id)}/`}>{p.nome}</a>
              ) : (
                p.nome
              )}
            </Fragment>
          ))}
        </p>
      )}
      {soModos && (
        <p className="secundario">
          Vale para: {aviso.modos.map((m) => (catalogo.modos?.[m] ?? m).toLowerCase()).join(', ')}.
        </p>
      )}
      {redeToda(aviso) && <p className="secundario">Vale para a rede toda.</p>}
      {aviso.url && (
        <p>
          {ligacoes ? (
            <a className="mais-informacao" href={aviso.url}>
              Mais informação
            </a>
          ) : (
            <span>Mais informação</span>
          )}
        </p>
      )}
    </article>
  );
}

/**
 * Os avisos que dizem respeito a UMA página — a de uma linha, a de uma
 * paragem —, antes do horário: é aí que se olha (P4-019).
 *
 * Nada quando não há nenhum, e nada quando não se conseguiu ler. Uma página de
 * horários não é o sítio para dizer que a base não respondeu; a de avisos é, e
 * diz.
 */
export function AvisosDaPagina({
  avisos,
  catalogo,
  titulo,
}: {
  avisos: Aviso[];
  catalogo: CatalogoDosAvisos;
  titulo: string;
}) {
  if (avisos.length === 0) return null;
  return (
    <section aria-labelledby="avisos-desta-pagina" className="avisos-da-pagina">
      <h2 id="avisos-desta-pagina">{titulo}</h2>
      {avisos.map((a) => (
        <CartaoDeAviso key={a.id} aviso={a} catalogo={catalogo} nivel={3} />
      ))}
    </section>
  );
}

/**
 * A faixa das páginas que não são a de avisos: os que estão em vigor agora.
 *
 * `null` quando não se conseguiu ler — e aí não se mostra nada, pela mesma
 * razão de cima.
 */
export default function FaixaDeAvisos({
  avisos,
  catalogo,
}: {
  avisos: Aviso[] | null;
  catalogo?: CatalogoDosAvisos;
}) {
  const agora = new Date();
  const mostrar = (avisos ?? []).filter((a) => emVigor(a, agora));
  if (mostrar.length === 0) return null;
  return (
    <section aria-labelledby="avisos">
      <h2 id="avisos">Avisos</h2>
      {mostrar.map((a) => (
        <CartaoDeAviso key={a.id} aviso={a} catalogo={catalogo} nivel={3} />
      ))}
    </section>
  );
}
