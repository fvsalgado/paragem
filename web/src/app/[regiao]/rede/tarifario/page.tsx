import type { Metadata } from 'next';
import { tarifas, exigirRegiao } from '@/lib/dados';

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
              {t.por_confirmar} {t.por_confirmar === 1 ? 'destes preços' : 'destes preços'} ainda
              não {t.por_confirmar === 1 ? 'foi confirmado' : 'foram confirmados'} na fonte.
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
                <th scope="col">Preço</th>
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
                  <td>{typeof x.valor === 'number' ? moeda.format(x.valor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Quem gere</h2>
      <p>
        {r.rede?.nome ? `A rede ${r.rede.nome} é gerida por ` : 'A rede é gerida por '}
        {r.autoridade?.nome}
        {r.rede?.operador ? `, com operação de ${r.rede.operador}` : ''}. Os preços são os que a
        operadora publica.
      </p>
    </>
  );
}
