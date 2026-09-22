/**
 * Os módulos desligados, e o que se tira do sítio por causa deles.
 *
 * Um módulo é um modo de transporte (CLAUDE.md §11.7): «desligar a FlixBus» é
 * desligar `expresso`, «desligar a CP» é desligar `comboio`. O painel escreve
 * o interruptor na base (`public.modulos`, só as linhas desligadas); o sítio
 * lê-o em `dados.ts` e aplica-o aqui, com funções puras que se testam sem
 * base nem rede.
 *
 * DUAS FONTES, somadas: a base, e `PARAGEM_MODULOS_DESLIGADOS` no ambiente —
 * `id=modo+modo,id=modo` — que é como o CI prova que o interruptor faz
 * efeito sem base nenhuma, e como uma pré-visualização mostra uma região sem
 * um modo antes de alguém o desligar a sério.
 *
 * O PÚBLICO DEGRADA: se a base não responder, não se desliga nada. Assumir
 * tudo desligado por causa de uma falha de rede fazia desaparecer seis modos.
 */

/** Os identificadores são os das pastas em `regioes/`: minúsculas, dígitos e hífens. */
const IDENTIFICADOR = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Os módulos têm a mesma forma — são os sete modos do produto. */
const MODULO = /^[a-z][a-z-]{0,31}$/;

/**
 * Os pontos do mapa dizem o `tipo` tal como o pipeline os escreve: o modo tal
 * como a região o declara, com duas exceções herdadas — as paragens da rede
 * própria são `paragem` e as estações de comboio são `estacao`. Um `sitio`
 * (do OpenStreetMap) não é de modo nenhum, e nunca se desliga.
 */
const MODO_DO_TIPO: Record<string, string> = { paragem: 'autocarro', estacao: 'comboio' };

export function modoDoTipo(tipo: string): string {
  return MODO_DO_TIPO[tipo] ?? tipo;
}

/** `prova=taxi+bicicleta,prova-municipio=urbano-municipal` → o que cada região tem desligado. */
export function modulosDesligadosDoAmbiente(
  valor = process.env.PARAGEM_MODULOS_DESLIGADOS,
): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const entrada of (valor ?? '').split(',')) {
    const [id, lista] = entrada.split('=').map((x) => x.trim());
    if (!id || !lista || !IDENTIFICADOR.test(id)) continue;
    const modulos = lista
      .split('+')
      .map((x) => x.trim())
      .filter((x) => MODULO.test(x));
    if (modulos.length) mapa[id] = [...new Set([...(mapa[id] ?? []), ...modulos])];
  }
  return mapa;
}

/** Os modos que a região declara, menos os desligados. */
export function modosLigados(
  declarados: readonly string[],
  desligados: readonly string[],
): string[] {
  return declarados.filter((m) => !desligados.includes(m));
}

/**
 * Os pontos que ficam no mapa e na procura: tudo o que não é de um módulo
 * desligado. Os sítios ficam sempre — não são transportes.
 */
export function semModulosDesligados<T extends { tipo: string }>(
  pontos: readonly T[],
  desligados: readonly string[],
): T[] {
  if (desligados.length === 0) return [...pontos];
  return pontos.filter((p) => p.tipo === 'sitio' || !desligados.includes(modoDoTipo(p.tipo)));
}
