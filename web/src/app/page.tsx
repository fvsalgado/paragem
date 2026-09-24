import type { Viewport } from 'next';
import Link from 'next/link';
import { Assinatura } from '@/componentes/Marca';
import { CORES_DA_FAIXA } from '@/lib/marca';
import {
  regioesDisponiveis,
  regiao,
  concelhos,
  linhas,
  paragens,
  estacoes,
  origemDaRegiao,
} from '@/lib/dados';

/**
 * A porta de entrada do PRODUTO, que não é a porta de entrada de nenhuma
 * região.
 *
 * O §1 diz «uma só porta de entrada» e fala de quem viaja: essa porta é a
 * página inicial de uma região, onde ninguém precisa de saber quem gere o quê.
 * Esta é outra coisa — é para quem chega a `paragem.pt` sem região, e sobretudo
 * para quem está a decidir se quer isto na sua.
 *
 * Por isso NÃO tem campo de procura. Uma caixa de «para onde vais?» aqui
 * pediria uma paragem sem saber de que rede, e a primeira coisa que o produto
 * faz não pode ser uma pergunta a que ele próprio não consegue responder.
 */
/**
 * Uma hora de validade, como as páginas de cada região. A lista de regiões
 * vem da base do painel e a etiqueta dela é invalidada pelo `/api/revalidate`
 * e, mais tarde, pelo painel — desligar uma região tira-a daqui sem esperar.
 */
export const revalidate = 3600;

/** O azul-noite da montra, e não o azul das regiões (`lib/marca.ts`). */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: CORES_DA_FAIXA.montra },
    { media: '(prefers-color-scheme: dark)', color: CORES_DA_FAIXA.montra },
  ],
};

export default async function Produto() {
  const ids = await regioesDisponiveis();

  // Uma região ligada na base mas ainda sem dados no armazém não se mostra:
  // um cartão sem números a apontar para um 404 era pior do que nenhum.
  const fichas = (
    await Promise.all(
      ids.map(async (id) => {
        const r = await regiao(id);
        if (!r) return null;
        const [cs, ls, ps, es, origem] = await Promise.all([
          concelhos(id),
          linhas(id),
          paragens(id),
          estacoes(id),
          origemDaRegiao(id),
        ]);
        return {
          id,
          r,
          origem,
          concelhos: cs.length,
          linhas: ls.length,
          paragens: ps.length,
          estacoes: es.length,
        };
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  // A demonstração vai no fim: quem chega aqui quer ver o que é real primeiro.
  const ordenadas = [...fichas].sort((a, b) => {
    const da = a.r.demonstracao ? 1 : 0;
    const db = b.r.demonstracao ? 1 : 0;
    return da - db || a.id.localeCompare(b.id, 'pt');
  });

  return (
    <>
      {/* A faixa da montra é a outra cor da marca (`lib/marca.ts`): quem cai
          aqui não está no sítio de nenhuma região, e percebe-o antes de ler. */}
      <header className="cabecalho cabecalho-montra">
        <div className="interior">
          <span className="marca">
            <Assinatura />
          </span>
        </div>
      </header>

      <main id="conteudo" className="pagina">
        <h1>Todos os transportes de uma região, num sítio só</h1>
        <p>
          Quem viaja não tem de saber quem gere cada serviço. O Paragem.pt junta os autocarros, os
          comboios, o transporte a pedido, as bicicletas partilhadas, os expressos e os táxis de um
          território — seja qual for a entidade responsável — e responde à única pergunta que
          interessa a quem está numa paragem: <strong>como é que vou dali para ali</strong>.
        </p>

        <section aria-labelledby="regioes">
          <h2 id="regioes">As regiões</h2>
          {ordenadas.length === 0 && <p>Ainda não há nenhuma região construída.</p>}
          <ul className="cartoes">
            {ordenadas.map(({ id, r, ...n }) => {
              return (
                <li key={id} className={r.demonstracao ? 'cartao cartao-demonstracao' : 'cartao'}>
                  {/* Cada região vive no seu domínio: a ligação é para lá. Uma
                      região sem domínio no mapa não tem para onde ligar, e o
                      cartão di-lo em vez de mandar para um 404. */}
                  <h3>{n.origem ? <Link href={n.origem + '/'}>{r.nome}</Link> : r.nome}</h3>
                  {!n.origem && <p className="secundario">Ainda sem endereço próprio.</p>}
                  {r.demonstracao ? (
                    <p>
                      <strong>Demonstração.</strong> Uma região inventada de fio a pavio — nenhuma
                      paragem, nenhuma estrada e nenhum horário vêm de sítio nenhum. Serve para ver
                      o produto a funcionar sem usar dados de ninguém.
                    </p>
                  ) : (
                    <p>
                      Rede gerida por {r.autoridade?.nome ?? 'uma autoridade de transportes'}
                      {r.rede?.operador ? `, com operação de ${r.rede.operador}` : ''}.
                    </p>
                  )}
                  <dl className="numeros">
                    <div>
                      <dt>Concelhos</dt>
                      <dd>{n.concelhos}</dd>
                    </div>
                    <div>
                      <dt>Linhas</dt>
                      <dd>{n.linhas}</dd>
                    </div>
                    <div>
                      <dt>Paragens</dt>
                      <dd>{n.paragens}</dd>
                    </div>
                    <div>
                      <dt>Estações</dt>
                      <dd>{n.estacoes}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="como">
          <h2 id="como">Como funciona</h2>
          <p>
            As páginas de paragem, linha, estação e concelho saem dos horários publicados e são
            servidas como ficheiros, guardadas até os dados mudarem. Funcionam com o motor de
            viagens em baixo e são indexáveis. O planeador corre no próprio telemóvel, a partir da
            grelha horária, e quando não tem dados diz isso — não diz que não há viagem.
          </p>
          <p>
            Uma região entra por declaração e não por código: um ficheiro diz quem é a autoridade de
            transportes, que concelhos serve e de onde vêm os dados. É por isso que a demonstração
            acima existe — é a prova, construída a cada alteração, de que uma região nova não
            precisa de tocar no produto.
          </p>
        </section>

        <section aria-labelledby="dados">
          <h2 id="dados">Os dados</h2>
          <p>
            Só fontes públicas, cada uma registada com o endereço, a data e a licença. O que falta
            fica à vista em vez de ser preenchido a palpite: um horário sem dias declarados di-lo,
            um preço por confirmar di-lo, e uma hora calculada por nós vai marcada.
          </p>
          <p>
            Mapas e localizações de bicicletas e táxis: © contribuidores do{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, sob ODbL. Limites
            administrativos: Direção-Geral do Território, CC BY 4.0.
          </p>
        </section>
      </main>

      <footer className="rodape">
        <div className="interior">
          <p>
            Paragem.pt. O código é livre, sob AGPL-3.0-only; o nome do produto não é abrangido pela
            licença do código.
          </p>
        </div>
      </footer>
    </>
  );
}
