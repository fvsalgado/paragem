import type { Metadata } from 'next';
import ConstrutorDaCaixa from '@/componentes/widget/ConstrutorDaCaixa';
import { concelhos, exigirRegiao, origemDaRegiao, regiao } from '@/lib/dados';
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
    titulo: 'Para o seu sítio',
    descricao: `Uma caixa com os transportes ${r.de} para colar no sítio de uma câmara, de uma junta ou de uma escola.`,
    caminho: '/levar/',
  });
}

/**
 * As caixas para os sítios das câmaras, das juntas, das escolas (P4-007): o
 * que são, como se montam, e o código para colar.
 *
 * O MESMO DESENHO DO CORETO, que é da mesma casa e o fez primeiro: escolhe-se
 * em cima, vê-se a caixa a sério, copia-se uma linha. E a mesma promessa:
 * sem conta, sem chave, sem cookies, sem seguir ninguém.
 */
export default async function ParaOSeuSitio({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const [cs, origem] = await Promise.all([concelhos(rid), origemDaRegiao(rid)]);
  const comParagens = r.modos.includes('autocarro');

  return (
    <>
      <h1>Os transportes no seu sítio</h1>
      <p>
        Uma caixa pronta a colar no sítio da câmara, da junta, da escola ou da associação:{' '}
        {comParagens ? 'as próximas partidas de uma paragem, ou ' : ''}o «Para onde vais?» que abre
        o planeador {r.de}. Não é preciso conta, nem chave, nem pedir autorização — e não há nada
        para instalar.
      </p>

      <section aria-labelledby="monte">
        <h2 id="monte">Monte a sua</h2>
        <ConstrutorDaCaixa
          regiao={rid}
          origem={origem}
          concelhos={Object.fromEntries(cs.map((c) => [c.id, c.nome]))}
          modosDesligados={r.modos_desligados ?? []}
          comParagens={comParagens}
        />
      </section>

      <section aria-labelledby="opcoes">
        <h2 id="opcoes">Todas as opções</h2>
        <p>Para quem prefere escrever o código à mão:</p>
        <div
          className="rolavel"
          tabIndex={0}
          role="region"
          aria-label="Os atributos que a caixa aceita"
        >
          <table className="tabela-de-opcoes">
            <caption className="so-para-leitores">Os atributos que a caixa aceita</caption>
            <thead>
              <tr>
                <th scope="col">Atributo</th>
                <th scope="col">Valores</th>
                <th scope="col">Por omissão</th>
                <th scope="col">O que faz</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>data-paragem</code>
                </td>
                <td>o identificador da paragem, o que está no fim do endereço da página dela</td>
                <td>nenhuma</td>
                <td>
                  Mostra as próximas partidas dessa paragem. Sem ele, a caixa é o «Para onde vais?».
                </td>
              </tr>
              <tr>
                <td>
                  <code>data-quantas</code>
                </td>
                <td>1 a 10</td>
                <td>5</td>
                <td>Quantas partidas mostrar.</td>
              </tr>
              <tr>
                <td>
                  <code>data-titulo</code>
                </td>
                <td>texto</td>
                <td>«Próximas partidas» ou «Para onde vais?»</td>
                <td>O nome que os leitores de ecrã anunciam ao encontrar a caixa.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="secundario">
          Um valor que não se reconheça ignora-se e vale o de omissão: um erro de escrita não deixa
          a caixa em branco.
        </p>
      </section>

      <section aria-labelledby="letra-pequena">
        <h2 id="letra-pequena">A letra pequena</h2>
        <ul>
          <li>
            A caixa não põe cookies, não mede quem a vê e não lê nada da página onde está. Carrega
            as partidas e mais nada.
          </li>
          <li>
            As horas são as planeadas, não em tempo real — como em todo este sítio — e o que passa a
            seguir calcula-se com o relógio de quem a vê.
          </li>
          <li>As ligações abrem noutro separador, para ninguém sair do seu sítio sem querer.</li>
          <li>
            Segue o tema do aparelho de quem a vê: clara de dia, escura quando o sistema o pede.
          </li>
          <li>Os dados são os mesmos deste sítio: o que se corrige aqui, corrige-se na caixa.</li>
        </ul>
      </section>
    </>
  );
}
