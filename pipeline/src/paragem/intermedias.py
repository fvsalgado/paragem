"""As paragens que o papel não escreve.

Num percurso interurbano, o caderno de horários marca a hora em cerca de um
terço dos pontos. As outras existem — o autocarro pára lá — e um feed que as
deixe de fora diz a quem mora numa delas que não há transporte.

Quem as sabe é a sequência do levantamento que a viagem alinhou. Este módulo
percorre cada par de paragens consecutivas do papel, vai buscar o que está
entre elas na sequência, e decide se entra. **Por segmento, e com a decisão
escrita**: é a diferença entre um feed que se audita e um feed em que se
acredita.

## O que entra sem hora, e porquê

Uma paragem intermédia entra com `timepoint=0` e as horas em branco. Podia-se
interpolar e escrever uma hora certinha; seria inventar. O que se guarda é uma
estimativa interna — para ordenar e para detetar disparates — que **não vai
para o feed**. O motor de viagens e o sítio interpolam, e aí a estimativa é
deles e não nossa.

## Os três travões

1. **Os tempos têm de bater certo.** Se o papel demora dez minutos entre duas
   paragens e o levantamento demora quarenta, não estamos a falar do mesmo
   percurso: não se herda nada.
2. **Nada de segmentos enormes.** Mais de 25 pontos entre duas paragens do
   papel quer dizer que os extremos foram localizados no sítio errado.
3. **Nada de duplicar.** Uma intermédia a menos de 100 m de uma paragem que o
   papel já marca é a mesma paragem com outro nome.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .geo import metros

SEM_ALINHAMENTO = "viagem sem alinhamento no levantamento"
EXTREMO_NAO_LOCALIZADO = "extremo do segmento não localizado na viagem do levantamento"
ORDEM_INVERSA = "ordem inversa na viagem do levantamento"
SEM_PONTOS = "sem pontos intermédios no levantamento"


@dataclass(frozen=True)
class Parametros:
    razao_de_tempos: float = 2.5
    diferenca_tolerada_s: int = 300
    pontos_por_segmento: int = 25
    raio_de_duplicado_m: float = 100
    raio_para_localizar_m: float = 150


@dataclass
class Ponto:
    nome: str
    id: str
    nome_oficial: str
    lat: float
    lon: float
    chegada: str = ""
    partida: str = ""
    origem: str = "pdf"
    marcada: bool = True
    tempo_estimado: str = ""


@dataclass
class ViagemCompleta:
    indice: int
    viagem: Any
    pontos: list[Ponto] = field(default_factory=list)
    omitidas: list[str] = field(default_factory=list)
    alinhada: str | None = None

    @property
    def intermedias(self) -> int:
        return sum(1 for p in self.pontos if p.origem == "intermedia")


def _segundos(hora: str | None) -> int:
    partes = (str(hora or "").split(":") + ["0", "0"])[:3]
    if not partes[0].strip().isdigit():
        return 0
    return int(partes[0]) * 3600 + int(partes[1]) * 60 + int(partes[2] or 0)


def _hms(segundos: float) -> str:
    x = int(round(segundos))
    return f"{x // 3600:02d}:{(x % 3600) // 60:02d}:{x % 60:02d}"


def _localizar(
    viagem: Any,
    decisoes: list[Any],
    sequencia: list[dict[str, Any]],
    pares: dict[int, str],
    universo: Any,
    par: Parametros,
) -> list[int | None]:
    """Onde é que cada paragem do papel está na sequência do levantamento.

    Pelo identificador quando a decisão escolheu um ponto dessa sequência;
    senão pelo par que o alinhamento fez, e só se a coordenada decidida ficar
    ali ao lado — um par com nomes parecidos e coordenadas a dois quilómetros
    não localiza nada.

    A procura é sempre PARA A FRENTE (`k > ultimo`): uma sequência que recua é
    uma sequência trocada, e herdar dela punha o percurso a fazer voltas que
    não faz.
    """
    ids = [p["id"] for p in sequencia]
    posicoes: list[int | None] = [None] * len(viagem.paragens)
    ultimo = -1
    for i, decisao in enumerate(decisoes):
        if decisao is None or not decisao.id:
            continue
        j = None
        if decisao.id in ids:
            j = next((k for k, x in enumerate(ids) if x == decisao.id and k > ultimo), None)
        if j is None and i in pares:
            k = next((k for k, x in enumerate(ids) if x == pares[i] and k > ultimo), None)
            if k is not None:
                aqui = universo[decisao.id]
                la = universo[ids[k]]
                if metros((aqui.lat, aqui.lon), (la.lat, la.lon)) <= par.raio_para_localizar_m:
                    j = k
        if j is not None:
            posicoes[i], ultimo = j, j
    return posicoes


def preencher(
    viagens: list[Any],
    alinhamentos: list[Any],
    resolucao: Any,
    sequencias: list[dict[str, Any]],
    parametros: Parametros | None = None,
) -> tuple[list[ViagemCompleta], list[dict[str, Any]]]:
    par = parametros or Parametros()
    universo = resolucao.universo
    por_id = {s["viagem"]: s["pontos"] for s in sequencias}
    completas: list[ViagemCompleta] = []
    segmentos: list[dict[str, Any]] = []

    for indice, viagem in enumerate(viagens):
        alinhamento = alinhamentos[indice] if indice < len(alinhamentos) else None
        sequencia = por_id.get(alinhamento.viagem) if alinhamento and alinhamento.alinhou else None
        decisoes = [resolucao.de(viagem.linha, p.nome) for p in viagem.paragens]
        pares = {i: ident for i, ident, _ in (alinhamento.pares if alinhamento else [])}
        vazias: list[int | None] = [None] * len(viagem.paragens)
        posicoes = (
            _localizar(viagem, decisoes, sequencia, pares, universo, par) if sequencia else vazias
        )
        coordenadas = [
            (universo[d.id].lat, universo[d.id].lon) if d and d.id else None for d in decisoes
        ]

        completa = ViagemCompleta(
            indice=indice,
            viagem=viagem,
            alinhada=alinhamento.viagem if alinhamento and alinhamento.alinhou else None,
        )
        for i, ponto_do_papel in enumerate(viagem.paragens):
            decisao = decisoes[i]
            if decisao is None or not decisao.id:
                completa.omitidas.append(ponto_do_papel.nome)
                continue
            paragem = universo[decisao.id]
            completa.pontos.append(
                Ponto(
                    nome=ponto_do_papel.nome,
                    id=decisao.id,
                    nome_oficial=paragem.nome,
                    lat=paragem.lat,
                    lon=paragem.lon,
                    chegada=ponto_do_papel.chegada or ponto_do_papel.partida,
                    partida=ponto_do_papel.partida or ponto_do_papel.chegada,
                    origem="pdf",
                    marcada=True,
                )
            )
            seguinte = next(
                (k for k in range(i + 1, len(viagem.paragens)) if decisoes[k] and decisoes[k].id),
                None,
            )
            if seguinte is None:
                continue
            entre, motivo = _do_segmento(
                viagem, sequencia, posicoes, i, seguinte, coordenadas, universo, par
            )
            completa.pontos.extend(entre)
            segmentos.append(
                {
                    "viagem": indice,
                    "linha": viagem.linha,
                    "de": ponto_do_papel.nome,
                    "para": viagem.paragens[seguinte].nome,
                    "n_intermedias": len(entre),
                    "decisao": "inseridas" if entre else "nenhuma",
                    "motivo": motivo or "",
                }
            )
        completas.append(completa)
    return completas, segmentos


def _do_segmento(
    viagem: Any,
    sequencia: list[dict[str, Any]] | None,
    posicoes: list[int | None],
    i: int,
    seguinte: int,
    coordenadas: list[tuple[float, float] | None],
    universo: Any,
    par: Parametros,
) -> tuple[list[Ponto], str | None]:
    if not sequencia:
        return [], SEM_ALINHAMENTO
    j1, j2 = posicoes[i], posicoes[seguinte]
    if j1 is None or j2 is None:
        return [], EXTREMO_NAO_LOCALIZADO
    if j2 <= j1:
        return [], ORDEM_INVERSA
    candidatas = sequencia[j1 + 1 : j2]
    if not candidatas:
        return [], SEM_PONTOS

    inicio = _segundos(viagem.paragens[i].partida or viagem.paragens[i].chegada)
    fim = _segundos(viagem.paragens[seguinte].chegada or viagem.paragens[seguinte].partida)
    duracao_papel = fim - inicio
    partida_da_sequencia = _segundos(sequencia[j1].get("hora_de_partida") or sequencia[j1]["hora"])
    duracao_sequencia = _segundos(sequencia[j2]["hora"]) - partida_da_sequencia
    if (
        duracao_papel > 0
        and duracao_sequencia > 0
        and (
            duracao_papel / duracao_sequencia > par.razao_de_tempos
            or duracao_sequencia / duracao_papel > par.razao_de_tempos
        )
        and abs(duracao_papel - duracao_sequencia) > par.diferenca_tolerada_s
    ):
        return [], (
            f"tempos incoerentes (papel {duracao_papel // 60} min, "
            f"levantamento {duracao_sequencia // 60} min)"
        )
    if len(candidatas) > par.pontos_por_segmento:
        return [], f"segmento com {len(candidatas)} pontos no levantamento, rejeitado"

    entre: list[Ponto] = []
    for ponto in candidatas:
        paragem = universo.get(ponto["id"])
        if paragem is None:
            continue
        if any(
            c and metros(c, (paragem.lat, paragem.lon)) <= par.raio_de_duplicado_m
            for c in coordenadas
        ):
            continue
        if duracao_sequencia > 0:
            posicao = (_segundos(ponto["hora"]) - partida_da_sequencia) / duracao_sequencia
            estimado = inicio + posicao * duracao_papel
        else:
            estimado = inicio
        entre.append(
            Ponto(
                nome=paragem.nome,
                id=ponto["id"],
                nome_oficial=paragem.nome,
                lat=paragem.lat,
                lon=paragem.lon,
                origem="intermedia",
                marcada=False,
                tempo_estimado=_hms(estimado),
            )
        )
    # As estimativas arredondam-se ao minuto, nunca recuam e nunca saem do
    # intervalo: são para ordenar e para dar erro quando algo estiver trocado.
    anterior = inicio
    for ponto_novo in entre:
        t = min(max(round(_segundos(ponto_novo.tempo_estimado) / 60) * 60, anterior), fim)
        ponto_novo.tempo_estimado = _hms(t)
        anterior = t
    return entre, None if entre else SEM_PONTOS
