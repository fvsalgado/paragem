'use client';

/**
 * A disponibilidade de bicicletas, ao vivo, do lado do navegador.
 *
 * O sítio é estático: estas contagens não vêm da construção — seriam de há uma
 * semana — mas de um serviço à parte que lê a página que o próprio sistema
 * publica (ver `disponibilidade/`). É a mesma forma do planeador com o OTP:
 * fala-se do lado do cliente, e quando o serviço não está configurado a página
 * não inventa — mostra as estações sem contagem, como hoje.
 *
 * TRÊS DECISÕES, e todas do mesmo princípio: não prometer o que não se sabe.
 * - **A hora de cada leitura vai à vista** («há 40 s»): a página do sistema não
 *   carimba a hora, por isso a única honesta é a da leitura.
 * - **O número desaparece quando envelhece** (`JANELA_FRESCURA_MS`): um número
 *   velho apresentado como certo é pior do que número nenhum.
 * - **Diz-se que o operador pode falhar.** As contagens são dele, e há quem
 *   chegue à estação e não encontre a bicicleta que a página contava. Mostra-se
 *   na mesma — poupa caminhadas mais vezes do que engana — mas com o aviso.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { estaFresco, haQuanto, type StationStatus } from '@/lib/disponibilidade';

type Contagem = { bicicletas?: number; docas?: number };
type Estado = {
  fase: 'sem-servico' | 'a-carregar' | 'ok' | 'erro';
  porId: Map<string, Contagem>;
  geradoEmMs: number;
  agoraMs: number;
};

const VAZIO: Estado = {
  fase: 'sem-servico',
  porId: new Map(),
  geradoEmMs: 0,
  agoraMs: 0,
};

const Ctx = createContext<Estado>(VAZIO);

/**
 * Envolve a lista das estações. Lê o serviço uma vez, e volta a ler de minuto a
 * minuto ENQUANTO a página está à vista — para não gastar a fonte com um
 * separador esquecido aberto. Os filhos são os de sempre, servidos pelo
 * servidor; o que muda são as contagens que os consumidores lá dentro mostram.
 */
export default function DisponibilidadeBicicletas({
  endereco = '',
  children,
}: {
  /** O endereço do serviço desta região, lido no servidor. '' quando não há. */
  endereco?: string;
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>(VAZIO);

  useEffect(() => {
    if (!endereco) return; // sem serviço: fica em «sem-servico», sem contagens
    let vivo = true;

    async function ler() {
      if (document.visibilityState === 'hidden') return;
      setEstado((e) => (e.fase === 'ok' ? e : { ...e, fase: 'a-carregar' }));
      try {
        const r = await fetch(endereco, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw new Error(String(r.status));
        const s: StationStatus = await r.json();
        if (!vivo) return;
        const porId = new Map<string, Contagem>();
        for (const e of s.data?.stations ?? []) {
          porId.set(e.station_id, {
            bicicletas: e.num_bikes_available,
            docas: e.num_docks_available,
          });
        }
        setEstado({ fase: 'ok', porId, geradoEmMs: s.last_updated * 1000, agoraMs: Date.now() });
      } catch {
        if (vivo) setEstado((e) => ({ ...e, fase: e.fase === 'ok' ? 'ok' : 'erro' }));
      }
    }

    ler();
    const aLer = setInterval(ler, 60_000);
    // O relógio anda sozinho, para o «há Ns» avançar e o número expirar sem
    // uma leitura nova.
    const oRelogio = setInterval(() => setEstado((e) => ({ ...e, agoraMs: Date.now() })), 15_000);
    const aoVoltar = () => document.visibilityState === 'visible' && ler();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      clearInterval(aLer);
      clearInterval(oRelogio);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [endereco]);

  return <Ctx.Provider value={estado}>{children}</Ctx.Provider>;
}

/** Está o que temos suficientemente fresco para se mostrar um número? */
function fresco(e: Estado): boolean {
  return e.fase === 'ok' && estaFresco(e.geradoEmMs, e.agoraMs);
}

/**
 * A contagem de uma estação, ao lado do nome dela: «· 3 bicicletas · 6 docas».
 * Nada, quando não há serviço, quando a leitura envelheceu, ou quando esta
 * estação não veio no feed.
 */
export function ContagemDaEstacao({ id }: { id?: string | null }) {
  const e = useContext(Ctx);
  if (!id || !fresco(e)) return null;
  const c = e.porId.get(id);
  if (!c || (c.bicicletas == null && c.docas == null)) return null;
  return (
    <span className="disponibilidade">
      {c.bicicletas != null && (
        <span>
          {' · '}
          <strong>{c.bicicletas}</strong> {c.bicicletas === 1 ? 'bicicleta' : 'bicicletas'}
        </span>
      )}
      {c.docas != null && (
        <span>
          {' · '}
          <strong>{c.docas}</strong> {c.docas === 1 ? 'doca' : 'docas'}
        </span>
      )}
    </span>
  );
}

/**
 * Uma linha por sistema, com o retrato do momento e a hora: «Neste momento, 42
 * bicicletas em 67 estações — há 40 s. As contagens são do operador e podem
 * falhar.» Só das estações DESTE sistema, e só quando a leitura é fresca.
 */
export function ResumoDoSistema({ ids }: { ids: (string | null | undefined)[] }) {
  const e = useContext(Ctx);
  if (!fresco(e)) return null;
  let bicicletas = 0;
  let comContagem = 0;
  for (const id of ids) {
    if (!id) continue;
    const c = e.porId.get(id);
    if (c?.bicicletas != null) {
      bicicletas += c.bicicletas;
      comContagem += 1;
    }
  }
  if (comContagem === 0) return null;
  const idade = haQuanto((e.agoraMs - e.geradoEmMs) / 1000);
  return (
    <p className="marca-dados" aria-live="polite">
      Neste momento, <strong>{bicicletas}</strong>{' '}
      {bicicletas === 1 ? 'bicicleta disponível' : 'bicicletas disponíveis'} em {comContagem}{' '}
      {comContagem === 1 ? 'estação' : 'estações'} — {idade}. As contagens são do operador e podem
      falhar.
    </p>
  );
}
