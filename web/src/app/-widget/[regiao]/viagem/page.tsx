import type { Metadata } from 'next';
import { exigirRegiao } from '@/lib/dados';
import { nomeDaRede } from '@/lib/prosa';

export const metadata: Metadata = { title: 'Para onde vais?' };

/**
 * «Para onde vais?», numa caixa para o sítio de uma câmara (P4-007): um campo
 * e um botão, que abrem o planeador da região noutro separador com o destino
 * escrito.
 *
 * SEM JAVASCRIPT NENHUM: é um formulário que envia por GET para `/viagem/`, e
 * o planeador lê o destino do endereço como lê o de qualquer ligação. Não
 * pede a localização, não guarda nada, não carrega os pontos da região — num
 * sítio alheio, a caixa pesa o que pesa um formulário.
 */
export default async function CaixaDaViagem({ params }: { params: Promise<{ regiao: string }> }) {
  const r = await exigirRegiao((await params).regiao);
  return (
    <section className="caixa" aria-labelledby="caixa-titulo">
      <form action="/viagem/" method="get" target="_blank" className="caixa-da-viagem">
        <h1 id="caixa-titulo" className="titulo-da-caixa">
          <label htmlFor="para">Para onde vais?</label>
        </h1>
        <div className="campo-e-botao">
          <input
            id="para"
            name="para"
            type="text"
            required
            autoComplete="off"
            aria-describedby="caixa-ajuda"
          />
          <button type="submit">Procurar</button>
        </div>
        <p id="caixa-ajuda" className="rodape-da-caixa">
          O nome da paragem, da terra ou do sítio. Abre o planeador {r.de} noutro separador.
        </p>
      </form>
      <p className="assinatura-da-caixa">{nomeDaRede(r)} · Paragem.pt</p>
    </section>
  );
}
