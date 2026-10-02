'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import EscolherVarios, { type OpcaoDeEscolha } from '@/componentes/EscolherVarios';
import { usePontos } from '@/lib/pontos-do-navegador';

/**
 * Montar a caixa e levar o código (P4-007): o que mostra, de que paragem, e
 * quantas partidas — com a caixa a sério ao lado, e a linha para colar por
 * baixo.
 *
 * A pré-visualização é a caixa verdadeira, num `<iframe>` deste mesmo
 * domínio: o que se vê é o que vai para o sítio da câmara, e não um desenho
 * dele. As paragens vêm do mesmo ficheiro que a procura do mapa usa, pedido
 * aqui — não vão no HTML desta página.
 */
export default function ConstrutorDaCaixa({
  regiao,
  origem,
  concelhos,
  modosDesligados,
  comParagens,
}: {
  regiao: string;
  /** `https://<domínio da região>`, para o código; sem ele, o do navegador. */
  origem: string | null;
  concelhos: Record<string, string>;
  modosDesligados: string[];
  /** Uma região sem autocarros não tem paragens com partidas: só «Para onde vais?». */
  comParagens: boolean;
}) {
  const [tipo, setTipo] = useState<'paragem' | 'viagem'>(comParagens ? 'paragem' : 'viagem');
  const [paragem, setParagem] = useState<string[]>([]);
  const [quantas, setQuantas] = useState(5);
  const [daqui, setDaqui] = useState(origem ?? '');
  const [copiado, setCopiado] = useState<string | null>(null);
  useEffect(() => {
    if (!origem) setDaqui(window.location.origin);
  }, [origem]);

  // A PRÉ-VISUALIZAÇÃO AJUSTA-SE COMO A CAIXA SE AJUSTA NO SÍTIO DA CÂMARA: a
  // caixa diz a altura que tem (`AlturaParaOAnfitriao`), e esta moldura ouve.
  const previa = useRef<HTMLIFrameElement>(null);
  const [altura, setAltura] = useState<number | null>(null);
  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== previa.current?.contentWindow) return;
      const m = e.data as { paragem?: string; altura?: number } | null;
      if (m?.paragem === 'altura' && typeof m.altura === 'number' && m.altura > 0) {
        setAltura(Math.min(Math.ceil(m.altura), 2000));
      }
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, []);

  const { pontos } = usePontos(regiao, modosDesligados, comParagens);
  const opcoes: OpcaoDeEscolha[] = useMemo(() => {
    if (!Array.isArray(pontos)) return [];
    const daRede = pontos.filter((p) => p.tipo === 'paragem');
    const vezes = new Map<string, number>();
    for (const p of daRede) vezes.set(p.nome, (vezes.get(p.nome) ?? 0) + 1);
    return daRede.map((p) => {
      const concelho = concelhos[p.concelho] ?? '';
      return {
        valor: p.id,
        rotulo: (vezes.get(p.nome) ?? 0) > 1 && concelho ? `${p.nome} (${concelho})` : p.nome,
        detalhe: concelho,
      };
    });
  }, [pontos, concelhos]);

  const id = paragem[0] ?? '';
  const pronta = tipo === 'viagem' || id !== '';
  const caminho =
    tipo === 'paragem'
      ? `/widget/paragem/${encodeURIComponent(id)}/${quantas === 5 ? '' : `?quantas=${quantas}`}`
      : '/widget/viagem/';
  // Outra caixa, outra altura: até ela dizer a sua, vale a estimativa.
  useEffect(() => setAltura(null), [caminho]);
  const titulo =
    tipo === 'paragem'
      ? `Próximas partidas: ${opcoes.find((o) => o.valor === id)?.rotulo ?? 'paragem'}`
      : 'Para onde vais?';

  const linha = [
    '<script',
    `  src="${daqui}/widget/embed.js"`,
    ...(tipo === 'paragem' ? [`  data-paragem="${id}"`] : []),
    ...(tipo === 'paragem' && quantas !== 5 ? [`  data-quantas="${quantas}"`] : []),
    `  data-titulo="${titulo.replace(/"/g, '&quot;')}"`,
    '  async></script>',
  ].join('\n');
  const moldura = [
    '<iframe',
    `  src="${daqui}${caminho}"`,
    `  title="${titulo.replace(/"/g, '&quot;')}"`,
    '  width="100%"',
    `  height="${tipo === 'paragem' ? 300 + quantas * 50 : 190}"`,
    '  loading="lazy"',
    '  style="border:0;max-width:30rem"></iframe>',
  ].join('\n');

  async function copiar(texto: string, qual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <div className="construtor-da-caixa">
      <div className="construtor-escolhas">
        {comParagens ? (
          <fieldset className="quando-escolha">
            <legend>O que mostra</legend>
            <label>
              <input
                type="radio"
                name="tipo-da-caixa"
                checked={tipo === 'paragem'}
                onChange={() => setTipo('paragem')}
              />
              As próximas partidas de uma paragem
            </label>
            <label>
              <input
                type="radio"
                name="tipo-da-caixa"
                checked={tipo === 'viagem'}
                onChange={() => setTipo('viagem')}
              />
              «Para onde vais?», que abre o planeador
            </label>
          </fieldset>
        ) : null}

        {tipo === 'paragem' ? (
          <>
            <EscolherVarios
              id="caixa-paragem"
              etiqueta="Paragem"
              nome="paragem"
              nomeDoTexto="paragem_texto"
              opcoes={opcoes}
              escolhidos={paragem}
              aoMudar={setParagem}
              sugestao={pontos === null ? 'A carregar as paragens…' : 'O nome da paragem'}
              rotuloDoTirar={(o) => `Tirar ${o.rotulo}`}
              um
            />
            {pontos === 'falhou' ? (
              <p className="alerta-texto">
                Não foi possível carregar as paragens. Volte a abrir a página daqui a pouco.
              </p>
            ) : null}
            <label htmlFor="caixa-quantas">Quantas partidas</label>
            <select
              id="caixa-quantas"
              value={quantas}
              onChange={(e) => setQuantas(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      <section className="construtor-previa" aria-labelledby="fica-assim">
        <h3 id="fica-assim">Fica assim</h3>
        {pronta ? (
          <iframe
            key={caminho}
            ref={previa}
            src={caminho}
            title={`Pré-visualização: ${titulo}`}
            className="previa-da-caixa"
            style={{ height: altura ?? (tipo === 'paragem' ? 300 + quantas * 50 : 190) }}
          />
        ) : (
          <p className="secundario">Escolha a paragem, e a caixa aparece aqui.</p>
        )}
        <p className="secundario">
          A moldura a tracejado é desta página e não vai no código: está aqui para se ver onde a
          caixa acaba.
        </p>
      </section>

      <section className="construtor-codigo" aria-labelledby="copie">
        <h3 id="copie">Copie</h3>
        <p>
          Cole esta linha no sítio onde a caixa deve aparecer. A altura ajusta-se ao que ela tem
          dentro.
        </p>
        <pre
          className="codigo-para-copiar"
          tabIndex={0}
          role="region"
          aria-label="O código para colar"
        >
          <code>{pronta ? linha : 'Escolha primeiro a paragem.'}</code>
        </pre>
        <p>
          <button
            type="button"
            className="secundario"
            disabled={!pronta}
            onClick={() => copiar(linha, 'linha')}
          >
            Copiar o código
          </button>{' '}
          <span role="status" className="secundario">
            {copiado === 'linha' ? 'Copiado.' : ''}
          </span>
        </p>
        <h4>O gestor de conteúdos não deixa colar &lt;script&gt;?</h4>
        <p>
          Acontece em muitos. Use o <code>&lt;iframe&gt;</code> diretamente — funciona igual, mas a
          altura fica fixa no valor que lá está.
        </p>
        <pre
          className="codigo-para-copiar"
          tabIndex={0}
          role="region"
          aria-label="O iframe para colar"
        >
          <code>{pronta ? moldura : 'Escolha primeiro a paragem.'}</code>
        </pre>
        <p>
          <button
            type="button"
            className="secundario"
            disabled={!pronta}
            onClick={() => copiar(moldura, 'moldura')}
          >
            Copiar o iframe
          </button>{' '}
          <span role="status" className="secundario">
            {copiado === 'moldura' ? 'Copiado.' : ''}
          </span>
        </p>
      </section>
    </div>
  );
}
