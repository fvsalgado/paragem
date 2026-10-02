import Link from 'next/link';
import {
  regioesDisponiveis,
  regiao,
  concelhos,
  linhas,
  paragens,
  estacoes,
  origemDaRegiao,
} from '@/lib/dados';
import { numero, redeEQuemAGere } from '@/lib/prosa';
import { AUTOR, CODIGO, CONTACTO, CORETO, correioPara } from '@/lib/produto';
import { metadadosDoProduto } from '@/lib/metadados';

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
 *
 * PARECIA UM README (P1-042, P4-003): uma coluna de 608 px com um título, um
 * parágrafo e números, sem uma imagem, sem um botão, sem contacto. Um decisor
 * percebia o que era e não tinha para onde ir. Agora a ordem é a da pergunta
 * de quem decide: o que é e para quem (com o produto a funcionar ao lado), onde
 * se vê, o que inclui, como se entra, quem está por trás — e com quem se fala,
 * no princípio e no fim. A estrutura é a da montra do Coreto, que é da mesma
 * casa e vende às mesmas autoridades; a identidade é a do §6.
 *
 * O QUE AQUI SE AFIRMA EXISTE. Cada linha de «O que inclui» corresponde a uma
 * página, uma rota ou uma verificação do repositório no dia em que foi escrita;
 * o que ainda não existe — contas por pessoa no painel, o widget para as
 * câmaras — não entra até existir. E não há preços nem prazos: um preço de
 * tabela inventado, ou «cinco semanas» que ninguém mediu, é a primeira coisa
 * que uma autoridade cobra.
 */

/**
 * Uma hora de validade, como as páginas de cada região. A lista de regiões
 * vem da base do painel e a etiqueta dela é invalidada pelo `/api/revalidate`
 * e, mais tarde, pelo painel — desligar uma região tira-a daqui sem esperar.
 */
export const revalidate = 3600;

export const metadata = metadadosDoProduto({
  titulo: 'Paragem.pt — os transportes do seu território, num sítio só',
  absoluto: true,
  descricao:
    'Para comunidades intermunicipais, áreas metropolitanas e câmaras: autocarros, comboios, transporte a pedido, bicicletas, expressos e táxis num só sítio, com planeador de viagens, a página de cada paragem e de cada linha, e um painel para os avisos.',
  caminho: '/',
});

/** O que se lê, de cima a baixo, sobre o que o produto inclui. Só o que existe. */
const INCLUI: { titulo: string; itens: string[] }[] = [
  {
    titulo: 'Para quem viaja',
    itens: [
      'Um mapa com as paragens, as estações e os modos, feito a partir do OpenStreetMap e alojado connosco — sem serviços de mapas privados.',
      'Um planeador de viagens com transbordos, que corre no telemóvel e, quando não sabe, diz que não sabe.',
      'A página de cada paragem, linha, estação e concelho: o que passa a seguir e o horário completo.',
      'O transporte a pedido com as zonas e a regra de reserva; as bicicletas, os expressos, os táxis e os urbanos municipais, cada um com quem o gere.',
      'O tarifário a responder a «que título me serve?».',
    ],
  },
  {
    titulo: 'Para a sua equipa',
    itens: [
      'Um painel onde se publicam os avisos — que aparecem no sítio e saem em GTFS-RT para as aplicações de terceiros.',
      'Os horários reconstruídos todas as semanas a partir das fontes publicadas, com um relatório do que falta e de a quem se pede.',
      'O sítio no endereço da região: um subdomínio, ou o domínio da autoridade.',
    ],
  },
  {
    titulo: 'Para todos',
    itens: [
      'Acessível: WCAG 2.1 AA, verificado em cada alteração, com declaração de acessibilidade (Decreto-Lei n.º 83/2018).',
      'Sem cookies e sem dados pessoais: mede-se o que se procura, não quem procura.',
      'Dados para descarregar — GTFS, GBFS e GeoJSON —, cada ficheiro com a origem e os termos.',
      'Código livre, sob AGPL.',
    ],
  },
];

/**
 * A entrada de uma autoridade, escrita para ela: o que dá, o que decide, o
 * que fica a correr. Sem semanas — dependem do que já está publicado no
 * território, e uma estimativa escrita aqui era uma promessa que ninguém
 * mediu.
 */
const ENTRADA: { titulo: string; texto: string }[] = [
  {
    titulo: 'Uma conversa',
    texto:
      'Mostramos a demonstração e vemos o que já existe: que transportes há no território, quem os opera e o que está publicado.',
  },
  {
    titulo: 'As fontes',
    texto:
      'A autoridade indica o que está publicado: os horários da concessão (em GTFS, ou nos PDF da operadora), o tarifário, o calendário escolar e os feriados municipais. Cada fonte fica registada com a origem, a data e a licença.',
  },
  {
    titulo: 'A construção',
    texto:
      'A região entra por declaração, sem código novo. O relatório de lacunas diz o que falta e a quem se pede — nada se inventa para tapar um buraco.',
  },
  {
    titulo: 'As decisões',
    texto:
      'A autoridade decide o endereço, os modos que entram, quem escreve os avisos, e quando os dados se abrem e o sítio se deixa encontrar nos motores de busca.',
  },
  {
    titulo: 'No ar',
    texto:
      'O sítio publica-se no endereço escolhido. Os horários voltam a ser construídos todas as semanas, e os avisos publicam-se no painel, sem esperar por ninguém.',
  },
];

const PARA_QUEM: { titulo: string; texto: string }[] = [
  {
    titulo: 'Comunidade intermunicipal',
    texto:
      'A rede da concessão, os urbanos das câmaras, os comboios e o transporte a pedido dos concelhos todos — incluindo os que a concessão serve fora da comunidade. E as linhas que atravessam a fronteira não se cortam.',
  },
  {
    titulo: 'Área metropolitana',
    texto:
      'Muitos operadores e muitos modos, organizados por modo e não por operador: quem viaja não precisa de saber quem gere cada serviço, e a entidade responsável aparece como informação secundária.',
  },
  {
    titulo: 'Câmara municipal',
    texto:
      'A rede urbana do concelho, os circuitos da câmara e o que mais lá passa. O Paragem.pt licencia-se também a uma câmara sozinha.',
  },
];

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

  // «EXPERIMENTAR A DEMONSTRAÇÃO» LEVA À MAIS COMPLETA, e escolhe-a pelos
  // dados: a demonstração com mais paragens, entre as que têm endereço. Não
  // se escreve aqui o nome de nenhuma — uma demonstração nova e maior passa a
  // ser a do botão no dia em que é ligada, sem tocar nesta página.
  const demonstracao =
    fichas
      .filter((f) => f.r.demonstracao && f.origem)
      .sort((a, b) => b.paragens - a.paragens || a.id.localeCompare(b.id, 'pt'))[0] ?? null;

  const marcar = correioPara('Marcar uma demonstração do Paragem.pt');
  const proposta = correioPara('Pedido de proposta do Paragem.pt');

  return (
    <>
      <section className="produto-heroi" aria-labelledby="titulo">
        <div className="produto-interior">
          <div className="produto-heroi-texto">
            <p className="produto-sobretitulo">
              Para comunidades intermunicipais, áreas metropolitanas e câmaras
            </p>
            <h1 id="titulo">Os transportes do seu território, num sítio só.</h1>
            <p className="produto-chamada">
              Autocarros, comboios, transporte a pedido, bicicletas, expressos e táxis — seja quem
              for que os gere — num só sítio, no endereço da sua região, com planeador de viagens, a
              página de cada paragem e de cada linha, e um painel onde a sua equipa publica os
              avisos.
            </p>
            <ul className="linha-accoes produto-botoes">
              <li>
                <a className="botao" href={marcar}>
                  Marcar uma demonstração
                </a>
              </li>
              {demonstracao && (
                <li>
                  <a className="botao secundario" href={`${demonstracao.origem}/`}>
                    Experimentar a demonstração
                  </a>
                </li>
              )}
            </ul>
            {/* O ENDEREÇO À VISTA, logo debaixo do botão: um `mailto:` sem
                programa de correio configurado não abre nada, e quem carregou
                fica sem saber para onde escrever. */}
            <p className="secundario">
              Ou escreva para <span className="endereco-de-correio">{CONTACTO}</span>.
            </p>
            <ul className="produto-garantias" aria-label="Em resumo">
              <li>Acessível: WCAG 2.1 AA</li>
              <li>Sem cookies</li>
              <li>Dados abertos em GTFS e GBFS</li>
              <li>Código livre (AGPL)</li>
            </ul>
          </div>
          {/* O PRODUTO A FUNCIONAR, numa captura real de uma DEMONSTRAÇÃO e
              nunca de um cliente: esta página responde a qualquer anfitrião
              que o mapa não conheça, e uma imagem diz o nome, as terras e a
              rede tão bem como uma frase. Gera-se com
              `scripts/imagens-do-produto.mjs telemovel`, e as medidas vão
              declaradas para a página não saltar quando ela chega. */}
          <figure className="produto-telemovel">
            <div className="ecra">
              <img
                src="/produto/telemovel.webp"
                width={780}
                height={1688}
                alt="A página de uma paragem no telemóvel: o nome da paragem, o botão «Como chegar aqui», a nota «Horários planeados, não em tempo real» e, em «A seguir», as três próximas partidas, cada uma com o número da linha, o destino, os minutos que faltam e a hora."
                fetchPriority="high"
              />
            </div>
            <figcaption>
              Uma paragem da demonstração: o que passa a seguir, e daqui a quanto tempo.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="demonstracao" className="produto-faixa clara" aria-labelledby="ver">
        <div className="produto-interior">
          <h2 id="ver">Ver a funcionar</h2>
          <p className="produto-medida">
            Cada região responde no seu próprio endereço. As demonstrações são inventadas de fio a
            pavio — nenhuma paragem, nenhuma estrada e nenhum horário vêm de sítio nenhum —, para se
            mexer à vontade sem usar dados de ninguém.
          </p>
          {ordenadas.length === 0 && <p>Ainda não há nenhuma região construída.</p>}
          <ul className="produto-regioes">
            {ordenadas.map(({ id, r, ...n }) => (
              <li key={id} className={r.demonstracao ? 'cartao cartao-demonstracao' : 'cartao'}>
                {/* Cada região vive no seu domínio: a ligação é para lá. Uma
                    região sem domínio no mapa não tem para onde ligar, e o
                    cartão di-lo em vez de mandar para um 404. */}
                <h3>{n.origem ? <Link href={n.origem + '/'}>{r.nome}</Link> : r.nome}</h3>
                <p className="secundario">
                  {n.origem ? new URL(n.origem).host : 'Ainda sem endereço próprio.'}
                </p>
                {r.demonstracao ? (
                  <p>
                    <strong>Demonstração.</strong> Uma região inventada, para ver o produto a
                    funcionar sem usar dados de ninguém.
                  </p>
                ) : (
                  <p>{redeEQuemAGere(r)}.</p>
                )}
                <dl className="numeros">
                  <div>
                    <dt>Concelhos</dt>
                    <dd>{numero(n.concelhos)}</dd>
                  </div>
                  <div>
                    <dt>Linhas</dt>
                    <dd>{numero(n.linhas)}</dd>
                  </div>
                  <div>
                    <dt>Paragens</dt>
                    <dd>{numero(n.paragens)}</dd>
                  </div>
                  <div>
                    <dt>Estações</dt>
                    <dd>{numero(n.estacoes)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="para-quem" className="produto-faixa" aria-labelledby="para-quem-titulo">
        <div className="produto-interior">
          <h2 id="para-quem-titulo">Para quem é</h2>
          <p className="produto-medida">
            Para a autoridade de transportes do território. O que muda de uma para a outra é a
            escala, e a escala é configuração: os concelhos, os modos e as fontes de cada uma.
          </p>
          <ul className="produto-grelha">
            {PARA_QUEM.map((p) => (
              <li key={p.titulo} className="cartao">
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="o-que-inclui" className="produto-faixa clara" aria-labelledby="inclui">
        <div className="produto-interior">
          <h2 id="inclui">O que inclui</h2>
          <div className="produto-grelha">
            {INCLUI.map((g) => (
              <div key={g.titulo} className="produto-grupo">
                <h3>{g.titulo}</h3>
                <ul>
                  {g.itens.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="entrada" className="produto-faixa" aria-labelledby="entrada-titulo">
        <div className="produto-interior">
          <h2 id="entrada-titulo">Como é a entrada</h2>
          <p className="produto-medida">
            O que a autoridade de transportes nos dá, o que decide e o que fica a correr. Quanto
            tempo leva depende do que já está publicado no território, e vê-se na primeira conversa.
          </p>
          <ol className="produto-passos">
            {ENTRADA.map((p, i) => (
              <li key={p.titulo}>
                {/* O `ol` já conta para o leitor de ecrã; o número grande é o
                    mesmo, só que à vista. */}
                <span className="produto-numero" aria-hidden="true">
                  {i + 1}
                </span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
          <p className="produto-medida">
            Não há preço de tabela: para saber quanto custa no seu território, peça uma proposta.
          </p>
          <p className="cartao-accoes">
            <a className="botao secundario" href={proposta}>
              Pedir proposta
            </a>
          </p>
        </div>
      </section>

      <section id="como-funciona" className="produto-faixa clara" aria-labelledby="como">
        <div className="produto-interior produto-duas">
          <div>
            <h2 id="como">Como funciona</h2>
            {/* DIZIA «SÃO INDEXÁVEIS», e não eram: o robots.txt das regiões
                fecha-as aos motores de busca até a autoridade autorizar
                (§4.4). A frase passou a dizer o que o sítio faz. */}
            <p>
              As páginas de paragem, linha, estação e concelho saem dos horários publicados e são
              servidas como ficheiros, guardadas até os dados mudarem. Funcionam com o motor de
              viagens em baixo, e podem ser encontradas nos motores de busca quando a autoridade de
              transportes o autorizar. O planeador corre no próprio telemóvel, a partir da grelha
              horária, e quando não tem dados diz isso — não diz que não há viagem.
            </p>
            <p>
              Uma região entra por declaração e não por código: um ficheiro diz quem é a autoridade
              de transportes, que concelhos serve e de onde vêm os dados. É por isso que as
              demonstrações existem — são a prova, construída a cada alteração, de que uma região
              nova não precisa de tocar no produto.
            </p>
          </div>
          <div>
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
          </div>
        </div>
      </section>

      <section id="quem" className="produto-faixa" aria-labelledby="quem-titulo">
        <div className="produto-interior produto-duas">
          <div>
            <h2 id="quem-titulo">Quem está por trás</h2>
            <p>
              O Paragem.pt é desenhado e desenvolvido por {AUTOR.nome}: o nome, o código e o desenho
              são dele. O sítio de cada região é publicado em nome da autoridade de transportes, e
              abrir os dados dela com uma licença aberta é decisão dela.
            </p>
            <p>
              Da mesma casa: o <a href={CORETO}>Coreto</a>, a agenda cultural do seu território,
              numa agenda só.
            </p>
          </div>
          <div>
            <h2 id="licenca">O código e o nome</h2>
            <p>
              O código é livre, sob AGPL-3.0-only: pode ser lido, corrido e alterado, e quem o
              oferecer a outros pela rede com alterações tem de as partilhar.{' '}
              <a href={CODIGO}>Ver o código</a>.
            </p>
            <p>
              «Paragem.pt» é o nome do produto e não é abrangido pela licença do código. Os dados
              que o produto constrói não levam licença declarada: publicá-los com licença aberta
              depende de a autoridade de transportes autorizar a reutilização.
            </p>
          </div>
        </div>
      </section>

      <section className="produto-faixa produto-fecho" aria-labelledby="falar">
        <div className="produto-interior">
          <h2 id="falar">Falar sobre o seu território</h2>
          <p className="produto-medida">
            Escreva com o nome do território e o que já está publicado hoje. A primeira conversa
            serve para ver o que é preciso.
          </p>
          <ul className="linha-accoes produto-botoes">
            <li>
              <a className="botao" href={marcar}>
                Marcar uma demonstração
              </a>
            </li>
            <li>
              <a className="botao secundario" href={proposta}>
                Pedir proposta
              </a>
            </li>
          </ul>
          <p className="correio-por-extenso">
            <span className="endereco-de-correio">{CONTACTO}</span>
          </p>
        </div>
      </section>
    </>
  );
}
