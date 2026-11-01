import type { Metadata } from 'next';
import { tarifas, exigirRegiao, regiao } from '@/lib/dados';
import { redeEQuemAGere } from '@/lib/prosa';
import { escolhasDoTarifario } from '@/lib/tarifario';
import EscolherTitulo from '@/componentes/EscolherTitulo';
import { metadadosDaRegiao } from '@/lib/metadados';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ regiao: string }>;
}): Promise<Metadata> {
  const { regiao: rid } = await params;
  const r = await regiao(rid);
  if (!r) return {};
  return metadadosDaRegiao(r, {
    titulo: 'Tarifário',
    descricao: `Os títulos e os preços dos transportes ${r.de}, e que título serve a quem.`,
    caminho: '/rede/tarifario/',
  });
}

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
  const escolhas = escolhasDoTarifario(t.titulos);

  return (
    <>
      <h1>Tarifário</h1>

      {/* Um preço errado é dito a alguém que o vai pagar. Enquanto não estiver
          conferido na fonte, diz-se que não está — em cima, e não em rodapé.
          Numa faixa de informação: é um estado dos dados, e o vermelho é para
          o que mudou hoje. */}
      {t.por_confirmar > 0 && (
        <div className="faixa informacao">
          <p>
            <strong>
              {t.por_confirmar === 1
                ? 'Um destes preços ainda não foi confirmado'
                : `${t.por_confirmar} destes preços ainda não foram confirmados`}{' '}
              na fonte.
            </strong>{' '}
            Estão marcados abaixo. Confirme antes de contar com eles.
          </p>
        </div>
      )}

      {/* DUAS COLUNAS NUM ECRÃ LARGO (P1-014), como a paragem: as tabelas à
          esquerda e o «Que título me serve?» ao lado delas. No telemóvel, a
          ajuda continua a vir antes das tabelas. */}
      <div className="em-colunas">
        {/* «QUE TÍTULO ME SERVE?» antes das tabelas: uma conta e não uma
            segunda lista de preços (`EscolherTitulo`). Só nas redes em que
            há com que comparar — um bilhete e um passe. */}
        {escolhas.length > 0 && (
          <section className="coluna-lateral" aria-labelledby="qual">
            <h2 id="qual">Que título me serve?</h2>
            <EscolherTitulo escolhas={escolhas} moeda={t.moeda} />
          </section>
        )}

        <div className="coluna-principal">
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
                            <span className="secundario">{semMaiusculas(x.nota)}</span>
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
        </div>
      </div>

      <h2>Quem gere</h2>
      <p>{redeEQuemAGere(r)}. Os preços são os que a operadora publica.</p>
    </>
  );
}

/**
 * SEM RÓTULOS EM MAIÚSCULAS (§6), também no que vem dos dados: uma nota que
 * escreve «Condições POR CONFIRMAR» grita a quem a lê, e um leitor de ecrã
 * soletra-a. Só as sequências de duas ou mais palavras inteiras em
 * maiúsculas passam a minúsculas — as siglas («CP», «LINK») ficam.
 */
function semMaiusculas(texto: string): string {
  return texto.replace(/\b[A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,})+\b/g, (m) => m.toLowerCase());
}
