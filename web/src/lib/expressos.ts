/**
 * O cliente dos expressos ao vivo, do lado do navegador.
 *
 * O sítio é estático: não há servidor nosso entre o navegador e o serviço. O
 * endereço vem do ambiente e NÃO está cravado no código — a mesma regra do
 * domínio, do motor de viagens e da disponibilidade das bicicletas.
 *
 * **Sem serviço configurado, a página fica como está.** Os expressos
 * continuam listados com as linhas que o feed declara; o que não aparece é o
 * preço. Inventar um preço era pior do que não mostrar nenhum.
 */

/** Uma viagem como o serviço a devolve. O que falta, falta — nunca se inventa. */
export type ViagemDeExpresso = {
  partida: string | null;
  chegada: string | null;
  paragemPartida: string | null;
  paragemChegada: string | null;
  duracaoMin: number | null;
  preco: number | null;
  lugares: number | null;
  direto: boolean | null;
  estado: string | null;
};

export type RespostaDeExpressos = {
  data: string;
  viagens: ViagemDeExpresso[];
  lido: number;
  falhou: boolean;
};

/**
 * Uma consulta, a pedido.
 *
 * NUNCA LANÇA. Quem chama está a desenhar uma página de horários: um erro por
 * apanhar aí apagava o horário planeado, que é a única coisa que o sítio
 * promete sempre. Uma falha devolve `falhou: true` e lista vazia.
 */
export async function consultarExpressos(
  base: string,
  de: string,
  para: string,
  data?: string,
): Promise<RespostaDeExpressos> {
  const vazia: RespostaDeExpressos = {
    data: data ?? '',
    viagens: [],
    lido: Date.now(),
    falhou: true,
  };
  if (!base) return vazia;
  try {
    const q = new URLSearchParams({ de, para, ...(data ? { data } : {}) });
    const r = await fetch(`${base}?${q}`, { headers: { accept: 'application/json' } });
    if (!r.ok) return vazia;
    const j = (await r.json()) as RespostaDeExpressos;
    return Array.isArray(j?.viagens) ? j : vazia;
  } catch {
    return vazia;
  }
}

/** «14:50», no fuso em que a viagem parte — e não no de quem está a ler. */
export function horaDe(iso: string | null): string {
  if (!iso) return '—';
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : '—';
}

/** «2 h 10» — a duração escrita como se diz, e não em minutos. */
export function duracaoDe(min: number | null): string | null {
  if (min == null || min < 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** «4,98 €», como se escreve em português. */
export function precoDe(v: number | null): string | null {
  if (v == null) return null;
  return `${v.toFixed(2).replace('.', ',')} €`;
}
