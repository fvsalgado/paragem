/**
 * Os ícones. Desenhados aqui, e não trazidos de um conjunto.
 *
 * Duas razões, e a segunda é a que decide. A primeira: são oito formas
 * geométricas, e uma dependência para oito formas é uma dependência a mais
 * para auditar num sítio que não tem servidor nosso. A segunda: este
 * repositório declara a proveniência de tudo o que usa (§4.1, REUSE.toml), e
 * copiar caminhos de um conjunto de terceiros obriga a declarar a licença
 * dele. Desenhados, não obrigam a nada.
 *
 * Todos são traço — 2 px, pontas redondas — para lerem à mesma às 20 px e
 * herdarem a cor do texto à volta. E todos são `aria-hidden`: um ícone é uma
 * ajuda para quem vê, nunca a informação. O que eles ilustram está sempre
 * escrito ao lado, ou num texto só para leitores de ecrã.
 */
type Props = { tamanho?: number; className?: string };

function Svg({ tamanho = 20, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function APe(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="13.5" cy="4" r="2.2" fill="currentColor" stroke="none" />
      <path d="M13.5 7.5 11 13.5" />
      <path d="M11 13.5 13.5 20" />
      <path d="M11 13.5 8 19" />
      <path d="M12.6 9.6 16.5 11.5" />
    </Svg>
  );
}

export function Autocarro(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4" y="3.5" width="16" height="13.5" rx="2.5" />
      <path d="M4 10h16" />
      <path d="M7.5 20v-3M16.5 20v-3" />
      <circle cx="8" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Comboio(p: Props) {
  return (
    <Svg {...p}>
      <rect x="5" y="3" width="14" height="13" rx="3.5" />
      <path d="M5 10h14" />
      <path d="M9 16 6.5 20M15 16l2.5 4" />
      <circle cx="9" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Bicicleta(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9.5 8.5h4.5l4 8" />
      <path d="M9.5 8.5h5.5" />
    </Svg>
  );
}

/** O ponto de partida, como o ponto azul do mapa. */
export function Partida(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8" opacity="0.35" />
    </Svg>
  );
}

/** O destino, como o alfinete do mapa. */
export function Chegada(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 21.5S19 15 19 10a7 7 0 1 0-14 0c0 5 7 11.5 7 11.5z" />
      <circle cx="12" cy="10" r="2.4" />
    </Svg>
  );
}

export function Trocar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M7 20V4M7 4 4 7M7 4l3 3" />
      <path d="M17 4v16M17 20l-3-3M17 20l3-3" />
    </Svg>
  );
}

export function Fechar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M6 6 18 18M18 6 6 18" />
    </Svg>
  );
}

export function Relogio(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </Svg>
  );
}

export function Recarregar(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </Svg>
  );
}

/** Entre duas pernas do percurso. */
export function Seta(p: Props) {
  return (
    <Svg {...p}>
      <path d="m10 6 6 6-6 6" />
    </Svg>
  );
}

/** O ícone do modo, para o resumo de uma perna. */
/**
 * O ícone de um modo, venha o nome do motor de viagens ou da região.
 *
 * São dois vocabulários: o do GTFS, em maiúsculas (`WALK`, `RAIL`), que vem
 * nas pernas de um itinerário; e o da região (`autocarro`, `bicicleta`), que
 * vem da receita dela. Traduzir num sítio só poupa que cada chamador se
 * lembre de qual é qual.
 */
export function DoModo({ modo, tamanho }: { modo: string; tamanho?: number }) {
  const m = modo.toLowerCase();
  if (m === 'walk' || m === 'a-pe') return <APe tamanho={tamanho} />;
  if (['rail', 'subway', 'tram', 'comboio', 'metro'].includes(m))
    return <Comboio tamanho={tamanho} />;
  if (m === 'bicycle' || m === 'bicicleta') return <Bicicleta tamanho={tamanho} />;
  if (m === 'a-pedido') return <APedido tamanho={tamanho} />;
  if (m === 'taxi') return <Taxi tamanho={tamanho} />;
  return <Autocarro tamanho={tamanho} />;
}

/** O transporte a pedido: um autocarro com um telefone, porque é isso que é. */
export function APedido(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 5h11v8H4z" />
      <path d="M4 9h11" />
      <circle cx="7" cy="16" r="1.4" />
      <circle cx="12" cy="16" r="1.4" />
      <path d="M17.5 14.5a4.5 4.5 0 0 0 4.5-4.5M17.5 11.5A1.5 1.5 0 0 0 19 10" />
    </Svg>
  );
}

/** O táxi: um carro com o letreiro em cima. */
export function Taxi(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 13h18v5H3z" />
      <path d="M5 13l2-4h10l2 4" />
      <circle cx="7.5" cy="18.5" r="1.4" />
      <circle cx="16.5" cy="18.5" r="1.4" />
      <path d="M9 6h6v3H9z" />
    </Svg>
  );
}

/** Três traços. O menu que toda a gente já sabe abrir. */
export function Hamburguer(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}
