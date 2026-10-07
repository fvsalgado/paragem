/**
 * O tema à escolha (`lib/tema.ts`) sem precisar do navegador: as cores do
 * escuro escolhido são as mesmas do escuro do aparelho, e nada no código volta
 * a seguir só o aparelho.
 *
 * O escuro está escrito duas vezes em `global.css` — dentro do
 * `@media (prefers-color-scheme: dark)`, para quem não escolheu, e fora dele,
 * para quem escolheu —, porque o CSS não junta uma consulta e um seletor numa
 * regra só. Duas cópias divergem no dia em que alguém muda uma e não a outra;
 * este teste é esse dia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CHAVE_DO_TEMA, GUIAO_DO_TEMA } from '../src/lib/tema.ts';

const SRC = join(import.meta.dirname, '..', 'src');
const CSS = readFileSync(join(SRC, 'app', 'global.css'), 'utf8');

const NAO_ESCOLHEU_CLARO = ":not([data-tema='claro'])";
const ESCOLHEU_ESCURO = "[data-tema='escuro']";

/** Os blocos `seletor { corpo }` dentro de cada `@media (prefers-color-scheme: dark)`. */
function blocosDoAparelho(css: string): { seletor: string; corpo: string }[] {
  const blocos: { seletor: string; corpo: string }[] = [];
  const marca = '@media (prefers-color-scheme: dark) {';
  let i = css.indexOf(marca);
  while (i >= 0) {
    // o interior do @media, contando as chavetas
    let fundo = 0;
    let j = i + marca.length - 1;
    for (; j < css.length; j++) {
      if (css[j] === '{') fundo++;
      else if (css[j] === '}' && --fundo === 0) break;
    }
    const interior = css.slice(i + marca.length, j);
    for (const m of interior.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      blocos.push({ seletor: m[1].trim(), corpo: m[2] });
    }
    i = css.indexOf(marca, j);
  }
  return blocos;
}

/** As declarações de um corpo, normalizadas: sem espaços nem comentários, por ordem. */
const declaracoes = (corpo: string) =>
  corpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

test('cada bloco do escuro do aparelho tem o gémeo do escuro escolhido, com as mesmas cores', () => {
  const blocos = blocosDoAparelho(CSS);
  assert.ok(
    blocos.length >= 3,
    `esperava os blocos da página, da região e do interruptor: ${blocos.length}`,
  );
  for (const { seletor, corpo } of blocos) {
    assert.ok(
      seletor.includes(NAO_ESCOLHEU_CLARO),
      `«${seletor}» segue o aparelho mesmo a quem escolheu o claro: falta ${NAO_ESCOLHEU_CLARO}`,
    );
    const gemeo = seletor.replace(NAO_ESCOLHEU_CLARO, ESCOLHEU_ESCURO);
    const fora = CSS.indexOf(`\n${gemeo} {`);
    assert.ok(fora >= 0, `falta o gémeo de «${seletor}»: «${gemeo} { … }», fora do @media`);
    const fim = CSS.indexOf('\n}', fora);
    const corpoGemeo = CSS.slice(CSS.indexOf('{', fora) + 1, fim);
    assert.deepEqual(
      declaracoes(corpoGemeo),
      declaracoes(corpo),
      `«${gemeo}» diverge do escuro do aparelho`,
    );
  }
});

test('a força das regras do escuro não muda: os seletores novos pesam o mesmo que os de antes', () => {
  // `:root:where(…)` pesa como `:root`, e `:where(:root…) .x` pesa como `.x`:
  // a ordem do ficheiro continua a decidir, como antes do tema à escolha.
  for (const { seletor } of blocosDoAparelho(CSS)) {
    assert.match(seletor, /^(:root:where\(|:where\(:root)/, `«${seletor}» mudou de peso`);
  }
});

function ficheiros(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const c = join(pasta, n);
    return statSync(c).isDirectory() ? ficheiros(c) : [c];
  });
}

test('nada no código segue só o aparelho: o tema da página lê-se em `lib/tema.ts`', () => {
  // O ícone do separador segue o tema do NAVEGADOR, de propósito (§6): é o
  // separador que muda de cor, não a página.
  const permitidos = new Set([
    'app/global.css',
    'app/icon.svg',
    'lib/marca-do-produto.ts',
    'lib/tema.ts',
  ]);
  const culpados = ficheiros(SRC)
    .filter((f) => /\.(tsx?|css|svg)$/.test(f))
    .map((f) => relative(SRC, f).split('\\').join('/'))
    .filter((f) => !permitidos.has(f))
    .filter((f) => readFileSync(join(SRC, f), 'utf8').includes('prefers-color-scheme'));
  assert.deepEqual(culpados, []);
});

test('o guião do arranque só lê a escolha, e só aceita claro ou escuro', () => {
  assert.match(GUIAO_DO_TEMA, new RegExp(`localStorage\\.getItem\\('${CHAVE_DO_TEMA}'\\)`));
  assert.doesNotMatch(GUIAO_DO_TEMA, /setItem|removeItem|cookie/);
  assert.match(GUIAO_DO_TEMA, /t==='claro'\|\|t==='escuro'/);
  // Sem armazenamento, não rebenta: fica o tema do aparelho.
  assert.match(GUIAO_DO_TEMA, /^try\{[\s\S]*\}catch\(e\)\{\}$/);
});
