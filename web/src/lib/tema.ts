/**
 * O TEMA CLARO OU ESCURO, À ESCOLHA DE QUEM VÊ.
 *
 * Até aqui o sítio seguia só o aparelho (`prefers-color-scheme`, P1-044): quem
 * queria o escuro de dia, ou o claro numa paragem ao sol com o telemóvel em
 * modo noturno, não tinha como. Agora há três escolhas — como o aparelho,
 * claro, escuro —, e a primeira continua a ser a de quem nunca escolheu nada.
 * Vale para a página do produto, para todas as regiões e para o painel: são
 * as mesmas cores (`global.css`) e o mesmo código.
 *
 * ONDE FICA A ESCOLHA: no navegador de quem a fez (`localStorage`), e só
 * quando não é «como o aparelho» — escolher essa apaga-a. É a única coisa que
 * o sítio guarda no dispositivo, e só a pedido; as duas páginas de privacidade
 * dizem-no. Não vai para servidor nenhum: as páginas são as mesmas para toda
 * a gente, guardadas em cache, e o tema aplica-se no navegador.
 *
 * COMO SE APLICA SEM PISCAR: um guião pequeno, o primeiro do `<body>`
 * (`app/layout.tsx`), lê a escolha e põe `data-tema` no `<html>` antes de a
 * página se pintar. Em `global.css`, o escuro aplica-se com
 * `data-tema="escuro"`, ou com o aparelho em escuro e sem `data-tema="claro"`.
 * Se um dia o sítio tiver uma política de segurança de conteúdos (CSP), o
 * resumo deste guião entra no `script-src`.
 */
export type Escolha = 'aparelho' | 'claro' | 'escuro';
export type Tema = 'claro' | 'escuro';

export const CHAVE_DO_TEMA = 'paragem-tema';
const EVENTO = 'paragem:tema';
const ESCURO_DO_APARELHO = '(prefers-color-scheme: dark)';

/**
 * O guião do `<body>`. Sem armazenamento (uma janela privada, o armazenamento
 * bloqueado), não faz nada: fica o tema do aparelho.
 */
export const GUIAO_DO_TEMA =
  `try{var t=localStorage.getItem('${CHAVE_DO_TEMA}');` +
  `if(t==='claro'||t==='escuro')document.documentElement.setAttribute('data-tema',t)}catch(e){}`;

/**
 * A escolha desta página, em memória — e é ela que manda, e não o atributo do
 * `<html>`. Quando a hidratação falha fora de uma fronteira de `Suspense`, o
 * React volta a desenhar a página toda no navegador e, ao fazê-lo, tira do
 * `<html>` os atributos que não são dele: o `data-tema` ia junto, e a página
 * ficava no tema do aparelho com o escuro escolhido (medido, com um erro #418
 * numa região de prova). Quem ouve o tema repõe o atributo a partir daqui
 * (`ouvirTema`). Lê-se do mesmo sítio de onde o guião o leu.
 */
let escolhaDaPagina: Escolha | null = null;

function escolhaGuardada(): Escolha {
  try {
    const t = localStorage.getItem(CHAVE_DO_TEMA);
    return t === 'claro' || t === 'escuro' ? t : 'aparelho';
  } catch {
    return 'aparelho';
  }
}

function aplicar(e: Escolha) {
  escolhaDaPagina = e;
  const html = document.documentElement;
  if (e === 'aparelho') html.removeAttribute('data-tema');
  else html.setAttribute('data-tema', e);
}

/** A escolha em vigor nesta página. */
export function lerEscolha(): Escolha {
  if (typeof document === 'undefined') return 'aparelho';
  return (escolhaDaPagina ??= escolhaGuardada());
}

/** O tema que se vê: o escolhido, ou o do aparelho. */
export function temaEfetivo(): Tema {
  const e = lerEscolha();
  if (e !== 'aparelho') return e;
  return typeof window !== 'undefined' && window.matchMedia?.(ESCURO_DO_APARELHO).matches
    ? 'escuro'
    : 'claro';
}

/** Escolher um tema: aplica-se já, e guarda-se — ou apaga-se, se for o do aparelho. */
export function escolherTema(e: Escolha): void {
  aplicar(e);
  try {
    if (e === 'aparelho') localStorage.removeItem(CHAVE_DO_TEMA);
    else localStorage.setItem(CHAVE_DO_TEMA, e);
  } catch {
    // Sem armazenamento, o tema muda nesta página e volta ao do aparelho na
    // seguinte. Não se avisa: não é um erro de quem vê.
  }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * Ouvir as mudanças de tema: uma escolha nesta página, o aparelho a mudar
 * sozinho ao anoitecer, ou uma escolha noutro separador do mesmo sítio — que
 * se aplica também aqui, sem voltar a guardar nada.
 *
 * E, ao começar a ouvir, repor o `data-tema` se o React o tiver tirado ao
 * redesenhar a página (ver `escolhaDaPagina`): quem ouve começa depois de a
 * página estar desenhada, e há quem ouça em todas — o interruptor, as
 * escolhas, o mapa.
 */
export function ouvirTema(aoMudar: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const escolha = lerEscolha();
  const posto = document.documentElement.getAttribute('data-tema');
  if (posto !== (escolha === 'aparelho' ? null : escolha)) aplicar(escolha);
  const consulta = window.matchMedia?.(ESCURO_DO_APARELHO);
  const deOutroSeparador = (ev: StorageEvent) => {
    if (ev.key !== null && ev.key !== CHAVE_DO_TEMA) return;
    const t = ev.key === null ? null : ev.newValue;
    aplicar(t === 'claro' || t === 'escuro' ? t : 'aparelho');
    aoMudar();
  };
  consulta?.addEventListener('change', aoMudar);
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener('storage', deOutroSeparador);
  return () => {
    consulta?.removeEventListener('change', aoMudar);
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener('storage', deOutroSeparador);
  };
}
