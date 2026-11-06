import Link from '@/componentes/Ligacao';
import {
  aPedido,
  exigirRegiao,
  concelhos,
  linhas,
  paragens,
  estacoes,
  lacunas,
  servicosSemDatas,
  NOME_DOS_MODOS,
  url,
  urlRede,
  modos as lerModos,
  caminhoDoModo,
  numeros as lerNumeros,
  tarifas,
} from '@/lib/dados';
import FaixaDeAvisos from '@/componentes/Avisos';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import PertoDeTi from '@/componentes/PertoDeTi';
import ProcurarNaRegiao from '@/componentes/ProcurarNaRegiao';
import ProcurarParagem from '@/componentes/ProcurarParagem';
import DireccoesDaPagina from '@/componentes/DireccoesDaPagina';
import { avisosEmVigor } from '@/lib/avisos';
import { catalogoDosAvisos } from '@/lib/avisos-do-sitio';
import { motorDaRegiao } from '@/lib/enderecos';
import { dataDosHorarios } from '@/lib/formato';
import { daRede, fraseDosOperadores, lista, numero, plural } from '@/lib/prosa';
import { quantosNoModo as contarNoModo } from '@/lib/por-modo';

/**
 * O CATÁLOGO: todas as paragens, linhas, estações e concelhos, em listas.
 *
 * Era a página inicial da região, e isso fazia dela um bom repositório e um
 * mau serviço — quem chega não sabe o nome da linha nem o da paragem. A porta
 * de entrada passou a ser o mapa; isto ficou em `/rede/`, onde tem de estar.
 *
 * E não é um arquivo morto: é a espinha acessível e indexável por baixo da
 * aplicação. Tudo o que o mapa faz, faz-se aqui em HTML — incluindo o «Perto
 * de ti», que é o equivalente do ponto azul para quem não usa mapas.
 *
 * É TAMBÉM O INÍCIO DE UMA REGIÃO SEM MAPA (`inicio`). Uma região que ainda
 * não tem mosaicos abria num ecrã de mapa sem mapa — uma caixa cinzenta a
 * dizer que faltava o recorte do OpenStreetMap, e era o primeiro ecrã das
 * demonstrações (P1-040, P2-041, P4-001). Sem mapa, o início é isto, com a
 * pergunta à cabeça: a procura, «Para onde quer ir?» com o planeador ali mesmo,
 * e o «Perto de ti». No dia em que a região tiver mosaicos, o início volta a
 * ser o mapa sozinho — quem decide é o inventário do que se publicou.
 */
export default async function CatalogoDaRegiao({
  regiao: rid,
  inicio = false,
}: {
  regiao: string;
  /** O início de uma região sem mapa: a procura e o planeador à cabeça. */
  inicio?: boolean;
}) {
  const r = await exigirRegiao(rid);
  const cs = await concelhos(rid);
  const ls = await linhas(rid);
  const ps = await paragens(rid);
  const es = await estacoes(rid);
  const [as, catalogo] = await Promise.all([avisosEmVigor(rid), catalogoDosAvisos(rid)]);
  const pedido = await aPedido(rid);
  const temTarifario = (await tarifas(rid)).titulos.length > 0;
  // OS PONTOS NÃO VÃO NA PÁGINA (P3-006): a procura pede-os à primeira tecla,
  // o «Perto de ti» quando sabe onde se está, e o planeador ao abrir.
  const desligados = r.modos_desligados ?? [];
  const dosModos = await lerModos(rid);
  const temPagina = (m: string) => m in dosModos;
  const ondeVaiOModo = (r: string, m: string) => {
    const caminho = caminhoDoModo(m, temPagina);
    return caminho ? url(r, caminho) : null;
  };
  // DE QUEM SÃO AS LINHAS, quando não são todas da rede (auditoria de
  // 1/11/2026, #16). «Autocarro — 145 linhas» não era o número que a
  // autoridade de transportes conhece — o caderno dela tem 122 —, e nada
  // dizia de onde vinham as outras 23: são de outros operadores que entram na
  // região. Os números são os do `numeros.json`, que a raiz confere.
  const n = await lerNumeros(rid);
  const linhasDaRede = n?.linhas_da_rede?.valor;
  const deFora = linhasDaRede != null && linhasDaRede < ls.length ? ls.length - linhasDaRede : 0;
  const nasParagens = n?.paragens_nos_concelhos?.valor;
  const quantosNoModo: Record<string, string> = {
    autocarro: deFora
      ? `${plural(linhasDaRede!, 'linha', 'linhas')} ${daRede(r)}, e ${numero(deFora)} de outros operadores`
      : plural(ls.length, 'linha', 'linhas'),
    comboio: plural(es.length, 'estação', 'estações'),
    ...(pedido ? { 'a-pedido': plural(pedido.zonas.length, 'zona', 'zonas') } : {}),
    // CADA NÚMERO COM A SUA UNIDADE (#109): «81 estações», «9 praças» — e não
    // «81» e «9», que não diziam de quê.
    ...Object.fromEntries(
      Object.entries(dosModos).map(([m, d]) => [m, contarNoModo(m, d) || 'por levantar']),
    ),
  };

  // O que a região tem, numa frase, para quem chega ao início sem mapa: as
  // listas estão mais abaixo, e esta é a resposta de relance a «o que há?».
  // DE QUEM SÃO, quando não são todas da rede: as listas levam as dos outros
  // operadores que param na região, e o número sozinho lia-se como um erro.
  const dosOperadores = fraseDosOperadores(n);
  const oQueHa = [
    ps.length ? plural(ps.length, 'paragem', 'paragens') : '',
    ls.length ? plural(ls.length, 'linha', 'linhas') : '',
    es.length ? plural(es.length, 'estação de comboio', 'estações de comboio') : '',
  ].filter(Boolean);

  const blocoPedido = (
    <>
      {/* O TELEFONE FICA AQUI, e não só na página própria. Quem chega a esta
        página a procurar transporte numa freguesia sem carreira precisa do
        número antes de precisar de qualquer outra coisa — obrigá-lo a
        seguir uma ligação primeiro é pôr um passo entre ele e a viagem. */}
      {pedido && (
        <section aria-labelledby="a-pedido">
          <h2 id="a-pedido">Transporte a pedido</h2>
          <div className="faixa a-pedido">
            <p>
              Há circuitos que só circulam se alguém os reservar, em{' '}
              {plural(pedido.zonas.length, 'zona', 'zonas')}. {pedido.reservas.prazo}.
            </p>
            <p className="cartao-accoes">
              {pedido.reservas.telefone && (
                <a className="botao" href={`tel:${pedido.reservas.telefone}`}>
                  Ligar {pedido.reservas.telefone_apresentado ?? pedido.reservas.telefone}
                </a>
              )}
              <Link href={url(rid, 'a-pedido/')}>Como funciona, e as zonas</Link>
            </p>
            {pedido.reservas.telefone_nota && (
              <p className="secundario">{pedido.reservas.telefone_nota}</p>
            )}
          </div>
        </section>
      )}
    </>
  );

  const blocoModos = (
    <>
      {/* A GRELHA TEM DE LEVAR A ALGUM LADO.
        Eram sete cartões e quatro não levavam: bicicletas, táxis, urbanos
        municipais e expressos eram rótulos pintados. Quem toca em
        «Bicicleta partilhada» quer a estação mais perto de si.
        Um modo sem destino continua a aparecer — a região declara-o, e
        escondê-lo era dizer que não existe —, mas sem fingir ser botão. */}
      <section aria-labelledby="modos">
        <h2 id="modos">Por modo</h2>
        <ul className="lista por-modo">
          {r.modos.map((m) => {
            const destino = ondeVaiOModo(rid, m);
            const rotulo = NOME_DOS_MODOS[m] ?? m;
            return (
              <li key={m}>
                {destino ? (
                  <Link className={`cartao modo-${m}`} href={destino}>
                    <span>{rotulo}</span>
                    <span className="secundario">{quantosNoModo[m] ?? ''}</span>
                  </Link>
                ) : (
                  <span
                    className={`cartao modo-${m}`}
                    style={{ display: 'block', margin: '0.4rem 0' }}
                  >
                    {rotulo}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );

  const blocoListas = (
    <>
      <section aria-labelledby="listas">
        <h2 id="listas">As listas</h2>
        <ul className="lista">
          {/* OS MESMOS NÚMEROS DAS LISTAS, e com o separador de milhares da
            casa (#16, #109): «3047» aqui e «3 047» na página seguinte. As
            paragens contam-se as dos concelhos da região, que é o que a
            lista abre a dizer; as de fora estão lá, mais abaixo. */}
          <li>
            <Link href={urlRede(rid, 'paragens/')}>
              <span>Paragens</span>
              <span className="secundario">
                {nasParagens != null && nasParagens < ps.length
                  ? `${numero(nasParagens)} na região`
                  : numero(ps.length)}
              </span>
            </Link>
          </li>
          <li>
            <Link href={urlRede(rid, 'linhas/')}>
              <span>Linhas</span>
              <span className="secundario">
                {deFora
                  ? `${numero(linhasDaRede!)} da rede, ${numero(deFora)} de outros operadores`
                  : numero(ls.length)}
              </span>
            </Link>
          </li>
          {/* Só quando a região tem comboio — e o painel não o desligou. */}
          {r.modos.includes('comboio') && (
            <li>
              <Link href={urlRede(rid, 'estacoes/')}>
                <span>Estações de comboio</span>
                <span className="secundario">{numero(es.length)}</span>
              </Link>
            </li>
          )}
          {/* O TARIFÁRIO TAMBÉM EM «A REDE», e não só no início sem mapa: com
              mapa, só se lá chegava pelo menu dele, e quem abria a rede à
              procura do preço não o achava. Só quando a região tem títulos. */}
          {temTarifario && (
            <li>
              <Link href={urlRede(rid, 'tarifario/')}>
                <span>Tarifário</span>
                <span className="secundario">que título me serve</span>
              </Link>
            </li>
          )}
        </ul>
      </section>
    </>
  );

  return (
    <>
      {inicio ? (
        <>
          <h1>Transportes {r.de}</h1>
          <p>
            {oQueHa.length ? `${lista(oQueHa)}, ` : ''}e os horários de cada uma. Escreva de onde
            parte e para onde vai, ou procure uma paragem.
          </p>
          {dosOperadores && oQueHa.length > 0 && <p className="secundario">{dosOperadores}</p>}
          <MarcaDeDados regiao={rid} detalhe />

          <section aria-labelledby="procurar-ponto">
            <h2 id="procurar-ponto">Procurar</h2>
            <div className="procura-sem-mapa">
              <ProcurarNaRegiao regiao={rid} modosDesligados={desligados} />
            </div>
          </section>

          <section aria-labelledby="planear">
            <h2 id="planear">Para onde quer ir?</h2>
            <DireccoesDaPagina
              regiao={rid}
              caixa={r.caixa}
              emDaRegiao={r.em}
              modosDesligados={r.modos_desligados ?? []}
              motorDaRegiao={motorDaRegiao(rid, r.demonstracao)}
              servicosSemDatas={servicosSemDatas(await lacunas(rid))}
              dadosDe={dataDosHorarios(r)}
              temAPedido={r.modos.includes('a-pedido') && !!pedido}
            />
          </section>
        </>
      ) : (
        <>
          <h1>A rede {r.de}</h1>
          {/* O CATÁLOGO DA REDE, e não o plano B de quem não usa mapas (#185):
              «o caminho de quem não pode ou não quer usar um mapa» apresentava
              as listas como o recurso, e «para saber como chegar, o mapa é
              mais rápido» mandava planear pelo mapa — quem planeia é o «Como
              chegar». */}
          <p>
            Todas as paragens, linhas, estações e concelhos {daRede(r)}, em listas. Para planear uma
            viagem, use <Link href={url(rid, '/viagem/')}>Como chegar</Link>.
          </p>
          <MarcaDeDados regiao={rid} detalhe />
        </>
      )}

      <FaixaDeAvisos avisos={as} catalogo={catalogo} />

      {inicio ? (
        <>
          <PertoDeTi regiao={rid} modosDesligados={desligados} dadosDe={dataDosHorarios(r)} />

          {blocoPedido}

          {blocoModos}

          {blocoListas}
        </>
      ) : (
        /* NUM ECRÃ LARGO, DUAS COLUNAS (#110). Era uma coluna de 576 px com três
           ecrãs e meio de altura, a 1 440 px: projetada numa reunião, parecia um
           documento e não o painel da rede. À esquerda o que se faz — planear,
           o que há aqui perto, o a pedido —, à direita por onde se procura. No
           telemóvel, uma a seguir à outra, pela mesma ordem. */
        <div className="em-colunas catalogo-da-rede">
          <div className="coluna-principal">
            {/* «PARA ONDE VAIS?» É A PERGUNTA, E «COMO CHEGAR» É O NOME (P2-042): a
                mesma pergunta do botão da folha do mapa, e o mesmo nome do botão
                das paragens e do título da página. Era «Planear uma viagem» — um
                terceiro nome para a mesma página. */}
            <section aria-labelledby="planear">
              <h2 id="planear">Para onde quer ir?</h2>
              <p>
                <Link href={url(rid, '/viagem/')}>Como chegar</Link> — de uma paragem a outra, com
                transbordos.
              </p>
            </section>

            <PertoDeTi regiao={rid} modosDesligados={desligados} dadosDe={dataDosHorarios(r)} />

            {blocoPedido}
          </div>
          <div className="coluna-lateral">
            {/* A PROCURA À CABEÇA DAS LISTAS (#103): o título «Procurar»
                encabeçava três ligações, e não uma procura. */}
            {ps.length > 0 && (
              <section aria-labelledby="procurar">
                <h2 id="procurar">Procurar</h2>
                <ProcurarParagem etiqueta="Paragem ou linha" />
              </section>
            )}
            {blocoModos}

            {blocoListas}
          </div>
        </div>
      )}

      <section aria-labelledby="concelhos">
        <h2 id="concelhos">Concelhos</h2>
        {/* «da <sigla>» cravava a contração no feminino, e «e 0 também servidos»
            dizia-se de uma região sem nenhum. Uma autoridade que é um
            município não tem municípios membros: diz quantos concelhos serve. */}
        <p>
          {r.autoridade?.tipo === 'municipio'
            ? `A rede serve ${plural(r.concelhos_servidos, 'concelho', 'concelhos')}.`
            : `${plural(r.municipios_membros, 'município membro', 'municípios membros')}${
                r.concelhos_servidos > r.municipios_membros
                  ? ` e ${plural(
                      r.concelhos_servidos - r.municipios_membros,
                      'concelho também servido',
                      'concelhos também servidos',
                    )} pela rede`
                  : ''
              }.`}
        </p>
        <ul className="lista concelhos-da-rede">
          {cs.map((c) => (
            <li key={c.id}>
              <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
                <span>{c.nome}</span>
                <span className="secundario">
                  {plural(c.paragens, 'paragem', 'paragens')}
                  {!c.membro && (
                    <>
                      <br />
                      também servido pela rede
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
