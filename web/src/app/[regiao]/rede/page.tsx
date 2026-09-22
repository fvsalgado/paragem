import Link from 'next/link';
import {
  aPedido,
  exigirRegiao,
  concelhos,
  linhas,
  paragens,
  estacoes,
  avisos,
  NOME_DOS_MODOS,
  url,
  urlRede,
  procura,
  modos as lerModos,
  caminhoDoModo,
} from '@/lib/dados';
import MarcaDeDados from '@/componentes/MarcaDeDados';
import PertoDeTi from '@/componentes/PertoDeTi';

/**
 * O CATÁLOGO: todas as paragens, linhas, estações e concelhos, em listas.
 *
 * Era a página inicial da região, e isso fazia dela um bom repositório e um
 * mau serviço — quem chega não sabe o nome da linha nem o da paragem. A porta
 * de entrada passou a ser o mapa; isto ficou onde tem de estar.
 *
 * E não é um arquivo morto: é a espinha acessível e indexável por baixo da
 * aplicação. Tudo o que o mapa faz, faz-se aqui em HTML — incluindo o «Perto
 * de ti», que é o equivalente do ponto azul para quem não usa mapas.
 */
export default async function Inicio({ params }: { params: Promise<{ regiao: string }> }) {
  const { regiao: rid } = await params;
  const r = await exigirRegiao(rid);
  const cs = await concelhos(rid);
  const ls = await linhas(rid);
  const ps = await paragens(rid);
  const es = await estacoes(rid);
  const as = await avisos(rid);
  const pontos = await procura(rid);
  const pedido = await aPedido(rid);
  const dosModos = await lerModos(rid);
  const temPagina = (m: string) => m in dosModos;
  const ondeVaiOModo = (r: string, m: string) => {
    const caminho = caminhoDoModo(m, temPagina);
    return caminho ? url(r, caminho) : null;
  };
  const quantosNoModo: Record<string, string> = {
    autocarro: `${ls.length} linhas`,
    comboio: `${es.length} estações`,
    ...(pedido ? { 'a-pedido': `${pedido.zonas.length} zonas` } : {}),
    ...Object.fromEntries(
      Object.entries(dosModos).map(([m, d]) => [m, d.quantos ? String(d.quantos) : 'por levantar']),
    ),
  };

  return (
    <>
      <h1>A rede {r.de}</h1>
      <p>
        Todas as paragens, linhas, estações e concelhos, em listas. É daqui que saem as páginas que
        funcionam sem mapa e sem JavaScript — e é o caminho de quem não pode ou não quer usar um
        mapa. Para planear uma viagem, o <Link href={url(rid)}>mapa</Link> é mais rápido.
      </p>
      <MarcaDeDados regiao={rid} detalhe />

      <section aria-labelledby="planear">
        <h2 id="planear">Para onde vais?</h2>
        <p>
          <Link href={url(rid, '/viagem/')}>Planear uma viagem</Link> — de uma paragem a outra, com
          transbordos.
        </p>
      </section>

      {as.length > 0 && (
        <section aria-labelledby="avisos">
          <h2 id="avisos">Avisos</h2>
          {as.map((a) => (
            <div key={a.id} className={`faixa ${a.gravidade === 'grave' ? 'alerta' : ''}`}>
              <strong>{a.titulo}</strong>
              <p>{a.texto}</p>
            </div>
          ))}
        </section>
      )}

      <PertoDeTi regiao={rid} pontos={pontos} />

      {/* O TELEFONE FICA AQUI, e não só na página própria. Quem chega a esta
          página a procurar transporte numa freguesia sem carreira precisa do
          número antes de precisar de qualquer outra coisa — obrigá-lo a
          seguir uma ligação primeiro é pôr um passo entre ele e a viagem. */}
      {pedido && (
        <section aria-labelledby="a-pedido">
          <h2 id="a-pedido">Transporte a pedido</h2>
          <div className="faixa a-pedido">
            <p>
              Há circuitos que só circulam se alguém os reservar, em {pedido.zonas.length} zonas.{' '}
              {pedido.reservas.prazo}.
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

      {/* A GRELHA TEM DE LEVAR A ALGUM LADO.
          Eram sete cartões e quatro não levavam: bicicletas, táxis, urbanos
          municipais e expressos eram rótulos pintados. Quem toca em
          «Bicicleta partilhada» quer a estação mais perto de si.
          Um modo sem destino continua a aparecer — a região declara-o, e
          escondê-lo era dizer que não existe —, mas sem fingir ser botão. */}
      <section aria-labelledby="modos">
        <h2 id="modos">Por modo</h2>
        <ul className="lista">
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

      <section aria-labelledby="procurar">
        <h2 id="procurar">Procurar</h2>
        <ul className="lista">
          <li>
            <Link href={urlRede(rid, 'paragens/')}>
              <span>Paragens</span>
              <span className="secundario">{ps.length}</span>
            </Link>
          </li>
          <li>
            <Link href={urlRede(rid, 'linhas/')}>
              <span>Linhas</span>
              <span className="secundario">{ls.length}</span>
            </Link>
          </li>
          {/* Só quando a região tem comboio — e o painel não o desligou. */}
          {r.modos.includes('comboio') && (
            <li>
              <Link href={urlRede(rid, 'estacoes/')}>
                <span>Estações de comboio</span>
                <span className="secundario">{es.length}</span>
              </Link>
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="concelhos">
        <h2 id="concelhos">Concelhos</h2>
        <p>
          {r.municipios_membros} municípios {r.autoridade?.sigla ? `da ${r.autoridade.sigla}` : ''},
          e {r.concelhos_servidos - r.municipios_membros} também servidos pela rede.
        </p>
        <ul className="lista">
          {cs.map((c) => (
            <li key={c.id}>
              <Link href={urlRede(rid, `concelhos/${c.id}/`)}>
                <span>{c.nome}</span>
                <span className="secundario">
                  {c.paragens} paragens
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
