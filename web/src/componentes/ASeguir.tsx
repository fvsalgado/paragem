import Distintivo from '@/componentes/Distintivo';
import { esperaLegivel, horaLegivel, operadorCurto, type PartidaLeve } from '@/lib/formato';
import { dataCompleta, fraseDoDia, type Proximas } from '@/lib/dias';

/**
 * «A SEGUIR»: o que passa numa paragem a partir de agora.
 *
 * Vivia dentro do cartão do mapa, e a página da paragem — o destino de
 * «Horário completo» — não o tinha: abria com dez quadros e 122 linhas de
 * tabela, e quem queria saber o que passa a seguir tinha de descobrir que
 * quadro valia hoje e descer até à hora. Saiu daqui para os dois sítios
 * dizerem o mesmo com o mesmo cálculo (`proximas`, em `lib/dias.ts`), com os
 * mesmos casos: hoje, o próximo dia com partidas, fora do período dos horários,
 * e sem a tabela dos dias.
 *
 * Não vai buscar nada: recebe o resultado e desenha-o. Quem o usa decide de
 * onde vêm as partidas e o calendário, e o que mostrar enquanto chegam.
 */
export default function ASeguir({
  resultado,
  instante,
  agora,
  cores,
  Titulo = 'h3',
  id,
  titulo = 'A seguir',
  modo,
}: {
  resultado: Proximas<PartidaLeve>;
  /** O relógio de quem lê — o mesmo que deu `agora`. */
  instante: Date;
  /** `HH:MM`, do mesmo relógio. */
  agora: string;
  /** A cor de cada linha, pelo identificador dela (`cores-das-linhas.json`). */
  cores: Record<string, string | null | undefined>;
  /**
   * O nível do título: um `h3` dentro do cartão do mapa, um `h2` na página;
   * `null` quando quem o usa já pôs o título por cima (a paragem à porta de
   * uma estação, com o nome dela e a distância).
   */
  Titulo?: 'h2' | 'h3' | null;
  id?: string;
  /** O texto do título: «A seguir», «Comboios a seguir». */
  titulo?: string;
  /** O modo das partidas, quando são todas de um — dá cor às linhas que não a trazem. */
  modo?: string;
}) {
  return (
    <>
      {Titulo && <Titulo id={id}>{titulo}</Titulo>}
      {resultado.tipo === 'fora-do-periodo' && (
        <p>
          Os horários carregados vão de {dataCompleta(resultado.inicio)} a{' '}
          {dataCompleta(resultado.fim)}, e não dizem o que passa hoje.
        </p>
      )}
      {resultado.tipo === 'nenhuma' && (
        <p>
          Nos horários carregados, que vão até {dataCompleta(resultado.fim)}, já não há partidas
          desta paragem.
        </p>
      )}
      {(resultado.tipo === 'no-dia' || resultado.tipo === 'sem-calendario') && (
        <>
          {/* QUANDO AS HORAS NÃO SÃO DE HOJE, DIZ-SE ANTES DE AS DAR.
              Uma lista de segunda-feira lida ao domingo parece a lista de
              domingo — e foi isso que a folha esteve a mostrar. */}
          {resultado.tipo === 'no-dia' && resultado.dias > 0 && (
            <p className="dia-das-partidas">{fraseDoDia(resultado, instante)}</p>
          )}
          {/* QUEM ESTÁ NA PARAGEM NÃO QUER UM RELÓGIO, QUER SABER SE DÁ
              TEMPO. «14:20» obriga a fazer a conta de cabeça, e a fazê-la
              outra vez a cada minuto; «12 min» responde à pergunta. A hora
              fica ao lado, em pequeno, porque quem planeia a tarde quer as
              horas — são duas perguntas e a lista responde às duas.

              A espera só se calcula quando se sabe o dia: hoje, ou amanhã
              (com as 24 horas somadas). Sem a tabela dos dias, ou para daqui
              a dois dias, fica só o relógio. */}
          <ul className="partidas">
            {resultado.partidas.map((d, i) => {
              const { texto, diaSeguinte } = horaLegivel(d.hora);
              const espera =
                resultado.tipo === 'no-dia' && resultado.dias <= 1
                  ? esperaLegivel(d.hora, agora, resultado.dias === 1)
                  : null;
              return (
                <li key={`${d.hora}-${d.linha_id}-${i}`}>
                  <Distintivo
                    codigo={d.linha}
                    cor={cores[d.linha_id]}
                    modo={modo}
                    tamanho="medio"
                  />
                  <span className="destino">
                    {/* UMA CIRCULAR DIZ-SE CIRCULAR. Repetir aqui o nome da
                        paragem onde a pessoa está não responde a nada — e nas
                        linhas urbanas era o que acontecia em 98 das 101
                        partidas de um cais. */}
                    {d.circular ? 'circular · volta aqui' : d.destino}
                    {/* O QUE NÃO É CERTO CONTINUA A DIZER-SE. Uma hora
                        interpolada por nós não é o que o horário publica, e o
                        §4.4 não deixa que isso se perca por a lista ficar
                        mais arrumada sem a nota. */}
                    {d.estimada && <em className="estimada"> hora estimada</em>}
                    {diaSeguinte && <em className="estimada"> dia seguinte</em>}
                    {/* Quem gere, em pequeno e só quando não é a rede da
                        região. Na mesma paragem param carreiras de duas
                        concessões, e o título de uma não serve na outra. */}
                    {d.operador && <em className="estimada"> · {operadorCurto(d.operador)}</em>}
                  </span>
                  {/* SEM ESPERA, A HORA É A RESPOSTA, e sobe para o lugar
                      dela: num dia que não é hoje, ou a mais de doze horas,
                      «06:45» em letra miúda era a única coisa que a linha
                      dizia, e dizia-a baixinho. */}
                  <span className="quando-passa">
                    {espera ? (
                      <>
                        <strong>{espera}</strong>
                        <span className="relogio">{texto}</span>
                      </>
                    ) : (
                      <strong>{texto}</strong>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {resultado.tipo === 'sem-calendario' && (
            <p className="secundario">
              Não foi possível confirmar em que dias anda cada serviço: estas horas podem não ser de
              hoje.
            </p>
          )}
        </>
      )}
    </>
  );
}
