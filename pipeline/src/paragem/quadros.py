"""O horário de uma linha, como o de papel: paragens nas linhas, viagens nas colunas.

A página da linha não tinha uma única hora — era a lista das paragens do
percurso mais servido —, e «qual é o horário da linha X?» não tinha resposta
no sítio: a única maneira de saber as horas era abrir paragem a paragem. As
viagens já cá estavam, são as mesmas que alimentam as páginas de paragem; o
que faltava era pô-las na forma em que um horário se lê.

**AS LINHAS DO QUADRO SÃO AS PARAGENS COM HORA MARCADA.** O caderno de horários
marca cerca de um terço das paragens; as outras têm a hora ESTIMADA por nós
(`timepoint=0`). Um quadro com todas seria três vezes mais comprido e diria
duas vezes mais horas inventadas do que publicadas. Entra no quadro a paragem
onde ALGUMA viagem do sentido tem hora marcada; nas viagens em que essa hora é
estimada, vai marcada como tal, e a página escreve-a em itálico. As paragens
todas continuam no percurso desenhado, que é outra pergunta.

**UM QUADRO POR SENTIDO, COM AS VARIANTES JUNTAS.** Uma linha tem percursos
que não passam em todas as paragens; um quadro por percurso era ilegível. As
sequências fundem-se numa só, pela ordem de todas (a supersequência comum mais
curta), e a viagem que não passa numa paragem tem lá um traço.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Hashable, Sequence
from dataclasses import dataclass, field
from typing import Any, TypeVar

K = TypeVar("K", bound=Hashable)


def com_ocorrencias(ids: Sequence[str]) -> list[tuple[str, int]]:
    """`[a, b, a]` → `[(a, 0), (b, 0), (a, 1)]`.

    Uma circular passa duas vezes no terminal — à partida e à chegada —, e são
    duas linhas do quadro, não uma: sem a ocorrência, a fusão juntava-as e a
    viagem perdia a hora de chegada.
    """
    vistas: Counter[str] = Counter()
    saida = []
    for i in ids:
        saida.append((i, vistas[i]))
        vistas[i] += 1
    return saida


def fundir(a: list[K], b: list[K]) -> list[K]:
    """A sequência mais curta que tem `a` e `b` lá dentro, cada uma pela sua ordem."""
    n, m = len(a), len(b)
    lcs = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            lcs[i][j] = lcs[i + 1][j + 1] + 1 if a[i] == b[j] else max(lcs[i + 1][j], lcs[i][j + 1])
    i = j = 0
    saida: list[K] = []
    while i < n and j < m:
        if a[i] == b[j]:
            saida.append(a[i])
            i += 1
            j += 1
        elif lcs[i + 1][j] >= lcs[i][j + 1]:
            saida.append(a[i])
            i += 1
        else:
            saida.append(b[j])
            j += 1
    return saida + a[i:] + b[j:]


def encaixar(sequencia: list[K], dentro: list[K]) -> list[int]:
    """Onde cada elemento de `sequencia` cai em `dentro`, da esquerda para a direita."""
    posicoes = []
    k = 0
    for x in sequencia:
        while k < len(dentro) and dentro[k] != x:
            k += 1
        if k == len(dentro):
            raise ValueError("a sequência não está contida na fusão")
        posicoes.append(k)
        k += 1
    return posicoes


@dataclass
class Passagem:
    paragem: str
    hora: str
    #: `False` quando a hora foi estimada por nós (`timepoint=0`).
    marcada: bool


@dataclass
class ViagemDoSentido:
    servico_id: str
    servico_nome: str
    destino: str
    passagens: list[Passagem] = field(default_factory=list)


def quadro_do_sentido(
    viagens: list[ViagemDoSentido], nome_da_paragem: dict[str, str]
) -> dict[str, Any]:
    """O quadro de um sentido: as paragens com hora marcada, e as horas de cada viagem.

    `horas[i]` é a hora da viagem na paragem `i` do quadro, ou `""` se não
    passa lá; `estimadas` são os índices em que a hora é nossa. As colunas vão
    pela hora de partida.
    """
    if not viagens:
        return {"paragens": [], "viagens": []}

    # As sequências pela frequência: a mais comum é a espinha, e as outras
    # encaixam-se nela — a fusão fica com a ordem que a maioria das viagens faz.
    contagem: Counter[tuple[tuple[str, int], ...]] = Counter(
        tuple(com_ocorrencias([p.paragem for p in v.passagens])) for v in viagens
    )
    fusao: list[tuple[str, int]] = []
    for sequencia, _ in contagem.most_common():
        fusao = fundir(fusao, list(sequencia))

    marcadas: set[int] = set()
    linhas_de: list[list[int]] = []
    for v in viagens:
        pos = encaixar(com_ocorrencias([p.paragem for p in v.passagens]), fusao)
        linhas_de.append(pos)
        marcadas.update(k for k, p in zip(pos, v.passagens, strict=True) if p.marcada)
    if not marcadas:
        # Nenhuma hora marcada em sentido nenhum: não há horário publicado a
        # mostrar, e um quadro só de estimativas seria pior do que nenhum.
        return {"paragens": [], "viagens": []}

    linhas = sorted(marcadas)
    indice = {k: i for i, k in enumerate(linhas)}
    saida_viagens = []
    for v, pos in zip(viagens, linhas_de, strict=True):
        horas = [""] * len(linhas)
        estimadas = []
        for k, p in zip(pos, v.passagens, strict=True):
            i = indice.get(k)
            if i is None or horas[i]:
                continue
            horas[i] = p.hora
            if not p.marcada:
                estimadas.append(i)
        if not any(horas):
            continue
        saida_viagens.append(
            {
                "servico_id": v.servico_id,
                "servico_nome": v.servico_nome,
                "destino": v.destino,
                "horas": horas,
                "estimadas": sorted(estimadas),
            }
        )
    saida_viagens.sort(key=lambda x: (next(h for h in x["horas"] if h), x["horas"]))
    return {
        "paragens": [
            {"id": fusao[k][0], "nome": nome_da_paragem.get(fusao[k][0], "")} for k in linhas
        ],
        "viagens": saida_viagens,
    }
