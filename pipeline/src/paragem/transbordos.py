"""OS TRANSBORDOS A PÉ, calculados pelo OTP e guardados numa tabela.

É aqui que o OpenTripPlanner deixa de ser um servidor e passa a ser uma
**ferramenta de construção**. A pergunta «quanto tempo se leva a pé desta
paragem para aquela» exige o grafo de ruas, que são 104 MB e não cabem num
telemóvel. Mas a RESPOSTA cabe: são 7 125 pares de paragens a menos de 400 m
um do outro, e um número por par.

Calcula-se uma vez por construção, na máquina que já tem o grafo, e viaja com
o resto. O planeador do navegador fica com transbordos à distância de rua, sem
saber o que é uma rua.

**O QUE FICA POR ADIVINHAR, e a interface tem de o dizer.** O primeiro e o
último troço — de onde a pessoa está até à primeira paragem — continuam a ser
uma estimativa em linha reta com um fator de desvio. Esses não se podem
pré-calcular, porque o ponto de partida é qualquer um.

**O FATOR DE DESVIO É MEDIDO, não inventado.** Compara-se o que o OTP responde
com a linha reta entre os mesmos dois pontos, nos milhares de pares que aqui
se calculam, e usa-se a mediana. É a melhor estimativa que se pode dar sem o
grafo — e sai escrita no relatório, para quem quiser discordar com dados.
"""

from __future__ import annotations

import json
import math
import statistics
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib import request

# A distância a que duas paragens são «a mesma paragem» para quem transborda.
# É o mesmo número do §6.4 e do `sitio.py`, pela mesma razão: 300 m é o que se
# anda sem pensar duas vezes. 400 dá margem para o desvio das ruas.
RAIO_METROS = 400

# Um transbordo que demore mais do que isto não é um transbordo — é uma
# caminhada, e quem viaja preferia esperar pelo autocarro seguinte.
TETO_SEGUNDOS = 15 * 60

# Quando o OTP não sabe responder — uma paragem sem rua por perto, uma ilha do
# grafo —, usa-se a linha reta a esta velocidade. É a velocidade de referência
# do próprio OTP para quem anda a pé.
METROS_POR_SEGUNDO = 1.33


def metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distância entre dois pontos, boa o suficiente a esta escala."""
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


@dataclass
class Resultado:
    pares: list[list[int]]
    fator_de_desvio: float
    pelo_motor: int
    em_linha_reta: int
    acima_do_teto: int


CONSULTA = (
    "{plan(from:{lat:%.6f,lon:%.6f},to:{lat:%.6f,lon:%.6f},"
    'date:"%s",time:"12:00",numItineraries:1,'
    "transportModes:[{mode:WALK}]){itineraries{duration walkDistance}}}"
)


def _a_pe(motor: str, a: tuple[float, float], b: tuple[float, float], dia: str) -> int | None:
    corpo = json.dumps({"query": CONSULTA % (a[0], a[1], b[0], b[1], dia)}).encode()
    req = request.Request(
        motor.rstrip("/") + "/otp/gtfs/v1",
        data=corpo,
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except Exception:  # noqa: BLE001 — uma falha é «não sei», e há reserva
        return None
    its = ((d.get("data") or {}).get("plan") or {}).get("itineraries") or []
    if not its:
        return None
    return int(its[0]["duration"])


def calcular(
    paragens: list[list[Any]],
    motor: str,
    dia: str,
    raio: int = RAIO_METROS,
    trabalhadores: int = 8,
) -> Resultado:
    """Todos os pares a menos de `raio`, com o tempo a pé que o OTP responder.

    A grelha de células evita comparar 4 850 paragens com 4 850 paragens, que
    seriam 11,7 milhões de pares para achar 7 mil.
    """
    pontos = [(p[1], p[2]) for p in paragens]
    celula: dict[tuple[int, int], list[int]] = {}
    for i, (la, lo) in enumerate(pontos):
        celula.setdefault((int(la * 111_320 // raio), int(lo * 85_000 // raio)), []).append(i)

    candidatos: list[tuple[int, int, float]] = []
    for (cy, cx), idxs in celula.items():
        vizinhos = [
            j for dy in (-1, 0, 1) for dx in (-1, 0, 1) for j in celula.get((cy + dy, cx + dx), ())
        ]
        for i in idxs:
            for j in vizinhos:
                if j <= i:
                    continue
                d = metros(pontos[i], pontos[j])
                if d <= raio:
                    candidatos.append((i, j, d))

    # SEM MOTOR TAMBÉM HÁ RESPOSTA, e é a linha reta.
    #
    # Isto não é um caso degradado a tolerar: é o contrato do §11.5. Uma região
    # nova entra sem uma linha de código, e a maior parte delas não vai ter um
    # grafo de ruas construído. Se o planeador só funcionasse onde há OTP, a
    # dependência que este ficheiro existe para cortar continuava lá, só que
    # escondida.
    #
    # O ficheiro diz quantos pares vieram de cada sítio, e a interface dirá o
    # que isso quer dizer.
    def um(c: tuple[int, int, float]) -> tuple[int, int, float, int | None]:
        i, j, d = c
        return i, j, d, (_a_pe(motor, pontos[i], pontos[j], dia) if motor else None)

    if motor:
        with ThreadPoolExecutor(max_workers=trabalhadores) as pool:
            respostas = list(pool.map(um, candidatos))
    else:
        respostas = [(i, j, d, None) for i, j, d in candidatos]

    pares: list[list[int]] = []
    fatores: list[float] = []
    pelo_motor = reta = acima = 0
    for i, j, d, seg in respostas:
        if seg is not None:
            pelo_motor += 1
            if d > 1:
                # O fator é sobre a DISTÂNCIA e não sobre o tempo: o tempo
                # depende da velocidade que o motor usa, e queremos poder
                # mudá-la sem refazer a medição.
                fatores.append(max(1.0, (seg * METROS_POR_SEGUNDO) / d))
        else:
            reta += 1
            seg = int(d / METROS_POR_SEGUNDO)
        if seg > TETO_SEGUNDOS:
            acima += 1
            continue
        pares.append([i, j, seg])

    return Resultado(
        pares=sorted(pares),
        # A MEDIANA E NÃO A MÉDIA. Um punhado de paragens em nós mal ligados do
        # OpenStreetMap dá fatores de 8 e 10, e a média puxada por eles fazia
        # a estimativa mentir para todos os outros.
        fator_de_desvio=round(statistics.median(fatores), 3) if fatores else 1.4,
        pelo_motor=pelo_motor,
        em_linha_reta=reta,
        acima_do_teto=acima,
    )


def escrever(destino: Path, r: Resultado, raio: int = RAIO_METROS) -> int:
    destino.parent.mkdir(parents=True, exist_ok=True)
    dados = {
        "campos": ["paragem_a", "paragem_b", "segundos"],
        # Guarda-se UM SENTIDO por par. A pé não há sentido único, e guardar os
        # dois dobrava o ficheiro para repetir o mesmo número.
        "simetrico": True,
        "raio_metros": raio,
        "fator_de_desvio": r.fator_de_desvio,
        # De onde veio cada número, para que a interface possa dizer a
        # verdade sobre a precisão do que mostra.
        "pelo_motor": r.pelo_motor,
        "em_linha_reta": r.em_linha_reta,
        "pares": r.pares,
    }
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    destino.write_text(texto + "\n", encoding="utf-8")
    return len(texto) + 1
