import type { Metadata } from 'next';
import ConstrutorDaCaixa from '@/componentes/widget/ConstrutorDaCaixa';
import { concelhos, exigirRegiao, origemDaRegiao, paragens, regiao } from '@/lib/dados';
import { paragemDeExemplo } from '@/lib/concelho';
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
/** Os atributos que a caixa aceita, para quem escreve o código à mão. */
const ATRIBUTOS = [
  {
    nome: 'data-paragem',
    valores: 'o identificador da paragem, o que está no fim do endereço da página dela',
    omissao: 'nenhuma',
    faz: 'Mostra as próximas partidas dessa paragem. Sem ele, a caixa é o «Para onde quer ir?».',
  },
  { nome: 'data-quantas', valores: '1 a 10', omissao: '5', faz: 'Quantas partidas mostrar.' },
  {
    nome: 'data-titulo',
    valores: 'texto',
    omissao: '«Próximas partidas» ou «Para onde quer ir?»',
    faz: 'O nome que os leitores de ecrã anunciam ao encontrar a caixa.',
  },
];

export default async function ParaOSeuSitio({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const [cs, origem] = await Promise.all([concelhos(rid), origemDaRegiao(rid)]);
  const comParagens = r.modos.includes('autocarro');
  // A CAIXA ABRE JÁ MONTADA, com uma paragem que os dados escolhem: abria
  // vazia, com a pré-visualização a pedir uma paragem e os botões de copiar
  // desligados — e é a página que se mostra às câmaras. Quem quiser outra muda.
  const exemplo = comParagens ? paragemDeExemplo(await paragens(rid)) : null;

  return (
    <>
      <h1>Os transportes no seu sítio</h1>
      <p>
        Uma caixa pronta a colar no sítio da câmara, da junta, da escola ou da associação:{' '}
        {comParagens ? 'as próximas partidas de uma paragem, ou ' : ''}o «Para onde quer ir?» que
        abre o planeador {r.de}. Não é preciso conta, nem chave, nem pedir autorização — e não há
        nada para instalar.
      </p>

      <section aria-labelledby="monte">
        <h2 id="monte">Monte a sua</h2>
        <ConstrutorDaCaixa
          regiao={rid}
          origem={origem}
          concelhos={Object.fromEntries(cs.map((c) => [c.id, c.nome]))}
          modosDesligados={r.modos_desligados ?? []}
          comParagens={comParagens}
          exemplo={
            exemplo ? { id: exemplo.id, nome: exemplo.nome, concelho: exemplo.concelho } : null
          }
        />
      </section>

      <section aria-labelledby="opcoes">
        <h2 id="opcoes">Todas as opções</h2>
        <p>Para quem prefere escrever o código à mão:</p>
        {/* UM ATRIBUTO DE CADA VEZ, e não uma tabela de quatro colunas (#175):
            a 390 px, «data-paragem» partia em dois e «O que faz» ficava com
            uma palavra por linha. Cada atributo diz os valores, o de omissão
            e o que faz, um por baixo do outro. */}
        <ul className="atributos-da-caixa" aria-label="Os atributos que a caixa aceita">
          {ATRIBUTOS.map((x) => (
            <li key={x.nome}>
              <p className="nome-do-atributo">
                <code>{x.nome}</code>
              </p>
              <p>{x.faz}</p>
              <dl>
                <div>
                  <dt>Valores</dt>
                  <dd>{x.valores}</dd>
                </div>
                <div>
                  <dt>Por omissão</dt>
                  <dd>{x.omissao}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
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
