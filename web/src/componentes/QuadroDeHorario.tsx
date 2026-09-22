import type { QuadroDeCartaz, ViagemDeCartaz } from '@/lib/formato';

/**
 * A grelha de um horário lido de um cartaz: paragens em linha, viagens em coluna.
 *
 * Serve duas páginas — a dos urbanos municipais e a do transporte a pedido — e
 * está aqui por isso: duas cópias da mesma tabela divergem, e a divergência
 * aparece como uma página acessível e outra não.
 *
 * **É uma `<table>` porque É uma tabela.** Um leitor de ecrã anuncia a linha e
 * a coluna a quem navega por células; sem cabeçalhos de linha e de coluna,
 * trinta paragens por vinte e seis viagens leem-se como uma parede de números
 * em que ninguém sabe de que viagem é cada hora.
 *
 * **Dentro de um `<details>` fechado.** Desenrolada, uma linha urbana com
 * trinta paragens empurra o resto da página para fora do ecrã de um
 * telemóvel. Quem quer a grelha toca e abre; quem quer só a primeira hora
 * lê-a no resumo, sem abrir nada.
 *
 * **E nem toda a folha é um percurso.** Há folhetos que listam, para cada
 * cidade, as horas a que se pode partir dela — não a ordem por que um
 * autocarro lhes passa. Esse quadro vem com `tipo: 'partidas'` e sem viagens
 * nenhumas, e mostra-se como o que é: uma tabela de partidas, sem prometer
 * percurso.
 */
export default function QuadroDeHorario({
  quadro,
  titulo,
}: {
  quadro: QuadroDeCartaz;
  /** O nome da linha ou do circuito. Vai para a legenda da tabela. */
  titulo: string;
}) {
  const nome = quadro.nome ? `${titulo} — ${quadro.nome}` : titulo;
  if (quadro.tipo === 'partidas') return <Partidas quadro={quadro} titulo={nome} />;

  const viagens = quadro.viagens;
  if (viagens.length === 0) return null;
  const primeira = viagens[0];
  const rotulo = rotuloComum(viagens);

  return (
    <details className="quadro-de-horario">
      <summary>
        {quadro.nome ? `${quadro.nome} · ` : ''}
        {viagens.length} {viagens.length === 1 ? 'viagem' : 'viagens'}
        {rotulo ? ` · ${rotulo}` : ''} — da {primeira.passagens[0][0]} às {primeira.passagens[0][1]}
      </summary>
      <div
        className="rolar-na-horizontal"
        tabIndex={0}
        role="group"
        aria-label={`Horário de ${nome}`}
      >
        <table>
          <caption className="so-para-leitores">{nome}, horário paragem a paragem</caption>
          <thead>
            <tr>
              <th scope="col">Paragem</th>
              {viagens.map((v, i) => (
                <th key={i} scope="col">
                  {v.passagens[0][1]}
                  {v.rotulo ? <span className="so-para-leitores"> · {v.rotulo}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quadro.paragens.map((paragem, ip) => (
              <tr key={ip}>
                <th scope="row">{paragem}</th>
                {viagens.map((v, i) => (
                  <td key={i}>{horaEm(v, paragem) ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Regras regras={quadro.regras} />
    </details>
  );
}

/**
 * Uma tabela de partidas: por cada local, as horas a que se parte dele.
 *
 * Não tem colunas de viagem porque não há viagem nenhuma a mostrar. Quem lê
 * quer saber a que horas pode sair da terra onde está, e é isso que a linha
 * dela diz.
 */
function Partidas({ quadro, titulo }: { quadro: QuadroDeCartaz; titulo: string }) {
  const horas = quadro.horas ?? [];
  if (quadro.paragens.length === 0) return null;
  const colunas = Math.max(0, ...horas.map((h) => h.length));

  return (
    <details className="quadro-de-horario">
      <summary>
        {quadro.paragens.length} {quadro.paragens.length === 1 ? 'local' : 'locais'} · {colunas}{' '}
        {colunas === 1 ? 'partida por dia' : 'partidas por dia'}
      </summary>
      <p className="nota">
        Isto é uma tabela de partidas e não um percurso: cada linha diz a que horas se parte desse
        local, não por que ordem o autocarro lhes passa.
      </p>
      <div
        className="rolar-na-horizontal"
        tabIndex={0}
        role="group"
        aria-label={`Partidas de ${titulo}`}
      >
        <table>
          <caption className="so-para-leitores">{titulo}, horas de partida de cada local</caption>
          <thead>
            <tr>
              <th scope="col">Parte de</th>
              {Array.from({ length: colunas }, (_, j) => (
                <th key={j} scope="col">
                  {quadro.rotulos[j] || `${j + 1}.ª`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quadro.paragens.map((paragem, ip) => (
              <tr key={ip}>
                <th scope="row">{paragem}</th>
                {Array.from({ length: colunas }, (_, j) => (
                  <td key={j}>{horas[ip]?.[j] || '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Regras regras={quadro.regras} />
    </details>
  );
}

/** As regras que a folha escreve por baixo do quadro. Não se interpretam. */
function Regras({ regras }: { regras?: string[] }) {
  if (!regras || regras.length === 0) return null;
  return (
    <ul className="regras-do-quadro">
      {regras.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  );
}

/**
 * A hora a que uma viagem passa numa paragem — ou nada, se não passar ali.
 *
 * Procura pelo NOME e não pelo índice: uma viagem só traz as paragens onde
 * para, e um índice punha a hora na linha errada a partir da primeira que
 * falta. E a VOLTA traz as paragens pela ordem inversa da lista, que é a
 * ordem em que se anda — mais uma razão para não contar posições.
 */
function horaEm(v: ViagemDeCartaz, paragem: string): string | null {
  for (const [nome, hora] of v.passagens) if (nome === paragem) return hora;
  return null;
}

/** O rótulo do quadro, quando as viagens dele têm todas o mesmo. */
function rotuloComum(viagens: ViagemDeCartaz[]): string {
  const todos = new Set(viagens.map((v) => v.rotulo).filter(Boolean));
  return todos.size === 1 ? [...todos][0] : '';
}
