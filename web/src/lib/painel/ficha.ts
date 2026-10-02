import { simples } from '../letras.ts';

/**
 * O que a ficha de uma região decide sem servidor — puro, para se testar.
 *
 * Duas perguntas que custam caro quando se erram: «quem carregou no botão
 * queria mesmo desligar o sítio desta autoridade?» e «o endereço novo já
 * responde, ou vou pôr o sítio em baixo ao mudar para ele?».
 */

/** Sem acentos, sem maiúsculas, sem espaços a mais: a intenção, e não a ortografia. */
function comparavel(texto: string): string {
  return simples(texto).replace(/\s+/g, ' ');
}

/**
 * Se o que se escreveu na confirmação é o nome da região (P4-011).
 *
 * Pede-se o NOME e não «sim» de propósito: escrevê-lo obriga a ler qual é a
 * região que se vai desligar, e é isso que apanha o clique na ficha errada.
 * Não se exige a ortografia — «Baixo Savel» num telemóvel sem acentos à mão
 * diz o mesmo que «Baixo Sável» —, exige-se a região.
 */
export function confirmacaoBate(escrito: string, nome: string): boolean {
  const a = comparavel(escrito);
  return a.length > 0 && a === comparavel(nome);
}

/**
 * Um nome de domínio da rede pública — e não a máquina onde o painel corre.
 *
 * O painel vai perguntar ao endereço novo se já responde (abaixo), e um
 * pedido feito pelo servidor a `localhost`, a um endereço IP ou a um nome da
 * rede interna era uma porta para dentro da casa. Só o dono muda domínios;
 * isto é o cinto por baixo dessa confiança.
 */
export function dominioPublico(d: string): boolean {
  if (!/^[a-z0-9.-]+$/.test(d) || !d.includes('.')) return false;
  if (/^\d+(\.\d+){3}$/.test(d)) return false;
  const ultimo = d.split('.').pop() ?? '';
  if (['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid'].includes(ultimo)) {
    return false;
  }
  return /[a-z]/.test(ultimo);
}

export type Verificacao = { ok: true } | { ok: false; porque: string };

/**
 * O endereço novo já responde com esta região? (P4-013)
 *
 * «Mudar o domínio» aplicava-se antes de o domínio novo existir: o antigo
 * passava a redirecionar para um endereço que não servia nada, e o dia em que
 * a autoridade traz o domínio dela — o mais visível da relação — começava com
 * o sítio em baixo.
 *
 * A mudança faz-se agora pela ordem certa: o endereço novo entra primeiro como
 * um que LEVA ao principal; quando o DNS e o projeto da plataforma estiverem
 * feitos, ele responde com um redirecionamento permanente para o endereço
 * principal desta região — e esse redirecionamento é a prova de que o
 * caminho todo está montado (o nome resolve, a plataforma serve-o, e o mapa
 * de domínios já o conhece). Só então se troca o principal.
 */
export async function verificarEndereco(
  novo: string,
  principal: string,
  buscar: typeof fetch = fetch,
  esquema = 'https',
): Promise<Verificacao> {
  if (!dominioPublico(novo)) {
    return { ok: false, porque: `${novo} não é um nome de domínio da rede pública` };
  }
  let resposta: Response;
  try {
    resposta = await buscar(`${esquema}://${novo}/`, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return {
      ok: false,
      porque: `${novo} ainda não responde — falta o DNS a apontar para a plataforma, ou o domínio no projeto dela`,
    };
  }
  const para = resposta.headers.get('location');
  let destino: string | null = null;
  try {
    destino = para ? new URL(para, `${esquema}://${novo}/`).host : null;
  } catch {
    destino = null;
  }
  if ([301, 308].includes(resposta.status) && destino === principal) return { ok: true };
  if (resposta.status >= 300 && resposta.status < 400) {
    return {
      ok: false,
      porque: `${novo} responde, mas leva a ${destino ?? 'outro sítio'} e não a ${principal}`,
    };
  }
  return {
    ok: false,
    porque: `${novo} responde, mas ainda não leva a esta região — se acabaste de o acrescentar, o painel demora até cinco minutos a sabê-lo`,
  };
}

type Artigo = 'o' | 'a' | 'os' | 'as';

const DE: Record<Artigo, string> = { o: 'do', a: 'da', os: 'dos', as: 'das' };

/**
 * A região numa frase do painel, com o artigo que ELA declara — «a Serra da
 * Pedra Alta», «o sítio da Serra…», «do Baixo Sável» — e a concordar com ele:
 * «o Baixo Sável está desligado», «as Terras do Ameno estão desligadas». Não
 * se adivinha nada: o artigo vem da base (`regions.article`, a cópia do
 * `regiao.yaml`), e uma contração ou uma concordância com um artigo conhecido
 * é gramática, não palpite. Sem artigo válido, o nome sozinho e «a região»
 * como sujeito.
 */
export function naFrase(r: { name: string; article: string }): {
  com: string;
  de: string;
  Com: string;
  /** «está» ou «estão». */
  esta: string;
  /** A terminação do adjetivo: `adj('desligad')` → «desligado», «desligadas»… */
  adj: (raiz: string) => string;
} {
  const artigo = (['o', 'a', 'os', 'as'] as const).find((x) => x === r.article);
  if (!artigo) {
    return {
      com: r.name,
      de: `de ${r.name}`,
      Com: r.name,
      esta: 'está',
      adj: (raiz) => `${raiz}a`,
    };
  }
  const com = `${artigo} ${r.name}`;
  return {
    com,
    de: `${DE[artigo]} ${r.name}`,
    Com: com.charAt(0).toUpperCase() + com.slice(1),
    esta: artigo.endsWith('s') ? 'estão' : 'está',
    adj: (raiz) => `${raiz}${artigo}`,
  };
}
