/**
 * O que se escolheu ou escreveu nos campos das linhas e das paragens de um
 * aviso, traduzido para os identificadores que o aviso guarda (P4-017).
 *
 * O FORMULÁRIO PEDIA O IDENTIFICADOR DO GTFS — «RA1» — e recusava «1», que é
 * o número que está no autocarro, no horário e na página da linha. Quem
 * escreve um aviso sabe o número; o identificador é um pormenor da
 * construção, e pedi-lo era pedir a quem gere a rede que fosse ver o endereço
 * de uma página para saber como se chama a linha dela.
 *
 * A escolha na lista manda o identificador; o que se escreve à mão (sem
 * JavaScript, ou colado de outro sítio) pode ser o número ou o nome. As duas
 * coisas resolvem-se aqui, e o que não se resolve diz porquê — com o nome que
 * se escreveu, e não com um identificador que ninguém escreveu.
 *
 * Puro, sem rede nem base: os testes chamam-no com catálogos inventados.
 */
import { simples } from '../letras.ts';

export type LinhaDoCatalogo = { id: string; codigo: string; nome: string; operador?: string };
export type ParagemDoCatalogo = { id: string; nome: string };

export type Resolucao = { ok: true; ids: string[] } | { ok: false; erro: string };

/** Os valores de um campo que pode vir várias vezes, ou com vírgulas. */
export function entradas(valores: readonly unknown[]): string[] {
  return valores
    .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * As linhas: o identificador, o número que o público vê, ou o nome.
 *
 * SÓ AS DA CASA. Uma linha de outro operador aparece no sítio — quem viaja não
 * tem de saber quem gere o quê —, mas o aviso sobre ela é de quem a opera
 * (`exigirModosProprios`, em `acoes.ts`, diz o mesmo dos modos).
 *
 * UM NÚMERO DE DUAS LINHAS não se adivinha: há números repetidos entre
 * concessões, e escolher uma era pôr o aviso na linha errada sem ninguém dar
 * por isso. Diz-se quais são, e pede-se que se escolha na lista.
 *
 * Sem catálogo (região sem dados publicados, ou o modo desligado) não se
 * valida: recusar tudo bloqueava o primeiro aviso de uma região nova.
 */
export function resolverLinhas(
  escritas: readonly string[],
  catalogo: readonly LinhaDoCatalogo[],
): Resolucao {
  if (catalogo.length === 0) return { ok: true, ids: [...new Set(escritas)] };
  const ids: string[] = [];
  for (const e of escritas) {
    const porId = catalogo.find((l) => l.id === e);
    const candidatas = porId
      ? [porId]
      : catalogo.filter(
          (l) => simples(l.codigo) === simples(e) || (l.nome && simples(l.nome) === simples(e)),
        );
    if (candidatas.length === 0) {
      return { ok: false, erro: `não há nenhuma linha «${e}» nesta região` };
    }
    const daCasa = candidatas.filter((l) => !l.operador);
    if (daCasa.length === 0) {
      const quem = [...new Set(candidatas.map((l) => l.operador))].join(', ');
      return {
        ok: false,
        erro: `a linha ${e} é de ${quem}, que esta região mostra e não gere. Quem gere o serviço é quem avisa sobre ele`,
      };
    }
    if (daCasa.length > 1) {
      const quais = daCasa.map((l) => `${l.codigo} ${l.nome}`.trim()).join('; ');
      return {
        ok: false,
        erro: `há ${daCasa.length} linhas com o número ${e} (${quais}) — escolhe-a na lista`,
      };
    }
    ids.push(daCasa[0].id);
  }
  return { ok: true, ids: [...new Set(ids)] };
}

/**
 * As paragens: o identificador, ou o nome quando é de UMA só. «Escola» há em
 * nove freguesias, e um aviso na escola errada é pior do que nenhum.
 */
export function resolverParagens(
  escritas: readonly string[],
  catalogo: readonly ParagemDoCatalogo[],
): Resolucao {
  if (catalogo.length === 0) return { ok: true, ids: [...new Set(escritas)] };
  const ids: string[] = [];
  for (const e of escritas) {
    const porId = catalogo.find((p) => p.id === e);
    if (porId) {
      ids.push(porId.id);
      continue;
    }
    const porNome = catalogo.filter((p) => simples(p.nome) === simples(e));
    if (porNome.length === 1) {
      ids.push(porNome[0].id);
      continue;
    }
    return {
      ok: false,
      erro:
        porNome.length === 0
          ? `não há nenhuma paragem «${e}» nesta região`
          : `há ${porNome.length} paragens chamadas «${e}» — escolhe-a na lista, que diz o concelho de cada uma`,
    };
  }
  return { ok: true, ids: [...new Set(ids)] };
}

/**
 * Um endereço de «Mais informação» tem de ser um endereço da Web. Um
 * `javascript:` num aviso público era uma ligação que corria código no sítio
 * da autoridade, com o nome dela por cima.
 */
export function enderecoValido(url: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
