import type { Metadata } from 'next';
import { tarifas, exigirRegiao } from '@/lib/dados';
import { redeEQuemAGere } from '@/lib/prosa';

export const metadata: Metadata = { title: 'Tarifário' };

export default async function Tarifario({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const t = await tarifas(rid);
  const r = await exigirRegiao(rid);
  const porRede = new Map<string, typeof t.titulos>();
  for (const x of t.titulos) {
    const lista = porRede.get(x.rede) ?? [];
    lista.push(x);
    porRede.set(x.rede, lista);
  }
  const moeda = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: t.moeda,
  });

  return (
    <>
      <h1>Tarifário</h1>

      {/* Um preço errado é dito a alguém que o vai pagar. Enquanto não estiver
          conferido na fonte, diz-se que não está — em cima, e não em rodapé. */}
      {t.por_confirmar > 0 && (
        <div className="faixa alerta">
          <p>
            <strong>
              {t.por_confirmar === 1
                ? 'Um destes preços ainda não foi confirmado'
                : `${t.por_confirmar} destes preços ainda não foram confirmados`}{' '}
              na fonte.
            </strong>{' '}
            Estão marcados abaixo. Confirma antes de contar com eles.
          </p>
        </div>
      )}

      {[...porRede.entries()].map(([rede, titulos]) => (
        <section key={rede}>
          <h2>{rede}</h2>
          <table className="horario">
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col" className="preco">
                  Preço
                </th>
              </tr>
            </thead>
            <tbody>
              {titulos.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.nome}
                    {!x.confirmado && (
                      <>
                        {' '}
                        <span
                          className="distintivo"
                          style={{
                            borderColor: 'var(--alerta)',
                            color: 'var(--alerta)',
                          }}
                        >
                          por confirmar
                        </span>
                      </>
                    )}
                    {x.nota && (
                      <>
                        <br />
                        <span className="secundario">{x.nota}</span>
                      </>
                    )}
                  </td>
                  {/* «Grátis» e não «0,00 €»: um zero com moeda lê-se como um
                      preço por preencher, e o que a fonte diz é que não se paga. */}
                  <td className="preco">
                    {typeof x.valor !== 'number'
                      ? '—'
                      : x.valor === 0
                        ? 'Grátis'
                        : moeda.format(x.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Quem gere</h2>
      <p>{redeEQuemAGere(r)}. Os preços são os que a operadora publica.</p>
    </>
  );
}
