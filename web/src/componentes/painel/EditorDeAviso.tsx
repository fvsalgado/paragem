'use client';

import { startTransition, useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CartaoDeAviso, type CatalogoDosAvisos } from '@/componentes/Avisos';
import EscolherVarios, { type OpcaoDeEscolha } from '@/componentes/painel/EscolherVarios';
import { CAUSAS, ondeAparece, type Aviso } from '@/lib/avisos';
import { doCampoLocal } from '@/lib/fuso';
import { guardarAviso, type EstadoDoAviso } from '@/lib/painel/acoes';

/** O que o formulário tem dentro: o que a página dá ao abrir, e o que a recusa devolve. */
export type ValoresDoEditor = {
  titulo: string;
  texto: string;
  gravidade: string;
  causa: string;
  efeito: string;
  /** `datetime-local`, já no fuso da região. */
  inicio: string;
  fim: string;
  url: string;
  linhas: string[];
  paragens: string[];
  modos: string[];
};

export type LinhaDoEditor = {
  id: string;
  codigo: string;
  nome: string;
  cor: string | null;
  modo: string;
};

/**
 * O QUE SE PASSA, nas palavras de quem lê o aviso, e pela ordem em que
 * acontecem. São os efeitos do GTFS-RT — os mesmos valores, que é o que as
 * outras aplicações leem —, com o nome que aparece na etiqueta do aviso.
 */
const EFEITOS_A_ESCOLHER: [string, string][] = [
  ['DETOUR', 'Desvio'],
  ['NO_SERVICE', 'Sem serviço'],
  ['REDUCED_SERVICE', 'Serviço reduzido'],
  ['SIGNIFICANT_DELAYS', 'Atrasos'],
  ['STOP_MOVED', 'Paragem mudada de sítio'],
  ['MODIFIED_SERVICE', 'Serviço alterado'],
  ['ADDITIONAL_SERVICE', 'Serviço reforçado'],
  ['ACCESSIBILITY_ISSUE', 'Problema de acessibilidade'],
  ['NO_EFFECT', 'Não muda o serviço'],
];

const GRAVIDADES_A_ESCOLHER: [string, string][] = [
  ['INFO', 'Informação'],
  ['WARNING', 'Atenção'],
  ['SEVERE', 'Grave'],
];

/** Onde está cada campo — para o foco ir para lá quando é ele que tem de mudar. */
const CAMPO_NO_ECRA: Record<string, string> = {
  titulo: 'aviso-titulo',
  texto: 'aviso-texto',
  linhas: 'aviso-linhas',
  paragens: 'aviso-paragens',
  modos: 'aviso-modo-0',
  fim: 'aviso-fim',
  url: 'aviso-url',
};

const SEM_RECUSA: EstadoDoAviso = { erro: null, campo: null, vez: 0 };

const maiuscula = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** Os valores que uma recusa sem JavaScript devolve, de volta à forma do editor. */
function daRecusa(v: Record<string, string | string[]>, antes: ValoresDoEditor): ValoresDoEditor {
  const um = (c: keyof ValoresDoEditor) => (typeof v[c] === 'string' ? (v[c] as string) : '');
  const varios = (c: string) => (Array.isArray(v[c]) ? (v[c] as string[]) : []);
  return {
    ...antes,
    titulo: um('titulo'),
    texto: um('texto'),
    gravidade: um('gravidade') || antes.gravidade,
    causa: um('causa') || antes.causa,
    efeito: um('efeito') || antes.efeito,
    inicio: um('inicio'),
    fim: um('fim'),
    url: um('url'),
    linhas: [...varios('linhas'), ...varios('linhas_texto')],
    paragens: [...varios('paragens'), ...varios('paragens_texto')],
    modos: varios('modos'),
  };
}

/**
 * Escrever um aviso, e ver como fica antes de o publicar (P4-017, P4-018).
 *
 * O formulário antigo pedia identificadores do GTFS («RA1») e recusava o
 * número da linha; se um estivesse errado, a página voltava em branco, com o
 * título e o texto perdidos a meio de uma ocorrência; não havia
 * pré-visualização; e o público lia «causa não declarada · outro efeito».
 *
 * Agora:
 *
 *   · AS LINHAS ESCOLHEM-SE PELO NÚMERO E PELO NOME que o público vê, numa
 *     procura; as paragens pelo nome, com o concelho a distinguir as iguais;
 *   · UMA RECUSA NÃO APAGA NADA: o servidor devolve o que falta, o editor
 *     fica com o que tinha, e o foco vai para o campo que tem de mudar;
 *   · A PRÉ-VISUALIZAÇÃO É O CARTÃO PÚBLICO, o mesmo componente que o sítio
 *     usa, ao vivo — e diz onde é que o aviso vai aparecer;
 *   · O QUE SE PASSA E PORQUÊ SÃO OPCIONAIS, e não aparecem quando não se
 *     dizem.
 *
 * O ENVIO NÃO LIMPA O FORMULÁRIO. Um `<form action>` do React repõe os campos
 * no fim de cada envio; aqui o envio faz-se à mão (`onSubmit`), com o
 * formulário intacto, e só o sucesso sai da página. Sem JavaScript, o
 * formulário envia-se como sempre, e a recusa volta com os valores.
 */
export default function EditorDeAviso({
  regiao,
  idDoAviso,
  publicado,
  inicial,
  linhas,
  paragens,
  modos,
  fuso,
  nomeDoFuso,
}: {
  regiao: string;
  /** Ao corrigir; ausente num aviso novo. */
  idDoAviso?: string;
  /** Um aviso já publicado corrige-se no ar, e não tem «Publicar» nem «Guardar rascunho». */
  publicado: boolean;
  inicial: ValoresDoEditor;
  linhas: LinhaDoEditor[];
  /** `[identificador, nome, concelho]`, em listas: são milhares numa região a sério. */
  paragens: [string, string, string][];
  /** Os modos sobre os quais esta autoridade pode avisar — os que gere. */
  modos: { id: string; nome: string }[];
  fuso: string;
  nomeDoFuso: string;
}) {
  const [estado, acao, aGravar] = useActionState(guardarAviso, SEM_RECUSA);
  const [v, setV] = useState<ValoresDoEditor>(() =>
    estado.valores ? daRecusa(estado.valores, inicial) : inicial,
  );
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);
  const mudar = <K extends keyof ValoresDoEditor>(campo: K, valor: ValoresDoEditor[K]) =>
    setV((antes) => ({ ...antes, [campo]: valor }));

  // A RECUSA LEVA O FOCO AO CAMPO QUE TEM DE MUDAR — e, sem campo, à mensagem.
  useEffect(() => {
    if (!estado.erro) return;
    const alvo = document.getElementById(
      (estado.campo && CAMPO_NO_ECRA[estado.campo]) || 'erro-do-aviso',
    );
    alvo?.scrollIntoView({ block: 'center' });
    alvo?.focus({ preventScroll: true });
  }, [estado.vez, estado.erro, estado.campo]);

  const catalogo: CatalogoDosAvisos = useMemo(
    () => ({
      linhas: new Map(linhas.map((l) => [l.id, l])),
      paragens: new Map(paragens.map(([id, nome]) => [id, nome])),
      modos: Object.fromEntries(modos.map((m) => [m.id, m.nome])),
    }),
    [linhas, paragens, modos],
  );

  const opcoesDeLinhas: OpcaoDeEscolha[] = useMemo(
    () =>
      linhas.map((l) => ({
        valor: l.id,
        rotulo: l.nome || `Linha ${l.codigo}`,
        distintivo: { codigo: l.codigo, cor: l.cor, modo: l.modo },
      })),
    [linhas],
  );
  // O CONCELHO SÓ ONDE É PRECISO: numa paragem com nome único, é ruído.
  const opcoesDeParagens: OpcaoDeEscolha[] = useMemo(() => {
    const vezes = new Map<string, number>();
    for (const [, nome] of paragens) vezes.set(nome, (vezes.get(nome) ?? 0) + 1);
    return paragens.map(([id, nome, concelho]) => ({
      valor: id,
      rotulo: (vezes.get(nome) ?? 0) > 1 && concelho ? `${nome} (${concelho})` : nome,
      detalhe: concelho,
    }));
  }, [paragens]);

  const temEscolhas = v.linhas.length > 0 || v.paragens.length > 0;
  const modosEnviados = temEscolhas ? [] : v.modos;
  const previa: Aviso = {
    id: idDoAviso ?? 'novo',
    region_id: regiao,
    titulo: v.titulo,
    texto: v.texto,
    gravidade: v.gravidade,
    causa: v.causa,
    efeito: v.efeito,
    inicio: doCampoLocal(v.inicio, fuso),
    fim: doCampoLocal(v.fim, fuso),
    linhas: v.linhas,
    paragens: v.paragens,
    modos: modosEnviados,
    url: v.url || null,
    publicado,
    created_by: '',
    created_at: '',
    updated_at: '',
  };
  const onde = ondeAparece(previa, catalogo, (m) => catalogo.modos?.[m] ?? m);

  const erroEm = (campo: string) => (estado.erro && estado.campo === campo ? estado.erro : null);
  const descrito = (ajuda: string, campo: string) =>
    erroEm(campo) ? `${ajuda} erro-em-${campo}` : ajuda;
  // A MENSAGEM AO PÉ DO CAMPO, e ligada a ele (`aria-describedby`): o foco vai
  // para o campo, e quem usa leitor de ecrã ouve o que falta ao lá chegar.
  const erroDoCampo = (campo: string) =>
    erroEm(campo) ? (
      <p id={`erro-em-${campo}`} className="erro-do-campo">
        {erroEm(campo)}
      </p>
    ) : null;

  // O efeito em vigor que não está entre os botões (um valor antigo) fica à
  // escolha, com o nome dele: mudá-lo sem ninguém pedir era mudar o aviso.
  const efeitos =
    EFEITOS_A_ESCOLHER.some(([e]) => e === v.efeito) ||
    ['OTHER_EFFECT', 'UNKNOWN_EFFECT'].includes(v.efeito)
      ? EFEITOS_A_ESCOLHER
      : [...EFEITOS_A_ESCOLHER, [v.efeito, v.efeito] as [string, string]];
  const outraCoisa = v.efeito === 'UNKNOWN_EFFECT' ? 'UNKNOWN_EFFECT' : 'OTHER_EFFECT';
  const gravidades = GRAVIDADES_A_ESCOLHER.some(([g]) => g === v.gravidade)
    ? GRAVIDADES_A_ESCOLHER
    : [...GRAVIDADES_A_ESCOLHER, [v.gravidade, 'Sem gravidade declarada'] as [string, string]];

  return (
    <form
      action={acao}
      onSubmit={(e) => {
        e.preventDefault();
        const quem = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const dados = new FormData(e.currentTarget);
        if (quem?.name) dados.set(quem.name, quem.value);
        startTransition(() => acao(dados));
      }}
      className="formulario editor-de-aviso"
      noValidate
    >
      <input type="hidden" name="regiao" value={regiao} />
      {idDoAviso ? <input type="hidden" name="id" value={idDoAviso} /> : null}

      {estado.erro && !estado.campo ? (
        <div id="erro-do-aviso" className="faixa alerta" role="alert" tabIndex={-1}>
          <p>{estado.erro}</p>
          <p>Nada do que escreveste se perdeu: corrige e volta a carregar no botão.</p>
        </div>
      ) : null}

      <div className="campos-do-aviso">
        <fieldset className="pilulas-de-escolha">
          <legend>O que se passa</legend>
          <div className="pilulas">
            {efeitos.map(([valor, nome]) => (
              <label key={valor} className={v.efeito === valor ? 'escolhida' : undefined}>
                <input
                  type="radio"
                  name="efeito"
                  value={valor}
                  checked={v.efeito === valor}
                  onChange={() => mudar('efeito', valor)}
                />
                {nome}
              </label>
            ))}
            <label className={v.efeito === outraCoisa ? 'escolhida' : undefined}>
              <input
                type="radio"
                name="efeito"
                value={outraCoisa}
                checked={v.efeito === outraCoisa}
                onChange={() => mudar('efeito', outraCoisa)}
              />
              Outra coisa
            </label>
          </div>
          <p className="secundario-texto">
            Aparece por cima do título. «Outra coisa» não põe etiqueta nenhuma.
          </p>
        </fieldset>

        <label htmlFor="aviso-titulo">Título</label>
        <input
          id="aviso-titulo"
          name="titulo"
          type="text"
          required
          maxLength={120}
          value={v.titulo}
          onChange={(e) => mudar('titulo', e.target.value)}
          aria-describedby={descrito('titulo-ajuda', 'titulo')}
          aria-invalid={erroEm('titulo') ? true : undefined}
        />
        <p id="titulo-ajuda" className="secundario-texto">
          Uma linha a dizer o que se passa: «Linha 10 desviada em Vale Escuro».
        </p>
        {erroDoCampo('titulo')}

        <label htmlFor="aviso-texto">O que quem está na paragem precisa de saber</label>
        <textarea
          id="aviso-texto"
          name="texto"
          required
          rows={4}
          value={v.texto}
          onChange={(e) => mudar('texto', e.target.value)}
          aria-describedby={descrito('texto-ajuda', 'texto')}
          aria-invalid={erroEm('texto') ? true : undefined}
        />
        <p id="texto-ajuda" className="secundario-texto">
          Por onde passa, que paragens não são servidas, o que fazer em vez disso.
        </p>
        {erroDoCampo('texto')}

        <EscolherVarios
          id="aviso-linhas"
          etiqueta="Linhas afetadas"
          nome="linhas"
          nomeDoTexto="linhas_texto"
          opcoes={opcoesDeLinhas}
          escolhidos={v.linhas}
          aoMudar={(x) => mudar('linhas', x)}
          sugestao="Número ou nome da linha"
          descritoPor={descrito('a-quem-ajuda', 'linhas')}
          invalido={!!erroEm('linhas')}
          rotuloDoTirar={(o) => `Tirar a linha ${o.distintivo?.codigo ?? o.rotulo}`}
        />
        {erroDoCampo('linhas')}
        <EscolherVarios
          id="aviso-paragens"
          etiqueta="Paragens afetadas"
          nome="paragens"
          nomeDoTexto="paragens_texto"
          opcoes={opcoesDeParagens}
          escolhidos={v.paragens}
          aoMudar={(x) => mudar('paragens', x)}
          sugestao="Nome da paragem"
          descritoPor={descrito('a-quem-ajuda', 'paragens')}
          invalido={!!erroEm('paragens')}
          rotuloDoTirar={(o) => `Tirar ${o.rotulo}`}
        />
        {erroDoCampo('paragens')}

        {/* UM SERVIÇO INTEIRO SÓ QUANDO NÃO HÁ LINHAS NEM PARAGENS: com elas, o
            aviso vale só para elas, e as caixas dos modos eram ruído. */}
        {modos.length > 0 && !temEscolhas ? (
          <fieldset id="aviso-modos">
            <legend>Ou um serviço inteiro</legend>
            {modos.map((m, i) => (
              <label key={m.id} className="caixa">
                <input
                  id={`aviso-modo-${i}`}
                  type="checkbox"
                  name="modos"
                  value={m.id}
                  checked={v.modos.includes(m.id)}
                  onChange={(e) =>
                    mudar(
                      'modos',
                      e.target.checked ? [...v.modos, m.id] : v.modos.filter((x) => x !== m.id),
                    )
                  }
                />
                {m.nome}
              </label>
            ))}
            {erroDoCampo('modos')}
          </fieldset>
        ) : null}
        <p id="a-quem-ajuda" className="secundario-texto">
          {temEscolhas ? (
            'Com linhas ou paragens escolhidas, o aviso vale só para elas.'
          ) : v.modos.length > 0 ? (
            'O aviso vale para todo o serviço escolhido.'
          ) : (
            <strong>Sem linhas, paragens nem serviço, o aviso vale para a rede toda.</strong>
          )}
        </p>

        <div className="em-linha">
          <div>
            <label htmlFor="aviso-inicio">Começa</label>
            <input
              id="aviso-inicio"
              name="inicio"
              type="datetime-local"
              value={v.inicio}
              onChange={(e) => mudar('inicio', e.target.value)}
              aria-describedby="prazo-ajuda"
            />
          </div>
          <div>
            <label htmlFor="aviso-fim">Acaba</label>
            <input
              id="aviso-fim"
              name="fim"
              type="datetime-local"
              value={v.fim}
              onChange={(e) => mudar('fim', e.target.value)}
              aria-describedby={descrito('prazo-ajuda', 'fim')}
              aria-invalid={erroEm('fim') ? true : undefined}
            />
          </div>
        </div>
        <p id="prazo-ajuda" className="secundario-texto">
          Horas de {nomeDoFuso}. Sem começo: já está a acontecer. Sem fim: ainda não se sabe — e é
          assim que se diz. Passado o fim, o aviso sai do sítio sozinho.
        </p>
        {erroDoCampo('fim')}

        <label htmlFor="aviso-causa">
          Porquê <span className="opcional">(opcional)</span>
        </label>
        <select
          id="aviso-causa"
          name="causa"
          value={v.causa}
          onChange={(e) => mudar('causa', e.target.value)}
        >
          <option value="UNKNOWN_CAUSE">Não dizer</option>
          {Object.entries(CAUSAS)
            .filter(([c]) => c !== 'UNKNOWN_CAUSE')
            .map(([c, nome]) => (
              <option key={c} value={c}>
                {maiuscula(nome)}
              </option>
            ))}
        </select>

        <fieldset className="pilulas-de-escolha">
          <legend>Quão grave</legend>
          <div className="pilulas">
            {gravidades.map(([valor, nome]) => (
              <label key={valor} className={v.gravidade === valor ? 'escolhida' : undefined}>
                <input
                  type="radio"
                  name="gravidade"
                  value={valor}
                  checked={v.gravidade === valor}
                  onChange={() => mudar('gravidade', valor)}
                />
                {nome}
              </label>
            ))}
          </div>
          <p className="secundario-texto">
            Decide a cor do aviso. Os graves ficam a vermelho e aparecem primeiro.
          </p>
        </fieldset>

        <label htmlFor="aviso-url">
          Mais informação <span className="opcional">(opcional)</span>
        </label>
        <input
          id="aviso-url"
          name="url"
          type="url"
          inputMode="url"
          value={v.url}
          onChange={(e) => mudar('url', e.target.value)}
          aria-describedby={descrito('url-ajuda', 'url')}
          aria-invalid={erroEm('url') ? true : undefined}
        />
        <p id="url-ajuda" className="secundario-texto">
          O endereço da página da autoridade ou da operadora com o pormenor.
        </p>
        {erroDoCampo('url')}
      </div>

      {/* A PRÉ-VISUALIZAÇÃO É O CARTÃO PÚBLICO, o mesmo componente. Só depois
          de a página acordar: as datas escrevem-se com o relógio do navegador,
          e a do servidor podia sair com outra forma. */}
      <aside className="pre-visualizacao" aria-labelledby="pre-visualizacao-titulo">
        <h3 id="pre-visualizacao-titulo">Assim aparece no sítio</h3>
        {hidratado ? (
          <CartaoDeAviso
            aviso={previa}
            catalogo={catalogo}
            ligacoes={false}
            nivel={4}
            fuso={fuso}
          />
        ) : (
          <p className="secundario-texto">
            A pré-visualização aparece quando a página acabar de abrir.
          </p>
        )}
        <p className="secundario-texto">
          {publicado ? 'Está' : 'Publicado, fica'} {juntar(onde)}.
        </p>
      </aside>

      <div className="botoes-do-aviso">
        {/* «GUARDAR RASCUNHO» VEM PRIMEIRO, e não é só arrumação: o Enter num
            campo de texto carrega no primeiro botão do formulário, e publicar
            um aviso a meio por causa de uma tecla não pode acontecer. */}
        {publicado ? (
          <button type="submit" disabled={aGravar}>
            {aGravar ? 'A guardar…' : 'Guardar as correções'}
          </button>
        ) : (
          <>
            <button type="submit" className="secundario" disabled={aGravar}>
              Guardar rascunho
            </button>
            <button type="submit" name="publicar" value="1" disabled={aGravar}>
              {aGravar ? 'A gravar…' : 'Publicar agora'}
            </button>
          </>
        )}
        {idDoAviso ? (
          <Link href={`/admin/regioes/${encodeURIComponent(regiao)}/avisos/`}>
            Deixar de corrigir
          </Link>
        ) : null}
      </div>
      <p className="secundario-texto">
        {publicado
          ? 'Este aviso está publicado: as correções aparecem no sítio assim que as guardares.'
          : 'Um rascunho não aparece em lado nenhum. Publicado, aparece no sítio de imediato.'}
      </p>
    </form>
  );
}
