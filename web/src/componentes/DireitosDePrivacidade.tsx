/**
 * O que o artigo 13.º do RGPD manda dizer e a privacidade não dizia: com que
 * fundamento, durante quanto tempo, que direitos há e a quem reclamar, e
 * quando a política mudou.
 *
 * Um componente só para a privacidade do produto e para a de cada região,
 * para as duas não divergirem — a do produto trata por «você», a das regiões
 * por «tu», e é a única coisa que muda. O Coreto já o dizia nas dele.
 *
 * Os prazos dizem o critério e não um número que o repositório não prova: o
 * tempo que o serviço de medição guarda os registos é uma definição dele.
 */

/** Quando esta política mudou pela última vez — muda quando muda um tratamento. */
export const REVISAO_DA_PRIVACIDADE = '2026-10-13';

const QUANDO = new Date(`${REVISAO_DA_PRIVACIDADE}T12:00:00Z`).toLocaleDateString('pt-PT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Lisbon',
});

export default function DireitosDePrivacidade({
  voz,
  mede,
  identificada,
  email,
}: {
  voz: 'tu' | 'voce';
  mede: boolean;
  identificada: boolean;
  /** A quem se escreve para exercer os direitos; sem ele, diz-se para escrever a quem responde. */
  email: string | null;
}) {
  const tu = voz === 'tu';
  const escrever = email ? (
    <>
      {tu ? 'Basta escreveres para ' : 'Basta escrever para '}
      <a href={`mailto:${email}`}>{email}</a>
    </>
  ) : tu ? (
    'Basta escreveres a quem responde pelos dados'
  ) : (
    'Basta escrever a quem responde pelos dados'
  );
  return (
    <>
      <h2>Com que fundamento</h2>
      <ul>
        {mede ? (
          <li>
            {identificada
              ? 'A medição que liga as visitas à mesma pessoa só se faz com consentimento (alínea a) do n.º 1 do artigo 6.º do RGPD).'
              : 'A medição faz-se ao abrigo do interesse legítimo (alínea f) do n.º 1 do artigo 6.º do RGPD): saber que páginas servem a quem viaja, para as melhorar. Contam-se visitas, não pessoas.'}
          </li>
        ) : null}
        <li>
          {tu
            ? 'O que nos escreveres serve para te responder, a teu pedido.'
            : 'O que nos escrever serve para lhe responder, a seu pedido.'}
        </li>
      </ul>

      <h2>Durante quanto tempo</h2>
      <ul>
        {mede ? (
          <li>
            As medições ficam no serviço de medição pelo prazo de conservação dele, e nunca se
            juntam a um nome nem a um contacto.
          </li>
        ) : null}
        <li>Os emails, enquanto a conversa durar e o que dela resultar o exigir.</li>
      </ul>

      <h2>{tu ? 'Os teus direitos' : 'Os seus direitos'}</h2>
      <p>
        {tu ? 'Tens' : 'Tem'} direito a pedir o acesso aos dados, a retificação, o apagamento, a
        limitação do tratamento e a portabilidade, e a opor-{tu ? 'te' : 'se'} ao que se faz por
        interesse legítimo. {escrever}; a resposta chega no prazo de um mês.{' '}
        {mede && !identificada
          ? 'Como as medições não identificam ninguém, não há maneira de as separar por pessoa nem de as apagar uma a uma (artigo 11.º do RGPD). '
          : ''}
        Se {tu ? 'entenderes' : 'entender'} que os dados não estão a ser tratados como deviam,{' '}
        {tu ? 'podes' : 'pode'} reclamar junto da{' '}
        <a href="https://www.cnpd.pt/" target="_blank" rel="noopener noreferrer">
          Comissão Nacional de Proteção de Dados (CNPD)
        </a>
        .
      </p>

      <h2>Quando esta política mudou</h2>
      <p>
        A <time dateTime={REVISAO_DA_PRIVACIDADE}>{QUANDO}</time>, quando passou a dizer o
        fundamento, os prazos e os direitos. Esta data muda quando muda um tratamento.
      </p>
    </>
  );
}
